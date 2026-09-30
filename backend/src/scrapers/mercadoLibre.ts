import * as cheerio from 'cheerio';
import type { CarDataSource, CarListing, SearchCriteria } from '../types.js';
import { config } from '../config.js';
import { fetchWithTimeout, withRetry, nowIso } from '../utils/http.js';
import {
  detectPriceType,
  extractMileage,
  extractVersion,
  extractYear,
  normalizeBrand,
  normalizeText,
} from '../services/normalizer.js';

function mapCurrency(raw?: string): 'ARS' | 'USD' {
  if (raw === 'USD' || raw === 'DOL' || raw === 'U$S') return 'USD';
  return 'ARS';
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Extract the first balanced {...} JSON object from a JS blob (string-aware, linear). */
export function extractBalancedJson(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Mercado Libre Argentina.
 * Strategy 1: public search API (often 403 nowadays).
 * Strategy 2: category HTML pages (autos.mercadolibre.com.ar) + embedded
 *             __NORDIC_RENDERING_CTX__ JSON (linear walk, no giant regexes).
 * Only strategy that works is used; failure never breaks the pipeline.
 */
export class MercadoLibreSource implements CarDataSource {
  name = 'Mercado Libre';

  async search(c: SearchCriteria): Promise<CarListing[]> {
    try {
      const api = await this.searchApi(c);
      if (api.length > 0) return api;
    } catch {
      /* fall through to HTML */
    }
    return this.searchHtml(c);
  }

  private async searchApi(c: SearchCriteria): Promise<CarListing[]> {
    const q = encodeURIComponent(c.broad ? `${c.brand} ${c.model}` : `${c.brand} ${c.model} ${c.year}`);
    const out: CarListing[] = [];
    const pages = Math.min(config.maxPagesPerSource, 4);
    for (let p = 0; p < pages; p++) {
      const url = `https://api.mercadolibre.com/sites/MLA/search?q=${q}&limit=50&offset=${p * 50}`;
      const res = await withRetry(() => fetchWithTimeout(url, config.requestTimeoutMs), 1, 300);
      if (!res.ok) throw new Error(`ML API ${res.status}`);
      const json = (await res.json()) as {
        results?: Array<{
          id: string;
          title: string;
          price: number;
          currency_id: string;
          permalink: string;
          attributes?: Array<{ id: string; value_name?: string | null }>;
        }>;
      };
      const results = json.results ?? [];
      if (results.length === 0) break;
      for (const r of results) {
        const attr = Object.fromEntries((r.attributes ?? []).map((a) => [a.id, a.value_name ?? '']));
        const year = Number.parseInt(String(attr['VEHICLE_YEAR'] ?? ''), 10) || extractYear(r.title) || 0;
        out.push({
          source: this.name,
          sourceId: r.id,
          title: r.title,
          brand: c.brand,
          model: c.model,
          version: extractVersion(r.title, c.brand, c.model),
          year,
          mileage: extractMileage(String(attr['VEHICLE_KILOMETERS'] ?? r.title)) ?? undefined,
          price: r.price,
          currency: mapCurrency(r.currency_id),
          priceType: detectPriceType(r.title, String(r.price)),
          conditionTag: 'UNKNOWN',
          sellerType: 'UNKNOWN',
          url: r.permalink,
          scrapedAt: nowIso(),
        });
        if (out.length >= config.maxListingsPerSource) break;
      }
      if (results.length < 50) break;
    }
    return out;
  }

  private async searchHtml(c: SearchCriteria): Promise<CarListing[]> {
    const b = slug(c.brand);
    const m = slug(c.model);
    // Exact phase: year-specific URL first, then model-level. Broad phase:
    // model-level only, with more pages to gather nearby-year comparables.
    const urls = c.broad
      ? [`https://autos.mercadolibre.com.ar/${b}/${m}`]
      : [`https://autos.mercadolibre.com.ar/${b}/${m}/${c.year}`, `https://autos.mercadolibre.com.ar/${b}/${m}`];
    const maxPages = c.broad ? Math.min(config.maxPagesBroad, 6) : Math.min(config.maxPagesPerSource, 3);
    const out: CarListing[] = [];
    for (const base of urls) {
      for (let p = 0; p < maxPages; p++) {
        const url = p === 0 ? base : `${base}_Desde_${p * 48 + 1}`;
        const res = await withRetry(() => fetchWithTimeout(url, config.requestTimeoutMs), 2, 600);
        if (!res.ok) break;
        const html = await res.text();
        const parsed = this.parseHtml(html, c);
        if (parsed.length === 0) break;
        out.push(...parsed);
        if (out.length >= config.maxListingsPerSource) break;
      }
      if (out.length >= 10) break;
    }
    return out.slice(0, config.maxListingsPerSource);
  }

  parseHtml(html: string, c: SearchCriteria): CarListing[] {
    return this.parseStructured(html, c);
  }

  /** Linear walk over the embedded rendering-context JSON. Card = { url, components[] }. */
  parseStructured(html: string, c: SearchCriteria): CarListing[] {
    const $ = cheerio.load(html);
    const raw = $('script#__NORDIC_RENDERING_CTX__').first().text();
    if (!raw) return [];
    const jsonText = extractBalancedJson(raw);
    if (!jsonText) return [];
    // Guard against pathological payloads
    if (jsonText.length > 15_000_000) return [];
    let root: unknown;
    try {
      root = JSON.parse(jsonText);
    } catch {
      return [];
    }
    const out: CarListing[] = [];
    let visited = 0;
    const walk = (node: unknown): void => {
      if (out.length >= 80 || visited++ > 400_000 || node == null) return;
      if (Array.isArray(node)) {
        for (const v of node) walk(v);
        return;
      }
      if (typeof node === 'object') {
        const o = node as Record<string, unknown>;
        // Real shape: results[i].polycard = { metadata: { url }, components: [...] }
        const meta = o['metadata'] as Record<string, unknown> | undefined;
        const comps = o['components'];
        const url = meta?.['url'];
        if (typeof url === 'string' && url.includes('MLA-') && Array.isArray(comps)) {
          const card = this.parseCard(url, comps, c);
          if (card) {
            out.push(card);
            return; // matched card: don't descend further
          }
        }
        for (const v of Object.values(o)) walk(v);
      }
    };
    walk(root);
    return out;
  }

  private parseCard(url: string, comps: unknown[], c: SearchCriteria): CarListing | null {
    let title = '';
    let price = 0;
    let currency = '';
    let texts = '';
    for (const comp of comps) {
      const o = comp as Record<string, Record<string, unknown>>;
      if (o['title'] && typeof o['title']['text'] === 'string') title = o['title']['text'] as string;
      const pr = o['price'] as Record<string, unknown> | undefined;
      const cur = pr?.['current_price'] as Record<string, unknown> | undefined;
      if (cur && typeof cur['value'] === 'number') {
        price = cur['value'] as number;
        currency = String(cur['currency'] ?? '');
      }
      const al = o['attributes_list'] as Record<string, unknown> | undefined;
      if (al && Array.isArray(al['texts'])) texts = (al['texts'] as unknown[]).map(String).join(' ');
    }
    if (!title || !(price > 0)) return null;
    const t = normalizeText(title);
    const brandOk =
      t.includes(normalizeBrand(c.brand)) || (normalizeBrand(c.brand) === 'volkswagen' && t.includes('vw'));
    if (!brandOk || !t.includes(normalizeText(c.model).split(' ')[0])) return null;
    const year = extractYear(`${texts} ${title}`) ?? 0;
    const mileage = extractMileage(`${texts} ${title}`) ?? undefined;
    const cleanUrl = url.replace(/\\/g, '');
    const idM = cleanUrl.match(/MLA-?(\d+)/);
    return {
      source: this.name,
      sourceId: idM ? `MLA${idM[1]}` : undefined,
      title,
      brand: c.brand,
      model: c.model,
      version: extractVersion(title, c.brand, c.model),
      year,
      mileage,
      price,
      currency: mapCurrency(currency),
      priceType: detectPriceType(title, ''),
      conditionTag: mileage != null && mileage <= 100 ? 'NEW_OR_NEAR_NEW' : 'UNKNOWN',
      sellerType: 'UNKNOWN',
      url: cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`,
      scrapedAt: nowIso(),
    };
  }
}
