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
  parsePriceText,
} from '../services/normalizer.js';

/** Kavak Argentina: catalog JSON/HTML tolerant parser (precio de contado). */
export class KavakSource implements CarDataSource {
  name = 'Kavak';

  async search(c: SearchCriteria): Promise<CarListing[]> {
    const q = encodeURIComponent(c.broad ? `${c.brand} ${c.model}` : `${c.brand} ${c.model} ${c.year}`);
    const candidates = [`https://www.kavak.com/ar/usados?search=${q}`, `https://www.kavak.com/ar/usados?query=${q}`];
    for (const url of candidates) {
      try {
        const res = await withRetry(() => fetchWithTimeout(url, config.requestTimeoutMs), 2, 600);
        if (!res.ok) continue;
        const html = await res.text();
        const parsed = this.parse(html, c);
        if (parsed.length > 0) return parsed.slice(0, config.maxListingsPerSource);
      } catch {
        continue;
      }
    }
    return [];
  }

  parse(html: string, c: SearchCriteria): CarListing[] {
    const $ = cheerio.load(html);
    const out: CarListing[] = [];
    // Embedded JSON state (Next.js / API payloads)
    $('script#__NEXT_DATA__, script[type="application/json"]').each((_, el) => {
      if (out.length > 0) return;
      try {
        const raw = $(el).text();
        if (!raw || raw.length < 100) return;
        const matches = raw.match(/\{[^{}]*?(precio|price)[^{}]*?\}/gi);
        void matches;
        const parsed: unknown = JSON.parse(raw);
        this.walkJson(parsed, c, out);
      } catch {
        /* ignore */
      }
    });
    // JSON-LD
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed: unknown = JSON.parse($(el).text());
        this.walkJson(parsed, c, out);
      } catch {
        /* ignore */
      }
    });
    // Visible fallback: "Precio de contado"
    if (out.length === 0) {
      $('a, article, div').each((_, el) => {
        if (out.length >= 60) return;
        const $el = $(el);
        const text = $el.text();
        if (!/precio de contado/i.test(text)) return;
        const title = $el.find('h2,h3,h4').first().text().trim() || text.slice(0, 120);
        const m = text.match(/precio de contado\s*\$?\s*([\d\.\,]+)/i);
        if (!m) return;
        const { price, currency } = parsePriceText(m[1]);
        if (!price) return;
        const href = $el.attr('href') ?? $el.find('a').first().attr('href') ?? '';
        out.push({
          source: this.name,
          title: title.slice(0, 160),
          brand: c.brand,
          model: c.model,
          version: extractVersion(title, c.brand, c.model),
          year: extractYear(text) ?? c.year,
          mileage: extractMileage(text) ?? undefined,
          price,
          currency: currency ?? 'ARS',
          priceType: 'CASH',
          conditionTag: 'USED',
          url: href.startsWith('http') ? href : `https://www.kavak.com${href}`,
          sellerType: 'DEALER',
          scrapedAt: nowIso(),
        });
      });
    }
    return out;
  }

  private walkJson(node: unknown, c: SearchCriteria, out: CarListing[]): void {
    if (out.length >= 80 || node == null) return;
    if (Array.isArray(node)) {
      for (const v of node) this.walkJson(v, c, out);
      return;
    }
    if (typeof node === 'object') {
      const o = node as Record<string, unknown>;
      const name = (o['name'] ?? o['title'] ?? o['version']) as string | undefined;
      const price = (o['price'] ?? o['cashPrice'] ?? o['precio'] ?? o['precioContado']) as number | string | undefined;
      const url = (o['url'] ?? o['link'] ?? o['slug']) as string | undefined;
      if (typeof name === 'string' && price != null && (typeof url === 'string' || o['id'] != null)) {
        // Only accept cards that actually mention the requested brand+model (avoid nav/menu junk)
        const t = normalizeText(name);
        const brandOk =
          t.includes(normalizeBrand(c.brand)) || (normalizeBrand(c.brand) === 'volkswagen' && t.includes('vw'));
        const modelOk = t.includes(normalizeText(c.model).split(' ')[0]);
        if (brandOk && modelOk && name.length > 8) {
          const { price: p, currency } = parsePriceText(String(price));
          const year = extractYear(name + ' ' + JSON.stringify(o).slice(0, 300)) ?? 0;
          if (p && p > 1000 && year > 0) {
            out.push({
              source: this.name,
              sourceId: String(o['id'] ?? o['stockId'] ?? ''),
              title: name.slice(0, 160),
              brand: c.brand,
              model: c.model,
              version: extractVersion(name, c.brand, c.model),
              year,
              mileage: extractMileage(JSON.stringify(o).slice(0, 500)) ?? undefined,
              price: p,
              currency: currency ?? 'ARS',
              priceType: 'CASH',
              conditionTag: 'USED',
              url:
                typeof url === 'string' && url.startsWith('http')
                  ? url
                  : `https://www.kavak.com/ar/usados/${String(o['id'] ?? '')}`,
              sellerType: 'DEALER',
              scrapedAt: nowIso(),
            });
            return;
          }
        }
      }
      for (const v of Object.values(o)) this.walkJson(v, c, out);
    }
  }
}
