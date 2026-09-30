import { config } from '../config.js';

/**
 * In-memory valuation cache with TTL.
 *
 * Render free plan has an ephemeral filesystem, so the previous
 * better-sqlite3 `cache.db` was wiped on every restart/deploy.
 * A process-local Map survives for the lifetime of the instance,
 * costs nothing, and needs no native modules.
 */
const store = new Map<string, { payload: string; createdAt: number }>();

function ttlMs(): number {
  return config.cacheTtlMinutes * 60_000;
}

function prune(): void {
  const now = Date.now();
  const ttl = ttlMs();
  for (const [k, v] of store) {
    if (now - v.createdAt > ttl) store.delete(k);
  }
  // Bound memory: drop oldest entries past 500.
  if (store.size > 500) {
    const excess = store.size - 500;
    const keys = store.keys();
    for (let i = 0; i < excess; i++) {
      const k = keys.next().value;
      if (k === undefined) break;
      store.delete(k);
    }
  }
}

export function cacheGet(key: string): string | null {
  try {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > ttlMs()) {
      store.delete(key);
      return null;
    }
    return entry.payload;
  } catch {
    return null;
  }
}

export function cacheSet(key: string, payload: string): void {
  try {
    prune();
    store.set(key, { payload, createdAt: Date.now() });
  } catch {
    /* cache is best-effort */
  }
}

export function cacheKey(
  brand: string,
  model: string,
  year: number,
  mileage?: number,
  version?: string,
  condition?: string,
  dollarStrategy?: string,
): string {
  return `${brand.toLowerCase()}|${model.toLowerCase()}|${year}|${mileage ?? ''}|${(version ?? '').toLowerCase()}|${condition ?? ''}|${(dollarStrategy ?? 'OFICIAL').toUpperCase()}`;
}
