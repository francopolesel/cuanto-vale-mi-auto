import Database from 'better-sqlite3';
import { config } from '../config.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database('cache.db');
    db.exec(`CREATE TABLE IF NOT EXISTS valuations (
      key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`);
  }
  return db;
}

export function cacheGet(key: string): string | null {
  try {
    const row = getDb().prepare('SELECT payload, created_at FROM valuations WHERE key = ?').get(key) as
      | { payload: string; created_at: number }
      | undefined;
    if (!row) return null;
    const ageMs = Date.now() - row.created_at;
    if (ageMs > config.cacheTtlMinutes * 60_000) {
      getDb().prepare('DELETE FROM valuations WHERE key = ?').run(key);
      return null;
    }
    return row.payload;
  } catch {
    return null;
  }
}

export function cacheSet(key: string, payload: string): void {
  try {
    getDb().prepare('INSERT OR REPLACE INTO valuations (key, payload, created_at) VALUES (?, ?, ?)').run(key, payload, Date.now());
  } catch {
    /* cache is best-effort */
  }
}

export function cacheKey(brand: string, model: string, year: number): string {
  return `${brand.toLowerCase()}|${model.toLowerCase()}|${year}`;
}
