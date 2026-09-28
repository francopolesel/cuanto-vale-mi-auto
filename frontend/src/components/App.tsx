import { useEffect, useState } from 'react';
import type { ValuationResponse } from '../types';
import { fmtARS, fmtUSD, fmtNum, fmtShort } from '../types';

const BRANDS = ['Toyota', 'Volkswagen', 'Ford', 'Chevrolet', 'Renault', 'Peugeot', 'Fiat', 'Honda', 'Nissan', 'Citroen', 'Jeep', 'Audi', 'BMW', 'Mercedes Benz', 'Kia', 'Hyundai'];
const YEARS = Array.from({ length: 30 }, (_, i) => new Date().getFullYear() + 1 - i);
const PAGE_SIZE = 15;

interface HistoryEntry {
  brand: string;
  model: string;
  year: number;
  price: number;
}

type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('cvma-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* ignore */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem('cvma-history') ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

type SortKey = 'price-asc' | 'price-desc' | 'km-asc';

export function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState(new Date().getFullYear() - 5);
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [data, setData] = useState<ValuationResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showListings, setShowListings] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [sort, setSort] = useState<SortKey>('price-asc');
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('cvma-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem('cvma-history', JSON.stringify(history.slice(0, 6)));
    } catch {
      /* ignore */
    }
  }, [history]);

  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(t);
  }, [loading]);

  async function search(b = brand, m = model, y = year) {
    if (!b.trim()) {
      setFormError('Elegí una marca para continuar.');
      return;
    }
    if (!m.trim()) {
      setFormError('Escribí el modelo para continuar.');
      return;
    }
    setFormError(null);
    setLoading(true);
    setFailed(false);
    setData(null);
    setShowListings(false);
    setVisible(PAGE_SIZE);
    try {
      const r = await fetch(`/api/valuation?brand=${encodeURIComponent(b.trim())}&model=${encodeURIComponent(m.trim())}&year=${y}`);
      if (!r.ok) throw new Error();
      const json = (await r.json()) as ValuationResponse;
      if (!json.valuation) {
        setFailed(true);
        return;
      }
      setData(json);
      setHistory((h) => [{ brand: b.trim(), model: m.trim(), year: y, price: json.valuation!.average }, ...h.filter((x) => !(x.brand === b && x.model === m && x.year === y))].slice(0, 6));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setData(null);
    setFailed(false);
    setShowListings(false);
    setFormError(null);
    window.scrollTo({ top: 0 });
  }

  function goListings() {
    setShowListings(true);
    setVisible(PAGE_SIZE);
    window.scrollTo({ top: 0 });
  }

  function backToResult() {
    setShowListings(false);
    window.scrollTo({ top: 0 });
  }

  const v = currency === 'USD' ? data?.valuationUSD : data?.valuation;
  const fmt = currency === 'USD' ? fmtUSD : fmtARS;

  const sorted = data
    ? [...data.listings].sort((a, b) => {
        const pa = a.priceARS ?? a.price;
        const pb = b.priceARS ?? b.price;
        if (sort === 'price-desc') return pb - pa;
        if (sort === 'km-asc') return (a.mileage ?? Number.MAX_SAFE_INTEGER) - (b.mileage ?? Number.MAX_SAFE_INTEGER);
        return pa - pb;
      })
    : [];

  return (
    <div className="page">
      <header className="navbar">
        <a className="name" href="#" onClick={(e) => { e.preventDefault(); reset(); }}>
          Cuánto vale mi auto
        </a>
        <button
          type="button"
          className="theme-toggle"
          aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          aria-pressed={theme === 'dark'}
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        >
          {theme === 'dark' ? '☀ Claro' : '☾ Oscuro'}
        </button>
      </header>

      <main key={data ? (showListings ? 'listings' : 'result') : 'search'}>
        {!data && !loading && !failed && (
          <section aria-labelledby="search-title">
            <h1 className="headline" id="search-title">¿Cuánto vale tu auto?</h1>
            <p className="sub">Completá los datos y te mostramos el valor estimado.</p>
            <form
              className="form"
              noValidate
              onSubmit={(e) => { e.preventDefault(); search(); }}
            >
              <div className="form-3" style={{ display: 'grid', gap: 18 }}>
                <label htmlFor="brand">
                  Marca
                  <input id="brand" list="brands" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Volkswagen" autoComplete="off" />
                  <datalist id="brands">{BRANDS.map((b) => <option key={b} value={b} />)}</datalist>
                </label>
                <label htmlFor="model">
                  Modelo
                  <input id="model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Gol Trend" autoComplete="off" />
                </label>
                <label htmlFor="year">
                  Año
                  <select id="year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
                <button className="cta" type="submit">Buscar valor</button>
              </div>
            </form>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            {!formError && <p className="hint">Con la marca, el modelo y el año alcanza.</p>}
            {history.length > 0 && (
              <section className="history" aria-label="Últimas búsquedas">
                <h2>Últimas búsquedas</h2>
                {history.map((h, i) => (
                  <button key={i} type="button" onClick={() => { setBrand(h.brand); setModel(h.model); setYear(h.year); search(h.brand, h.model, h.year); }}>
                    <span>{h.brand} {h.model} {h.year}</span>
                    <small>{fmtShort(h.price)}</small>
                  </button>
                ))}
              </section>
            )}
          </section>
        )}

        {loading && (
          <section aria-live="polite">
            <p className="status">
              Buscando el valor de tu auto…
              {slow && <small>Estamos revisando publicaciones del mercado, ya casi está.</small>}
            </p>
          </section>
        )}

        {failed && !loading && (
          <section>
            <p className="status">No encontramos suficientes datos para estimar este modelo.</p>
            <div className="actions">
              <button type="button" className="btn-secondary" onClick={reset}>Volver a buscar</button>
            </div>
          </section>
        )}

        {data && v && !showListings && (
          <section aria-labelledby="result-title">
            <div className="vehicle">
              <h1 id="result-title">{data.vehicle.brand} {data.vehicle.model}</h1>
              <p>{data.vehicle.year}</p>
            </div>
            <p className="question">¿Cuánto vale?</p>
            <p className="price">{fmt(v.average)}</p>
            <p className="caption">Precio estimado</p>
            <div className="range">
              Entre {fmt(v.min)} y {fmt(v.max)}
              <small>Rango de mercado observado</small>
            </div>
            <p className="updated">
              Actualizado {new Date(data.queriedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}
            </p>
            <div className="currency" role="group" aria-label="Moneda">
              <button type="button" aria-pressed={currency === 'ARS'} onClick={() => setCurrency('ARS')}>Pesos</button>
              <button type="button" aria-pressed={currency === 'USD'} onClick={() => setCurrency('USD')}>Dólares</button>
            </div>
            <div className="actions">
              <button type="button" className="btn-primary" onClick={goListings}>Ver publicaciones</button>
              <button type="button" className="btn-secondary" onClick={reset}>Buscar otro auto</button>
            </div>
            <details className="more">
              <summary>Más detalles ▾</summary>
              <div className="body">
                <p>Promedio: <strong>{fmt(v.average)}</strong></p>
                <p>Rango: <strong>{fmt(v.min)} – {fmt(v.max)}</strong></p>
                <p>Publicaciones analizadas: <strong>{fmtNum(data.comparables.total)}</strong></p>
                <p>Actualización: <strong>{new Date(data.queriedAt).toLocaleString('es-AR')}</strong></p>
              </div>
            </details>
          </section>
        )}

        {data && showListings && (
          <section aria-labelledby="listings-title">
            <div className="sticky">
              <button type="button" className="back" onClick={backToResult} aria-label="Volver a la valuación">
                <span className="arrow" aria-hidden="true">←</span> Volver a la valuación
              </button>
              <span className="where">{data.vehicle.brand} {data.vehicle.model} {data.vehicle.year}</span>
            </div>
            <div className="listings-head">
              <h1 id="listings-title">Publicaciones</h1>
              <p>{data.vehicle.brand} {data.vehicle.model} {data.vehicle.year} · {sorted.length} avisos</p>
            </div>
            <div className="sort-row">
              <label htmlFor="sort">Ordenar por:</label>
              <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="price-asc">Precio más bajo</option>
                <option value="price-desc">Precio más alto</option>
                <option value="km-asc">Menor kilometraje</option>
              </select>
            </div>
            {sorted.slice(0, visible).map((l, i) => (
              <article key={i} className="listing">
                <h2>{l.title}</h2>
                <p className="meta">{l.year}{l.mileage ? ` · ${fmtNum(l.mileage)} km` : ''}</p>
                <p className="amount">{fmtARS(l.priceARS ?? l.price)}</p>
                <p className="src">{l.source}</p>
                <a className="visit" href={l.url} target="_blank" rel="noreferrer">Ver publicación</a>
              </article>
            ))}
            {visible < sorted.length && (
              <button type="button" className="load-more" onClick={() => setVisible((n) => n + PAGE_SIZE)}>
                Mostrar más ({sorted.length - visible} restantes)
              </button>
            )}
          </section>
        )}
      </main>
      <footer>
        <p className="contact-title">¿Querés contactarme?</p>
        <p className="contact-name">Franco Polesel</p>
        <p className="contact-links">
          <a href="mailto:francopolesel99@gmail.com">✉ francopolesel99@gmail.com</a>
          <span aria-hidden="true"> · </span>
          <a href="https://github.com/francopolesel" target="_blank" rel="noreferrer">GitHub</a>
          <span aria-hidden="true"> · </span>
          <a href="https://ar.linkedin.com/in/franco-paul-polesel" target="_blank" rel="noreferrer">LinkedIn</a>
        </p>
      </footer>
    </div>
  );
}
