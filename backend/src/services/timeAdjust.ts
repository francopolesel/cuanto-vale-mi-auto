import { median } from './statistics.js';

export interface TimeAdjustment {
  applied: boolean;
  slopePerYearARS: number;
  yearsUsed: number[];
  reason: string;
}

/**
 * Normalize comparable prices to the requested year using a robust trend.
 * Theil-Sen estimator over yearly medians (resistant to outlier years).
 * Applied ONLY with >=3 year-groups of >=4 samples each and a sane slope
 * (|slope| <= 40% of global median per year). Otherwise prices pass through.
 */
export function adjustPricesToYear(
  items: { year: number; priceARS: number }[],
  requestedYear: number,
): { adjusted: number[]; info: TimeAdjustment } {
  const byYear = new Map<number, number[]>();
  for (const it of items) {
    if (!byYear.has(it.year)) byYear.set(it.year, []);
    byYear.get(it.year)!.push(it.priceARS);
  }
  const medians = [...byYear.entries()]
    .filter(([, v]) => v.length >= 4)
    .map(([y, v]) => ({ year: y, median: median(v) }))
    .sort((a, b) => a.year - b.year);

  const yearsUsed = [...byYear.keys()].sort();
  const no = (reason: string): { adjusted: number[]; info: TimeAdjustment } => ({
    adjusted: items.map((i) => i.priceARS),
    info: { applied: false, slopePerYearARS: 0, yearsUsed, reason },
  });

  if (medians.length < 3) return no(`Solo ${medians.length} año(s) con muestra suficiente para estimar tendencia.`);
  const globalMedian = median(medians.map((m) => m.median));
  const slopes: number[] = [];
  for (let i = 0; i < medians.length; i++) {
    for (let j = i + 1; j < medians.length; j++) {
      slopes.push((medians[j].median - medians[i].median) / (medians[j].year - medians[i].year));
    }
  }
  const slope = median(slopes);
  if (!Number.isFinite(slope)) return no('Tendencia no computable.');
  if (Math.abs(slope) > 0.4 * globalMedian) {
    return no(`Tendencia ${Math.round(slope)} ARS/año descartada por inverosímil (>40% de la mediana por año).`);
  }
  const adjusted = items.map((it) => Math.max(1, Math.round(it.priceARS + slope * (requestedYear - it.year))));
  return {
    adjusted,
    info: {
      applied: true,
      slopePerYearARS: Math.round(slope),
      yearsUsed,
      reason: `Tendencia robusta (Theil-Sen) sobre medianas de ${medians.length} años: ${slope >= 0 ? '+' : ''}${Math.round(slope)} ARS/año.`,
    },
  };
}
