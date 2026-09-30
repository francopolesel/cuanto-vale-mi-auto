import type { ValuationResponse } from '../types';
import { fmtNum } from '../types';

/** Price distribution (P10–P90) + per-year comparable breakdown. Pure CSS/SVG, no dependencies. */
export function Distribution({ data, fmt }: { data: ValuationResponse; fmt: (n: number) => string }) {
  const s = data.statistics;
  if (!s || s.count < 2) return null;
  const span = s.max - s.min || 1;
  const pct = (n: number) => Math.min(100, Math.max(0, ((n - s.min) / span) * 100));
  const markers = [
    { label: 'P10', value: s.p10 },
    { label: 'Mediana', value: s.median },
    { label: 'P90', value: s.p90 },
  ];
  const maxByYear = Math.max(...data.comparables.byYear.map((b) => b.count), 1);

  return (
    <section className="dist" aria-label="Distribución de precios">
      <h2>Distribución del mercado</h2>
      <div
        className="dist-bar"
        role="img"
        aria-label={`Precios entre ${fmt(s.min)} y ${fmt(s.max)}, mediana ${fmt(s.median)}`}
      >
        <div className="dist-track">
          <div
            className="dist-fill"
            style={{ left: `${pct(s.q1)}%`, width: `${Math.max(2, pct(s.q3) - pct(s.q1))}%` }}
          />
          {markers.map((m) => (
            <span
              key={m.label}
              className={`dist-marker${m.label === 'Mediana' ? ' median' : ''}`}
              style={{ left: `${pct(m.value)}%` }}
              title={`${m.label}: ${fmt(m.value)}`}
            />
          ))}
        </div>
        <div className="dist-labels">
          <span>{fmt(s.min)}</span>
          <span className="dist-median-label">Mediana {fmt(s.median)}</span>
          <span>{fmt(s.max)}</span>
        </div>
      </div>
      {data.comparables.byYear.length > 1 && (
        <div className="dist-years">
          {data.comparables.byYear.map((b) => (
            <div key={b.year} className="dist-year-row">
              <span className="dist-year">{b.year}</span>
              <span className="dist-year-track">
                <span className="dist-year-fill" style={{ width: `${Math.max(3, (b.count / maxByYear) * 100)}%` }} />
              </span>
              <span className="dist-year-meta">
                {fmtNum(b.count)} avisos · med. {fmt(b.medianPriceARS)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
