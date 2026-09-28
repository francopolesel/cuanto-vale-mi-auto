import * as cheerio from 'cheerio';
import type { CarDataSource, CarListing, SearchCriteria } from '../types.js';
import { config } from '../config.js';
import { fetchWithTimeout, withRetry, nowIso } from '../utils/http.js';
import { detectPriceType, extractMileage, extractVersion, extractYear, parsePriceText } from '../services/normalizer.js';

/**
 * Autocosmos: HTML listing pages + JSON-LD first, HTML fallback.
 * Search URL pattern (usados): https://www.autocosmos.com.ar/autos-usados?buscar=<q>
 */
export class AutocosmosSource implements CarDataSource {
  name = 'Autocosmos';

  async search(c: SearchCriteria): Promise<CarListing[]> {
    const q = encodeURIComponent(c.broad ? `${c.brand} ${c.model}` : `${c.brand} ${c.model} ${c.year}`);
    const urls = [
      `https://www.autocosmos.com.ar/autos-usados?buscar=${q}`,
      `https://www.autocosmos.com.ar/catalogo/${c.year}/${c.brand.toLowerCase()}/${c.model.toLowerCase()}`,
    ];
    const out: CarListing[] = [];
    for (const url of urls) {
      try {
        const res = await withRetry(() => fetchWithTimeout(url, config.requestTimeoutMs), 2, 600);
        if (!res.ok) continue;
        const html = await res.text();
        out.push(...this.parse(html, c));
        if (out.length >= 10) break;
      } catch {
        continue;
      }
      if (out.length >= config.maxListingsPerSource) break;
    }
    return out.slice(0, config.maxListingsPerSource);
  }

  parse(html: string, c: SearchCriteria): CarListing[] {
    const $ = cheerio.load(html);
    const out: CarListing[] = [];
    // Strategy 1: JSON-LD Car/Product items
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const raw = $(el).text();
        const parsed: unknown = JSON.parse(raw);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const it of items as Record<string, unknown>[]) {
          const list = it['@graph'] ?? it['itemListElement'] ?? it;
          const arr = Array.isArray(list) ? list : [list];
          for (const e of arr as Record<string, unknown>[]) {
            const type = String(e['@type'] ?? '');
            if (!/car|vehicle|product/i.test(type)) continue;
            const name = String(e['name'] ?? '');
            const offers = e['offers'] as Record<string, unknown> | undefined;
            const priceRaw = String(offers?.['price'] ?? e['price'] ?? '');
            const url = String(e['url'] ?? '');
            if (!name || !priceRaw) continue;
            const { price, currency } = parsePriceText(priceRaw + (String(offers?.['priceCurrency'] ?? '').includes('USD') ? ' USD' : ' $'));
            if (!price) continue;
            const year = extractYear(name) ?? 0;
            out.push({
              source: this.name,
              title: name,
              brand: c.brand,
              model: c.model,
              version: extractVersion(name, c.brand, c.model),
              year,
              mileage: extractMileage(name) ?? undefined,
              price,
              currency: currency ?? 'ARS',
              priceType: detectPriceType(name, priceRaw),
              conditionTag: 'UNKNOWN',
              url: url.startsWith('http') ? url : `https://www.autocosmos.com.ar${url}`,
              sellerType: 'UNKNOWN',
              scrapedAt: nowIso(),
            });
          }
        }
      } catch {
        /* ignore malformed ld+json */
      }
    });
    // Strategy 2: generic card fallback (tolerant selectors)
    if (out.length === 0) {
      $('a[href*="usado"], a[href*="auto"], article, div[class*="card"], li[class*="result"]').each((_, el) => {
        if (out.length >= 60) return;
        const $el = $(el);
        const title = $el.find('h2, h3, [class*="title"], [class*="name"]').first().text().trim() || $el.text().slice(0, 120);
        const priceText = $el.find('[class*="price"], [class*="precio"], b, strong').first().text().trim();
        const href = $el.attr('href') ?? $el.find('a').first().attr('href') ?? '';
        if (!title || !priceText || !href) return;
        const { price, currency } = parsePriceText(priceText);
        if (!price) return;
        const year = extractYear($el.text()) ?? 0;
        out.push({
          source: this.name,
          title: title.slice(0, 160),
          brand: c.brand,
          model: c.model,
          version: extractVersion(title, c.brand, c.model),
          year,
          mileage: extractMileage($el.text()) ?? undefined,
          price,
          currency: currency ?? 'ARS',
          priceType: detectPriceType(title, priceText),
          conditionTag: 'UNKNOWN',
          url: href.startsWith('http') ? href : `https://www.autocosmos.com.ar${href}`,
          sellerType: 'UNKNOWN',
          scrapedAt: nowIso(),
        });
      });
    }
    return out;
  }
}
