const BRAND_ALIASES: Record<string, string> = {
  vw: 'volkswagen',
  chevy: 'chevrolet',
  mercedes: 'mercedes benz',
  'mercedes-benz': 'mercedes benz',
  benz: 'mercedes benz',
  bmw: 'bmw',
  fiat: 'fiat',
  ford: 'ford',
  renault: 'renault',
  peugeot: 'peugeot',
  toyota: 'toyota',
  honda: 'honda',
  nissan: 'nissan',
  citroen: 'citroen',
  jeep: 'jeep',
  audi: 'audi',
};

export function normalizeText(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeBrand(brand: string): string {
  const n = normalizeText(brand);
  return BRAND_ALIASES[n] ?? n;
}

export function listingMatchesCriteria(
  title: string,
  brand: string,
  model: string,
  year: number,
): { ok: boolean; reason?: string } {
  const t = normalizeText(title);
  const nb = normalizeBrand(brand);
  const nm = normalizeText(model);
  if (!t.includes(nb) && !(nb === 'volkswagen' && t.includes('vw'))) {
    return { ok: false, reason: 'brand-mismatch' };
  }
  const modelTokens = nm.split(' ').filter(Boolean);
  const firstToken = modelTokens[0];
  if (!firstToken || !t.includes(firstToken)) {
    return { ok: false, reason: 'model-mismatch' };
  }
  const years = Array.from(t.matchAll(/\b(19\d{2}|20[0-3]\d)\b/g)).map((m) => Number(m[1]));
  if (years.length > 0 && !years.includes(year)) {
    return { ok: false, reason: 'year-mismatch' };
  }
  return { ok: true };
}

export function extractYear(text: string): number | null {
  const m = text.match(/\b(19\d{2}|20[0-3]\d)\b/);
  if (!m) return null;
  const y = Number(m[1]);
  const now = new Date().getFullYear() + 1;
  if (y < 1980 || y > now) return null;
  return y;
}

export function extractMileage(text: string): number | null {
  const cleaned = text.toLowerCase().replace(/\u00a0/g, ' ');
  if (/\b(0\s?km|0km)\b/.test(cleaned)) return 0;
  const m = cleaned.match(/([\d\.\,]+)\s?(km|kms|kilometros|kilómetros)/);
  if (!m) return null;
  const digits = m[1].replace(/[^\d]/g, '');
  if (!digits) return null;
  const v = Number(digits);
  if (!Number.isFinite(v) || v < 0 || v > 2_000_000) return null;
  return v;
}

export function parsePriceText(raw: string): { price: number | null; currency: 'ARS' | 'USD' | null } {
  const text = raw.replace(/\u00a0/g, ' ').trim();
  const lower = text.toLowerCase();
  const isUsd = /(u\$s|usd|us\$|d[oó]lares|dollar)/i.test(text);
  const isArs = /(\$|ars|pesos|ar\$)/i.test(text);
  const digits = text.replace(/[^0-9]/g, '');
  if (!digits) return { price: null, currency: null };
  const price = Number(digits);
  if (!Number.isFinite(price) || price <= 0) return { price: null, currency: null };
  if (isUsd) return { price, currency: 'USD' };
  if (isArs || lower.includes('$')) return { price, currency: 'ARS' };
  return { price, currency: null };
}

const FINANCED_HINTS = ['cuota', 'anticipo', 'entrega', 'financiado', 'financiacion', 'mensual', 'por mes', '/mes'];
const CASH_HINTS = ['contado', 'precio total', 'precio de venta', 'precio final'];

export function detectPriceType(
  title: string,
  priceText: string,
): 'CASH' | 'FINANCED' | 'DOWN_PAYMENT' | 'INSTALLMENT' | 'UNKNOWN' {
  const t = normalizeText(`${title} ${priceText}`);
  if (t.includes('anticipo') || t.includes('entrega minima') || t.includes('entrega')) return 'DOWN_PAYMENT';
  if (t.includes('cuota') || t.includes('por mes') || t.includes('mensual')) return 'INSTALLMENT';
  if (t.includes('financiado') || t.includes('financiacion')) return 'FINANCED';
  if (CASH_HINTS.some((h) => t.includes(normalizeText(h)))) return 'CASH';
  if (FINANCED_HINTS.some((h) => t.includes(normalizeText(h)))) return 'FINANCED';
  return 'UNKNOWN';
}

export function looksLikePartialPrice(title: string, priceText: string): boolean {
  const type = detectPriceType(title, priceText);
  return type === 'DOWN_PAYMENT' || type === 'INSTALLMENT';
}

export function extractVersion(title: string, brand: string, model: string): string {
  const t = normalizeText(title);
  let rest = t.replace(normalizeText(brand), '').replace(normalizeText(model), '');
  rest = rest.replace(/\b(19\d{2}|20[0-3]\d)\b/g, '').trim();
  const tokens = rest
    .split(' ')
    .filter((w) => w.length > 1 && !/^\d+$/.test(w))
    .slice(0, 3);
  const v = tokens.join(' ').toUpperCase();
  return v || 'BASE';
}
