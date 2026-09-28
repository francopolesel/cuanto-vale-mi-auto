import * as cheerio from 'cheerio';
import type { CarDataSource, CarListing, SearchCriteria } from '../types.js';
import { config } from '../config.js';
import { fetchWithTimeout, withRetry, nowIso } from '../utils/http.js';
import { detectPriceType, extractMileage, extractVersion, extractYear, parsePriceText } from '../services/normalizer.js';

/** DeMotores (portal argentino de clasificados). Parser HTML tolerante. */
export class DeMotoresSource implements CarDataSource {
  name = 'DeMotores';

  async search(c: SearchCriteria): Promise<CarListing[]> {
    const q = encodeURIComponent(c.broad ? `${c.brand} ${c.model}` : `${c.brand} ${c.model} ${c.year}`);
    const urls = [
      `https://www.demotores.com.ar/autos-usados?palabra=${q}`,
      `https://www.demotores.com.ar/resultados?palabra=${q}`,
    ];
    const out: CarListing[] = [];
    for (const url of urls) {
      try {
        const res = await withRetry(() => fetchWithTimeout(url, config.requestTimeoutMs), 2, 600);
        if (!res.ok) continue;
        out.push(...this.parse(await res.text(), c));
        if (out.length >= 10) break;
      } catch {
        continue;
      }
    }
    return out.slice(0, config.maxListingsPerSource);
  }

  parse(html: string, c: SearchCriteria): CarListing[] {
    const $ = cheerio.load(html);
    const out: CarListing[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed: unknown = JSON.parse($(el).text());
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        for (const e of arr as Record<string, unknown>[]) {
          const name = String(e['name'] ?? '');
          const offers = e['offers'] as Record<string, unknown> | undefined;
          const priceRaw = String(offers?.['price'] ?? e['price'] ?? '');
          if (!name || !priceRaw) continue;
          const { price, currency } = parsePriceText(priceRaw);
          if (!price) continue;
          out.push({
            source: this.name,
            title: name.slice(0, 160),
            brand: c.brand,
            model: c.model,
            version: extractVersion(name, c.brand, c.model),
            year: extractYear(name) ?? 0,
            mileage: extractMileage(name) ?? undefined,
            price,
            currency: currency ?? 'ARS',
            priceType: detectPriceType(name, priceRaw),
            conditionTag: 'UNKNOWN',
            url: String(e['url'] ?? ''),
            sellerType: 'UNKNOWN',
            scrapedAt: nowIso(),
          });
        }
      } catch {
        /* ignore */
      }
    });
    if (out.length === 0) {
      $('a[href*="/auto"], article, div[class*="item"], div[class*="card"]').each((_, el) => {
        if (out.length >= 60) return;
        const $el = $(el);
        const title = $el.find('h2,h3,[class*="title"]').first().text().trim();
        const priceText = $el.find('[class*="price"],[class*="precio"]').first().text().trim();
        const href = $el.attr('href') ?? $el.find('a').first().attr('href') ?? '';
        if (!title || !priceText || !href) return;
        const { price, currency } = parsePriceText(priceText);
        if (!price) return;
        out.push({
          source: this.name,
          title: title.slice(0, 160),
          brand: c.brand,
          model: c.model,
          version: extractVersion(title, c.brand, c.model),
          year: extractYear($el.text()) ?? 0,
          mileage: extractMileage($el.text()) ?? undefined,
          price,
          currency: currency ?? 'ARS',
          priceType: detectPriceType(title, priceText),
          conditionTag: 'UNKNOWN',
          url: href.startsWith('http') ? href : `https://www.demotores.com.ar${href}`,
          sellerType: 'UNKNOWN',
          scrapedAt: nowIso(),
        });
      });
    }
    return out;
  }
}
