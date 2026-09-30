export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function nowIso(): string {
  return new Date().toISOString();
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

/** Rotates User-Agent per request so a single fingerprint doesn't get throttled by listing sites. */
function pickUserAgent(): string {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  return ua ?? (USER_AGENTS[0] as string);
}

export function defaultHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'User-Agent': pickUserAgent(),
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-AR,es;q=0.9,en;q=0.7',
    ...extra,
  };
}

export async function fetchWithTimeout(url: string, timeoutMs: number, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      headers: { ...defaultHeaders(), ...(init.headers ?? {}) },
      signal: ctrl.signal,
      redirect: 'follow',
    });
  } finally {
    clearTimeout(t);
  }
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 600): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts - 1) await sleep(delayMs);
    }
  }
  throw last;
}

export function safeNumber(n: unknown): number | null {
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) return n;
  return null;
}
