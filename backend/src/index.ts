import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { valuationRouter } from './routes/valuation.js';
import { ogRouter } from './routes/og.js';

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: [config.frontendOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

// Scraping-backed endpoints are expensive: tight per-IP budgets.
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: 'draft-7' });
const valuationLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: 'draft-7' });
app.use('/api/', apiLimiter);
app.use('/api/valuation', valuationLimiter);

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api', valuationRouter);
app.use('/api', ogRouter);
// Unknown /api paths: JSON 404 (must precede the SPA fallback below).
app.use('/api/', (_req, res) => res.status(404).json({ error: 'No encontrado' }));

// Production: serve the frontend bundle from the same origin (single-service deploy).
// backend/dist -> ../../frontend/dist. Skipped in dev (folder doesn't exist).
const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
const indexHtml = path.join(clientDir, 'index.html');
let indexTemplate: string | null = null;
if (fs.existsSync(indexHtml)) {
  indexTemplate = fs.readFileSync(indexHtml, 'utf8');
  // index:false so `/` also goes through the OG-injection route below instead of
  // being served directly by the static middleware.
  app.use(express.static(clientDir, { index: false }));
  // Inject per-search OG tags so WhatsApp/Twitter crawlers (no JS) get a real preview.
  app.get('*', (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    if (indexTemplate && q.brand && q.model && q.year) {
      const host = `${req.protocol}://${req.get('host')}`;
      const title = `${q.brand} ${q.model} ${q.year} — Cuánto vale mi auto`;
      const ogImage =
        `${host}/api/og?title=${encodeURIComponent(`${q.brand} ${q.model} ${q.year}`)}` +
        (q.price ? `&price=${encodeURIComponent(q.price)}` : '');
      const tags =
        `<meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />` +
        `<meta property="og:description" content="Valor estimado de mercado en Argentina." />` +
        `<meta property="og:image" content="${ogImage}" />`;
      res.send(indexTemplate.replace('</head>', `${tags}</head>`));
      return;
    }
    res.sendFile(indexHtml);
  });
}

app.listen(config.port, () => {
  console.log(`Backend listening on http://localhost:${config.port}`);
});
