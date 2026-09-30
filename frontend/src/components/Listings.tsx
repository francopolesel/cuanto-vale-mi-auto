import type { ValuationResponse } from '../types';
import { fmtARS, fmtNum, titleCase } from '../types';

export type SortKey = 'price-asc' | 'price-desc' | 'km-asc' | 'km-desc';

interface Props {
  data: ValuationResponse;
  searchedNew: boolean;
  mileage: string;
  version: string;
  sort: SortKey;
  visible: number;
  pageSize: number;
  onSort: (s: SortKey) => void;
  onMore: () => void;
  onBack: () => void;
}

export function Listings(p: Props) {
  const { data } = p;
  const appliedMileage = data.comparables?.appliedFilters?.mileage ?? null;
  const appliedVersion = data.comparables?.appliedFilters?.version?.trim() ?? '';
  const versionLabel = p.version.trim() || appliedVersion ? ` ${titleCase(p.version.trim() || appliedVersion)}` : '';
  const head = p.searchedNew
    ? `${titleCase(data.vehicle.brand)} ${titleCase(data.vehicle.model)} ${data.vehicle.year}${versionLabel} 0 km`
    : (() => {
        const kmRaw = p.mileage.trim() !== '' ? p.mileage.trim() : appliedMileage != null ? fmtNum(appliedMileage) : '';
        return `${titleCase(data.vehicle.brand)} ${titleCase(data.vehicle.model)} ${data.vehicle.year}${versionLabel}${kmRaw !== '' ? ` ${kmRaw} km` : ''}`;
      })();

  const sorted = [...data.listings].sort((a, b) => {
    const pa = a.priceARS ?? a.price;
    const pb = b.priceARS ?? b.price;
    if (p.sort === 'price-desc') return pb - pa;
    if (p.sort === 'km-asc' || p.sort === 'km-desc') {
      const ka = a.mileage ?? (p.sort === 'km-asc' ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER);
      const kb = b.mileage ?? (p.sort === 'km-asc' ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER);
      return p.sort === 'km-asc' ? ka - kb : kb - ka;
    }
    return pa - pb;
  });

  return (
    <section aria-labelledby="listings-title">
      <div className="sticky">
        <button type="button" className="back" onClick={p.onBack} aria-label="Volver a la valuación">
          <span className="arrow" aria-hidden="true">
            ←
          </span>{' '}
          Volver a la valuación
        </button>
      </div>
      <div className="listings-head">
        <h1 id="listings-title">Publicaciones</h1>
        <p>
          {head} · {sorted.length} avisos
        </p>
      </div>
      <div className="sort-row">
        <label htmlFor="sort">Ordenar por:</label>
        <select id="sort" value={p.sort} onChange={(e) => p.onSort(e.target.value as SortKey)}>
          <option value="price-asc">Precio más bajo</option>
          <option value="price-desc">Precio más alto</option>
          <option value="km-asc">Menor kilometraje</option>
          <option value="km-desc">Mayor kilometraje</option>
        </select>
      </div>
      {sorted.slice(0, p.visible).map((l, i) => (
        <article key={i} className="listing">
          <h2>{l.title}</h2>
          <p className="meta">
            {l.year}
            {l.mileage ? ` · ${fmtNum(l.mileage)} km` : ''}
          </p>
          <p className="amount">{fmtARS(l.priceARS ?? l.price)}</p>
          <p className="src">{l.source}</p>
          <a className="visit" href={l.url} target="_blank" rel="noreferrer">
            Ver publicación
          </a>
        </article>
      ))}
      {p.visible < sorted.length && (
        <button type="button" className="load-more" onClick={p.onMore}>
          Mostrar más ({sorted.length - p.visible} restantes)
        </button>
      )}
    </section>
  );
}
