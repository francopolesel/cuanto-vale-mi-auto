import { useEffect, useRef, useState } from 'react';
import type { ValuationResponse } from '../types';
import { fmtARS, fmtUSD, fmtNum, fmtShort, titleCase } from '../types';

const BRANDS = ['Toyota', 'Volkswagen', 'Ford', 'Chevrolet', 'Renault', 'Peugeot', 'Fiat', 'Honda', 'Nissan', 'Citroen', 'Jeep', 'Audi', 'BMW', 'Mercedes Benz', 'Kia', 'Hyundai'];
const YEARS = Array.from({ length: 30 }, (_, i) => new Date().getFullYear() + 1 - i);
const PAGE_SIZE = 15;

interface HistoryEntry {
  brand: string;
  model: string;
  year: number;
  price: number;
  isNew: boolean;
  mileage: string;
  version: string;
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

function formatMileageEsAR(digits: string): string {
  if (digits === '') return '';
  return new Intl.NumberFormat('es-AR').format(Number(digits));
}

function buildSearchUrl(b: string, m: string, y: number | '', km: string, ver: string): string {
  const params = new URLSearchParams({ brand: b.trim(), model: m.trim(), year: String(y) });
  const kmNum = km.trim() === '' ? undefined : Number(km.replace(/\D/g, ''));
  if (kmNum != null && !Number.isNaN(kmNum)) params.set('mileage', String(kmNum));
  if (ver.trim()) params.set('version', ver.trim());
  if (kmNum === 0) params.set('condition', 'NEW');
  return `${window.location.origin}${window.location.pathname}?${params}`;
}

function syncUrl(b: string, m: string, y: number | '', km: string, ver: string) {
  try {
    window.history.replaceState(null, '', buildSearchUrl(b, m, y, km, ver));
  } catch {
    /* ignore */
  }
}

type SortKey = 'price-asc' | 'price-desc' | 'km-asc' | 'km-desc';

export function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [mileage, setMileage] = useState('');
  const [version, setVersion] = useState('');
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [data, setData] = useState<ValuationResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showListings, setShowListings] = useState(false);
  const [searchedNew, setSearchedNew] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [sort, setSort] = useState<SortKey>('price-asc');
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const deepLinkRan = useRef(false);

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

  async function search(b = brand, m = model, y = year, km = mileage, ver = version) {
    if (!b.trim()) {
      setFormError('Elegí una marca para continuar.');
      return;
    }
    if (!m.trim()) {
      setFormError('Escribí el modelo para continuar.');
      return;
    }
    if (y === '') {
      setFormError('Elegí un año para continuar.');
      return;
    }
    const kmNum = km.trim() === '' ? undefined : Number(km.replace(/\D/g, ''));
    if (km.trim() !== '' && (kmNum == null || Number.isNaN(kmNum))) {
      setFormError('Ingresá un kilometraje válido.');
      return;
    }
    const now = kmNum === 0;
    setFormError(null);
    setLoading(true);
    setFailed(false);
    setData(null);
    setShowListings(false);
    setVisible(PAGE_SIZE);
    try {
      const params = new URLSearchParams({ brand: b.trim(), model: m.trim(), year: String(y) });
      if (kmNum) params.set('mileage', String(kmNum));
      if (ver.trim()) params.set('version', ver.trim());
      if (now) params.set('condition', 'NEW');
      const r = await fetch(`/api/valuation?${params}`);
      if (!r.ok) throw new Error();
      const json = (await r.json()) as ValuationResponse;
      if (!json.valuation) {
        setFailed(true);
        return;
      }
      setData(json);
      setSearchedNew(now);
      setHistory((h) => [{ brand: b.trim(), model: m.trim(), year: y, price: json.valuation!.average, isNew: now, mileage: km, version: ver.trim() }, ...h.filter((x) => !(x.brand === b && x.model === m && x.year === y))].slice(0, 6));
      syncUrl(b, m, y, km, ver);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  // Deep link: ?brand=Ford&model=Fiesta&year=2016&mileage=160000&version=Titanium
  useEffect(() => {
    if (deepLinkRan.current) return;
    deepLinkRan.current = true;
    try {
      const q = new URLSearchParams(window.location.search);
      const b = q.get('brand')?.trim() ?? '';
      const m = q.get('model')?.trim() ?? '';
      const yRaw = q.get('year')?.trim() ?? '';
      if (!b || !m || !yRaw) return;
      const y = Number(yRaw);
      if (!Number.isInteger(y)) return;
      const mileageRaw = q.get('mileage')?.replace(/\D/g, '').slice(0, 7) ?? '';
      const km = mileageRaw === '' ? '' : formatMileageEsAR(mileageRaw);
      const ver = q.get('version')?.trim() ?? '';
      const conditionNew = q.get('condition')?.toUpperCase() === 'NEW';
      const finalKm = km === '' && conditionNew ? '0' : km;
      setBrand(b);
      setModel(m);
      setYear(y);
      setMileage(finalKm);
      setVersion(ver);
      void search(b, m, y, finalKm, ver);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reset() {
    setData(null);
    setFailed(false);
    setShowListings(false);
    setFormError(null);
    try {
      window.history.replaceState(null, '', window.location.pathname);
    } catch {
      /* ignore */
    }
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

  const shareTitle = data
    ? (() => {
        const appliedMileage = data.comparables?.appliedFilters?.mileage ?? null;
        const appliedVersion = data.comparables?.appliedFilters?.version?.trim() ?? '';
        const versionLabel = (version.trim() || appliedVersion) ? ` ${titleCase((version.trim() || appliedVersion))}` : '';
        if (searchedNew) return `${titleCase(data.vehicle.brand)} ${titleCase(data.vehicle.model)} ${data.vehicle.year}${versionLabel} 0 km`;
        const kmRaw = mileage.trim() !== '' ? mileage.trim() : (appliedMileage != null ? fmtNum(appliedMileage) : '');
        const kmLabel = kmRaw !== '' ? ` ${kmRaw} km` : '';
        return `${titleCase(data.vehicle.brand)} ${titleCase(data.vehicle.model)} ${data.vehicle.year}${versionLabel}${kmLabel}`;
      })()
    : '';
  const shareLink = data
    ? buildSearchUrl(data.vehicle.brand, data.vehicle.model, data.vehicle.year, mileage, version || data.comparables?.appliedFilters?.version || '')
    : window.location.origin;
  const resultSubtitle = data
    ? (() => {
        const appliedMileage = data.comparables?.appliedFilters?.mileage ?? null;
        const appliedVersion = data.comparables?.appliedFilters?.version?.trim() ?? '';
        const verLabel = (version.trim() || appliedVersion) ? ` · ${titleCase(version.trim() || appliedVersion)}` : '';
        if (searchedNew) return `${data.vehicle.year}${verLabel} · 0 km`;
        const kmRaw = mileage.trim() !== '' ? mileage.trim() : (appliedMileage != null ? fmtNum(appliedMileage) : '');
        const kmLabel = kmRaw !== '' ? ` · ${kmRaw} km` : '';
        return `${data.vehicle.year}${verLabel}${kmLabel}`;
      })()
    : '';
  const shareText = data && v
    ? `${shareTitle}\nValor estimado: ${fmt(v.average)}\nRango: ${fmt(v.min)} - ${fmt(v.max)}\nMirá el detalle acá: ${shareLink}`
    : '';
  const shareUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  const sorted = data
    ? [...data.listings].sort((a, b) => {
        const pa = a.priceARS ?? a.price;
        const pb = b.priceARS ?? b.price;
        if (sort === 'price-desc') return pb - pa;
        if (sort === 'km-asc' || sort === 'km-desc') {
          const ka = a.mileage ?? (sort === 'km-asc' ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER);
          const kb = b.mileage ?? (sort === 'km-asc' ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER);
          return sort === 'km-asc' ? ka - kb : kb - ka;
        }
        return pa - pb;
      })
    : [];

  return (
    <div className="page">
      <header className="navbar">
        <a className="brand" href="#" onClick={(e) => { e.preventDefault(); reset(); }} aria-label="Cuánto vale mi auto - inicio">
          <img
            src="/logo.png"
            alt="Cuánto vale mi auto"
            className="brand-logo"
          />
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
                  <input id="brand" list="brands" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Marca..." autoComplete="off" />
                  <datalist id="brands">{BRANDS.map((b) => <option key={b} value={b} />)}</datalist>
                </label>
                <label htmlFor="model">
                  Modelo
                  <input id="model" type="text" inputMode="text" autoCapitalize="words" enterKeyHint="next" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Modelo..." autoComplete="off" />
                </label>
                <label htmlFor="year">
                  Año
                  <select id="year" value={year} onChange={(e) => setYear(e.target.value === '' ? '' : Number(e.target.value))} required>
                    <option value="" disabled>Año</option>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
                <div className="tools-row">
                  <details className="filters">
                    <summary>Filtros opcionales <span className="chevron" aria-hidden="true">▾</span></summary>
                    <div className="filters-body">
                      <label htmlFor="mileage">
                        Kilometraje aproximado (0 si es 0 km)
                        <input id="mileage" inputMode="numeric" value={mileage} onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 7);
                        setMileage(digits === '' ? '' : new Intl.NumberFormat('es-AR').format(Number(digits)));
                      }} placeholder="Kilometraje..." autoComplete="off" />
                      </label>
                      <label htmlFor="version">
                        Versión
                        <input id="version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Versión..." autoComplete="off" />
                      </label>
                    </div>
                  </details>
                  <button
                    className="btn-secondary btn-clean"
                    type="button"
                    onClick={() => {
                      setBrand('');
                      setModel('');
                      setYear('');
                      setMileage('');
                      setVersion('');
                      setFormError(null);
                    }}
                    aria-label="Limpiar todos los campos"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6h18" />
                      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                    Limpiar
                  </button>
                </div>
                <button className="cta" type="submit">Buscar valor</button>
              </div>
            </form>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            {!formError && <p className="hint">Con la marca, el modelo y el año alcanza.</p>}
            {history.length > 0 && (
              <section className="history" aria-label="Últimas búsquedas">
                <h2>Últimas búsquedas</h2>
                {history.map((h, i) => (
                  <button key={i} type="button" onClick={() => { setBrand(h.brand); setModel(h.model); setYear(h.year); setMileage(h.mileage ?? ''); setVersion(h.version ?? ''); search(h.brand, h.model, h.year, h.mileage ?? '', h.version ?? ''); }}>
                    <span>{titleCase(h.brand)} {titleCase(h.model)} {h.year}{h.version ? ` ${titleCase(h.version)}` : ''}{h.isNew ? ' · 0 km' : (h.mileage ? ` · ${h.mileage} km` : '')}</span>
                    <small>{fmtShort(h.price)}</small>
                  </button>
                ))}
              </section>
            )}
          </section>
        )}

        {loading && (
          <section aria-live="polite" className="loading">
            <p className="status">
              Buscando el valor de tu auto…
              {slow && <small>Estamos revisando publicaciones del mercado, ya casi está.</small>}
            </p>
            <div className="loader" role="status" aria-label="Cargando" />
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
              <h1 id="result-title">{titleCase(data.vehicle.brand)} {titleCase(data.vehicle.model)}</h1>
              <p>{resultSubtitle}</p>
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
              <a className="btn-secondary btn-share" href={shareUrl} target="_blank" rel="noreferrer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.1 14.9l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 0 1 12 4zm-3.2 4.1c-.2 0-.5 0-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.9 3 4.7 4.1 2.3.9 2.8.7 3.3.7.5-.1 1.6-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.1l-.9 1.1c-.2.2-.3.2-.6.1a7.6 7.6 0 0 1-2.2-1.4 8.3 8.3 0 0 1-1.5-1.9c-.2-.3 0-.5.1-.6l.5-.6c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5L9.3 8.5c-.2-.4-.4-.4-.5-.4z" />
                </svg>
                Compartir por WhatsApp
              </a>
              <button type="button" className="btn-secondary" onClick={reset}>Buscar otro auto</button>
            </div>
            <details className="more">
              <summary>Más detalles ▾</summary>
              <div className="body">
                <p>Promedio: <strong>{fmt(v.average)}</strong></p>
                <p>Rango: <strong>{fmt(v.min)} – {fmt(v.max)}</strong></p>
                <p>Publicaciones analizadas: <strong>{fmtNum(data.comparables.total)}</strong></p>
                {(data.comparables.appliedFilters.mileage != null || data.comparables.appliedFilters.version) && (
                  <p>
                    Filtros: <strong>
                      {[data.comparables.appliedFilters.mileage != null ? `${fmtNum(data.comparables.appliedFilters.mileage)} km` : null,
                        data.comparables.appliedFilters.version].filter(Boolean).join(' · ')}
                    </strong>
                    {data.comparables.appliedFilters.relaxed.length > 0 && ` (se ampliaron por poca muestra: ${data.comparables.appliedFilters.relaxed.join(', ')})`}
                  </p>
                )}
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
            </div>
            <div className="listings-head">
              <h1 id="listings-title">Publicaciones</h1>
              <p>{shareTitle} · {sorted.length} avisos</p>
            </div>
            <div className="sort-row">
              <label htmlFor="sort">Ordenar por:</label>
              <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="price-asc">Precio más bajo</option>
                <option value="price-desc">Precio más alto</option>
                <option value="km-asc">Menor kilometraje</option>
                <option value="km-desc">Mayor kilometraje</option>
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
