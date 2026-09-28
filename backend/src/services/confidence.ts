import type { FullStats } from './statistics.js';

/**
 * Confidence is an OUTPUT, never a gate: even LOW confidence ships an estimate.
 * INSUFFICIENT only when there is genuinely nothing usable.
 */
export function confidenceLevel(params: {
  comparables: number;
  effectiveWeight: number;
  exactCount: number;
  nearbyShare: number;
  sourcesOk: number;
  stats: FullStats | null;
  outlierRatio: number;
  discardRatio: number;
  missingMileageShare: number;
}): { level: 'ALTA' | 'MEDIA' | 'BAJA' | 'INSUFICIENTE'; score: number; explanation: string[] } {
  const { comparables, effectiveWeight, exactCount, nearbyShare, sourcesOk, stats, outlierRatio, discardRatio, missingMileageShare } = params;
  const explanation: string[] = [];

  if (comparables < 5 || effectiveWeight < 3 || !stats) {
    return {
      level: 'INSUFICIENTE',
      score: 0,
      explanation: [
        `Solo ${comparables} comparables (peso efectivo ${effectiveWeight.toFixed(1)}): sin base mínima ni siquiera con años cercanos y variantes.`,
      ],
    };
  }

  let score = 0;
  // Effective sample (0-35): sum of weights matters more than raw count
  if (effectiveWeight >= 50) score += 35;
  else if (effectiveWeight >= 25) score += 28;
  else if (effectiveWeight >= 12) score += 20;
  else if (effectiveWeight >= 5) score += 12;
  else score += 6;
  explanation.push(`${comparables} comparables (peso efectivo ${effectiveWeight.toFixed(1)}), ${exactCount} exactos.`);

  // Exact-match share (0-15)
  const exactShare = comparables > 0 ? exactCount / comparables : 0;
  if (exactShare >= 0.5) {
    score += 15;
    explanation.push('Buena proporción de coincidencias exactas del año solicitado.');
  } else if (nearbyShare >= 0.5) {
    score += 10;
    explanation.push('Mayoría de años cercanos: estimación apoyada en comparables ponderados.');
  } else {
    score += 5;
    explanation.push('Pocas coincidencias exactas: la estimación usa variantes y años cercanos.');
  }

  // Sources (0-20)
  if (sourcesOk >= 3) score += 20;
  else if (sourcesOk === 2) score += 12;
  else score += 5;
  explanation.push(`${sourcesOk} fuente(s) aportaron comparables.`);

  // Dispersion on the adjusted sample (0-20)
  const cv = stats.mean > 0 ? stats.stdDev / stats.mean : 1;
  if (cv < 0.15) {
    score += 20;
    explanation.push('Baja dispersión de precios: el mercado es consistente.');
  } else if (cv < 0.3) {
    score += 12;
    explanation.push('Dispersión moderada de precios.');
  } else {
    score += 4;
    explanation.push('Alta dispersión: conviven versiones/estados muy distintos.');
  }

  // Data quality (0-10)
  if (outlierRatio < 0.1 && discardRatio < 0.5 && missingMileageShare < 0.6) {
    score += 10;
    explanation.push('Buena calidad de datos.');
  } else {
    score += 4;
    explanation.push('Ruido relevante en la muestra (descartes, atípicos o falta de kilometraje).');
  }

  const level = score >= 72 ? 'ALTA' : score >= 45 ? 'MEDIA' : 'BAJA';
  return { level, score, explanation };
}
