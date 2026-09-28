import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { valuationRouter } from './routes/valuation.js';

const app = express();
app.use(cors({ origin: [config.frontendOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api', valuationRouter);

// Production: serve the frontend bundle from the same origin (single-service deploy).
// backend/dist -> ../../frontend/dist. Skipped in dev (folder doesn't exist).
const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
if (fs.existsSync(path.join(clientDir, 'index.html'))) {
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
}

app.listen(config.port, () => {
  console.log(`Backend listening on http://localhost:${config.port}`);
});
