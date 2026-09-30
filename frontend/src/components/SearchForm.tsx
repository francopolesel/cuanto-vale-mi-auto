import { fmtShort, titleCase } from '../types';

export interface HistoryEntry {
  brand: string;
  model: string;
  year: number;
  price: number;
  isNew: boolean;
  mileage: string;
  version: string;
}

interface Props {
  brand: string;
  model: string;
  year: number | '';
  mileage: string;
  version: string;
  formError: string | null;
  history: HistoryEntry[];
  brands: string[];
  years: number[];
  onBrand: (v: string) => void;
  onModel: (v: string) => void;
  onYear: (v: number | '') => void;
  onMileage: (v: string) => void;
  onVersion: (v: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onPickHistory: (h: HistoryEntry) => void;
}

export function SearchForm(p: Props) {
  return (
    <section aria-labelledby="search-title">
      <h1 className="headline" id="search-title">
        ¿Cuánto vale tu auto?
      </h1>
      <p className="sub">Completá los datos y te mostramos el valor estimado.</p>
      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          p.onSubmit();
        }}
      >
        <div className="form-3" style={{ display: 'grid', gap: 18 }}>
          <label htmlFor="brand">
            Marca
            <input
              id="brand"
              list="brands"
              value={p.brand}
              onChange={(e) => p.onBrand(e.target.value)}
              placeholder="Marca..."
              autoComplete="off"
            />
            <datalist id="brands">
              {p.brands.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>
          <label htmlFor="model">
            Modelo
            <input
              id="model"
              type="text"
              inputMode="text"
              autoCapitalize="words"
              enterKeyHint="next"
              value={p.model}
              onChange={(e) => p.onModel(e.target.value)}
              placeholder="Modelo..."
              autoComplete="off"
            />
          </label>
          <label htmlFor="year">
            Año
            <select
              id="year"
              value={p.year}
              onChange={(e) => p.onYear(e.target.value === '' ? '' : Number(e.target.value))}
              required
            >
              <option value="" disabled>
                Año
              </option>
              {p.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <div className="tools-row">
            <details className="filters">
              <summary>
                Filtros opcionales{' '}
                <span className="chevron" aria-hidden="true">
                  ▾
                </span>
              </summary>
              <div className="filters-body">
                <label htmlFor="mileage">
                  Kilometraje aproximado (0 si es 0 km)
                  <input
                    id="mileage"
                    inputMode="numeric"
                    value={p.mileage}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 7);
                      p.onMileage(digits === '' ? '' : new Intl.NumberFormat('es-AR').format(Number(digits)));
                    }}
                    placeholder="Kilometraje..."
                    autoComplete="off"
                  />
                </label>
                <label htmlFor="version">
                  Versión
                  <input
                    id="version"
                    value={p.version}
                    onChange={(e) => p.onVersion(e.target.value)}
                    placeholder="Versión..."
                    autoComplete="off"
                  />
                </label>
              </div>
            </details>
            <button
              className="btn-secondary btn-clean"
              type="button"
              onClick={p.onClear}
              aria-label="Limpiar todos los campos"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18" />
                <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
              Limpiar
            </button>
          </div>
          <button className="cta" type="submit">
            Buscar valor
          </button>
        </div>
      </form>
      {p.formError && (
        <p className="form-error" role="alert">
          {p.formError}
        </p>
      )}
      {!p.formError && <p className="hint">Con la marca, el modelo y el año alcanza.</p>}
      {p.history.length > 0 && (
        <section className="history" aria-label="Últimas búsquedas">
          <h2>Últimas búsquedas</h2>
          {p.history.map((h, i) => (
            <button key={i} type="button" onClick={() => p.onPickHistory(h)}>
              <span>
                {titleCase(h.brand)} {titleCase(h.model)} {h.year}
                {h.version ? ` ${titleCase(h.version)}` : ''}
                {h.isNew ? ' · 0 km' : h.mileage ? ` · ${h.mileage} km` : ''}
              </span>
              <small>{fmtShort(h.price)}</small>
            </button>
          ))}
        </section>
      )}
    </section>
  );
}
