import { Router } from 'express';
import { z } from 'zod';
import { runValuation } from '../services/orchestrator.js';
import { getExchangeRate } from '../services/exchangeRate.js';

const querySchema = z.object({
  brand: z.string().min(1).max(60),
  model: z.string().min(1).max(80),
  year: z.coerce.number().int().min(1980).max(new Date().getFullYear() + 1),
  mileage: z.coerce.number().int().min(0).max(2_000_000).optional(),
  version: z.string().min(1).max(40).optional(),
  refresh: z.coerce.boolean().optional(),
  dollar: z.enum(['OFICIAL', 'BLUE', 'MEP']).optional(),
});

export const valuationRouter = Router();

valuationRouter.get('/valuation', async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Parámetros inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    const result = await runValuation(
      {
        brand: parsed.data.brand.trim(),
        model: parsed.data.model.trim(),
        year: parsed.data.year,
        mileage: parsed.data.mileage,
        version: parsed.data.version?.trim() || undefined,
      },
      { useCache: !parsed.data.refresh },
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Error interno' });
  }
});

valuationRouter.get('/dollar', async (_req, res) => {
  try {
    const info = await getExchangeRate();
    const [oficial, blue, mep] = await Promise.allSettled([
      getExchangeRate('OFICIAL'),
      getExchangeRate('BLUE'),
      getExchangeRate('MEP'),
    ]);
    res.json({
      selected: info,
      oficial: oficial.status === 'fulfilled' ? oficial.value : null,
      blue: blue.status === 'fulfilled' ? blue.value : null,
      mep: mep.status === 'fulfilled' ? mep.value : null,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Error interno' });
  }
});

const BRANDS = ['Toyota', 'Volkswagen', 'Ford', 'Chevrolet', 'Renault', 'Peugeot', 'Fiat', 'Honda', 'Nissan', 'Citroen', 'Jeep', 'Audi', 'BMW', 'Mercedes Benz', 'Kia', 'Hyundai'];

valuationRouter.get('/brands', (_req, res) => {
  res.json({ brands: BRANDS });
});
