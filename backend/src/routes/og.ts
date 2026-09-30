import { Router } from 'express';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtShortEs(n: number): string {
  if (n >= 1_000_000) {
    const m = (n / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '');
    return `$${m} M`;
  }
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}

/**
 * Dynamic OG image for WhatsApp shares: `GET /api/og?title=Fiat Cronos 2026&price=28900000`.
 * Returns a 1200x630 SVG (no dependencies, zero cost) with the valuation summary.
 */
export const ogRouter = Router();

ogRouter.get('/og', (req, res) => {
  const title = String(req.query.title ?? 'Cuánto vale mi auto').slice(0, 80);
  const priceRaw = Number(req.query.price);
  const price = Number.isFinite(priceRaw) && priceRaw > 0 ? fmtShortEs(priceRaw) : null;
  const range =
    req.query.min != null && req.query.max != null
      ? `${fmtShortEs(Number(req.query.min))} – ${fmtShortEs(Number(req.query.max))}`
      : null;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">` +
    `<rect width="1200" height="630" fill="#0f172a"/>` +
    `<rect x="60" y="60" width="1080" height="510" rx="28" fill="#1e293b"/>` +
    `<text x="120" y="200" font-family="Arial,sans-serif" font-size="44" fill="#94a3b8">Cuánto vale mi auto</text>` +
    `<text x="120" y="300" font-family="Arial,sans-serif" font-size="72" font-weight="bold" fill="#ffffff">${esc(title)}</text>` +
    (price
      ? `<text x="120" y="420" font-family="Arial,sans-serif" font-size="88" font-weight="bold" fill="#22c55e">${esc(price)}</text>`
      : ``) +
    (range
      ? `<text x="120" y="490" font-family="Arial,sans-serif" font-size="40" fill="#cbd5e1">Rango: ${esc(range)}</text>`
      : ``) +
    `</svg>`;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(svg);
});
