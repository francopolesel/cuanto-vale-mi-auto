import { median } from './statistics.js';

export interface MileageAdjustment {
  applied: boolean;
  slopePerKmARS: number;
  samples: number;
  reason: string;
}

/**
 * Normalize comparable prices to the requested mileage using a robust trend
 * (Theil-Sen slope of price on km, same-year window only).
 * Applied ONLY with >=15 samples with known km and a sane, negative slope:
 * a 100.000 km gap must move the price less than 35% of the median.
 * Otherwise prices pass through untouched.
 */
export function adjustPricesToMileage(
  items: { mileage: number; priceARS: number }[],
  requestedMileage: number,
): { adjusted: number[]; info: MileageAdjustment } {
  const known = items.filter((i) => i.mileage != null && i.mileage > 100 && i.priceARS > 0);
  const no = (reason: string): { adjusted: number[]; info: MileageAdjustment } => ({
    adjusted: items.map((i) => i.priceARS),
    info: { applied: false, slopePerKmARS: 0, samples: known.length, reason },
  });

  if (requestedMileage == null || requestedMileage <= 0) return no('Sin filtro de kilometraje.');
  if (known.length < 15) return no(`Solo ${known.length} comparables con km conocido (mínimo 15).`);

  const med = median(known.map((k) => k.priceARS));
  const slopes: number[] = [];
  for (let i = 0; i < known.length; i++) {
    for (let j = i + 1; j < known.length; j++) {
      const dkm = known[j].mileage - known[i].mileage;
      if (Math.abs(dkm) < 5000) continue;
      slopes.push((known[j].priceARS - known[i].priceARS) / dkm);
    }
  }
  if (slopes.length === 0) return no('Sin pares de km comparables.');
  const slope = median(slopes);
  if (!Number.isFinite(slope) || slope >= 0) return no('Tendencia km/precio no decreciente: no se ajusta.');
  if (Math.abs(slope) * 100_000 > 0.35 * med) {
    return no(`Pendiente ${slope.toFixed(2)} ARS/km descartada por inverosímil (>35% cada 100.000 km).`);
  }
  const adjusted = items.map((it) =>
    Math.max(1, Math.round(it.priceARS + slope * (requestedMileage - (it.mileage ?? requestedMileage)))),
  );
  return {
    adjusted,
    info: {
      applied: true,
      slopePerKmARS: Math.round(slope * 1000) / 1000,
      samples: known.length,
      reason: `Tendencia robusta sobre ${known.length} comparables: ${slope.toFixed(2)} ARS/km.`,
    },
  };
}
