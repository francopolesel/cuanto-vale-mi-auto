import { describe, expect, it } from 'vitest';
import { AutocosmosSource } from './scrapers/autocosmos.js';
import { KavakSource } from './scrapers/kavak.js';
import { DeMotoresSource } from './scrapers/demotores.js';
import { MercadoLibreSource } from './scrapers/mercadoLibre.js';
import { readFileSync } from 'node:fs';

const criteria = { brand: 'Toyota', model: 'Corolla', year: 2020 };

describe('scraper fixtures HTML -> CarListing', () => {
  it('autocosmos parses JSON-LD', () => {
    const html = readFileSync(new URL('../fixtures/autocosmos.html', import.meta.url), 'utf8');
    const out = new AutocosmosSource().parse(html, criteria);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].price).toBeGreaterThan(0);
  });
  it('kavak parses contado', () => {
    const html = readFileSync(new URL('../fixtures/kavak.html', import.meta.url), 'utf8');
    const out = new KavakSource().parse(html, criteria);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].priceType).toBe('CASH');
  });
  it('demotores parses cards', () => {
    const html = readFileSync(new URL('../fixtures/demotores.html', import.meta.url), 'utf8');
    const out = new DeMotoresSource().parse(html, criteria);
    expect(out.length).toBeGreaterThan(0);
  });
  it('mercadolibre parses embedded preloaded JSON', () => {
    const html = readFileSync(new URL('../fixtures/mercadolibre.html', import.meta.url), 'utf8');
    const out = new MercadoLibreSource().parseHtml(html, criteria);
    expect(out.length).toBe(2);
    expect(out[0].currency).toBe('USD');
    expect(out[0].price).toBe(19500);
    expect(out[0].year).toBe(2020);
    expect(out[0].mileage).toBe(73000);
    expect(out[0].sourceId).toBe('MLA3995200354');
    expect(out[0].url).toContain('MLA-3995200354');
    expect(out[1].currency).toBe('ARS');
  });
});
