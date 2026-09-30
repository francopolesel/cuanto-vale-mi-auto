import { config } from '../config.js';
import type { ExchangeRateInfo } from '../types.js';
import { fetchWithTimeout, withRetry } from '../utils/http.js';

let cache: Map<string, { info: ExchangeRateInfo; expiresAt: number }> = new Map();

async function fetchDolarApi(tipo: string): Promise<number | null> {
  const res = await fetchWithTimeout(`https://dolarapi.com/v1/dolares/${tipo}`, config.requestTimeoutMs);
  if (!res.ok) return null;
  const json = (await res.json()) as { venta?: number; compra?: number };
  const v = Number(json.venta ?? json.compra);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export async function getExchangeRate(strategy?: string): Promise<ExchangeRateInfo> {
  const strat = (strategy ?? config.dollarStrategy).toUpperCase();
  const cached = cache.get(strat);
  if (cached && Date.now() < cached.expiresAt) return cached.info;

  const order =
    strat === 'BLUE'
      ? ['blue', 'oficial', 'bolsa']
      : strat === 'MEP'
        ? ['bolsa', 'mep', 'oficial', 'blue']
        : ['oficial', 'mayorista', 'bolsa', 'blue'];
  // dolarapi exposes: oficial, blue, bolsa, contadoconliqui, mayorista, etc.
  const tried: string[] = [];
  for (const tipo of order) {
    try {
      const v = await withRetry(() => fetchDolarApi(tipo), 2, 400);
      tried.push(tipo);
      if (v) {
        const info: ExchangeRateInfo = {
          source: `dolarapi:${tipo}`,
          strategy: strat,
          arsPerUsd: v,
          fetchedAt: new Date().toISOString(),
          fallback: false,
        };
        cache.set(strat, { info, expiresAt: Date.now() + config.cacheTtlMinutes * 60_000 });
        return info;
      }
    } catch {
      tried.push(tipo + ':error');
    }
  }
  const stale = cache.get(strat);
  if (stale) return { ...stale.info, fallback: true };
  // Last resort: stale hardcoded-ish fallback clearly flagged (never silent)
  const info: ExchangeRateInfo = {
    source: 'fallback-estatico',
    strategy: strat,
    arsPerUsd: 1000,
    fetchedAt: new Date().toISOString(),
    fallback: true,
  };
  return info;
}

export function convertToARS(price: number, currency: 'ARS' | 'USD', rate: number): number {
  return currency === 'USD' ? Math.round(price * rate) : Math.round(price);
}
