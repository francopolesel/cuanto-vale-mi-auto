export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const v = sorted[base];
  const next = sorted[base + 1];
  return next !== undefined ? v + rest * (next - v) : v;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return quantile(s, 0.5);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function trimmedMean(values: number[], trimRatio = 0.1): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const k = Math.floor(s.length * trimRatio);
  const sliced = s.slice(k, s.length - k || s.length);
  return mean(sliced.length ? sliced : s);
}

export function weightedMean(values: number[], weights: number[]): number {
  const wSum = weights.reduce((a, b) => a + b, 0);
  if (wSum <= 0 || values.length === 0) return 0;
  return values.reduce((acc, v, i) => acc + v * (weights[i] ?? 0), 0) / wSum;
}

/** Weighted quantile: first value where cumulative weight reaches q * total. */
export function weightedQuantile(values: number[], weights: number[], q: number): number {
  if (values.length === 0) return 0;
  const pairs = values
    .map((v, i) => ({ v, w: weights[i] ?? 0 }))
    .filter((p) => p.w > 0)
    .sort((a, b) => a.v - b.v);
  if (pairs.length === 0) return 0;
  const total = pairs.reduce((a, p) => a + p.w, 0);
  const target = q * total;
  let acc = 0;
  for (const p of pairs) {
    acc += p.w;
    if (acc >= target) return p.v;
  }
  return pairs[pairs.length - 1].v;
}

export function weightedMedian(values: number[], weights: number[]): number {
  return weightedQuantile(values, weights, 0.5);
}

/** IQR-based outlier removal. Falls back to MAD when IQR is 0. */
export function removeOutliers(values: number[]): { kept: number[]; outliers: number } {
  if (values.length < 8) return { kept: [...values], outliers: 0 };
  const s = [...values].sort((a, b) => a - b);
  const q1 = quantile(s, 0.25);
  const q3 = quantile(s, 0.75);
  const iqr = q3 - q1;
  if (iqr > 0) {
    const lo = q1 - 1.5 * iqr;
    const hi = q3 + 1.5 * iqr;
    const kept = values.filter((v) => v >= lo && v <= hi);
    return { kept, outliers: values.length - kept.length };
  }
  // MAD fallback
  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med))) || 1;
  const kept = values.filter((v) => Math.abs(v - med) / mad < 6);
  return { kept, outliers: values.length - kept.length };
}

export interface FullStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  trimmedMean: number;
  stdDev: number;
  q1: number;
  q3: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  rawMin: number;
  rawMax: number;
}

export function computeStats(clean: number[], raw: number[]): FullStats | null {
  if (clean.length === 0) return null;
  const s = [...clean].sort((a, b) => a - b);
  return {
    count: clean.length,
    min: s[0],
    max: s[s.length - 1],
    mean: Math.round(mean(clean)),
    median: Math.round(median(clean)),
    trimmedMean: Math.round(trimmedMean(clean)),
    stdDev: Math.round(stdDev(clean)),
    q1: Math.round(quantile(s, 0.25)),
    q3: Math.round(quantile(s, 0.75)),
    p10: Math.round(quantile(s, 0.1)),
    p25: Math.round(quantile(s, 0.25)),
    p50: Math.round(quantile(s, 0.5)),
    p75: Math.round(quantile(s, 0.75)),
    p90: Math.round(quantile(s, 0.9)),
    rawMin: raw.length ? Math.min(...raw) : 0,
    rawMax: raw.length ? Math.max(...raw) : 0,
  };
}
