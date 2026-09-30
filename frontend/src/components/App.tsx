import { useEffect, useRef, useState } from 'react';
import type { ValuationResponse } from '../types';
import { Listings, type SortKey } from './Listings';
import { Result } from './Result';
import { SearchForm, type HistoryEntry } from './SearchForm';

const BRANDS = [
  'Toyota',
  'Volkswagen',
  'Ford',
  'Chevrolet',
  'Renault',
  'Peugeot',
  'Fiat',
  'Honda',
  'Nissan',
  'Citroen',
  'Jeep',
  'Audi',
  'BMW',
  'Mercedes Benz',
  'Kia',
  'Hyundai',
];
const YEARS = Array.from({ length: 30 }, (_, i) => new Date().getFullYear() + 1 - i);
const PAGE_SIZE = 15;

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

function syncUrl(b: string, m: string, y: number | '', km: string, ver: string) {
  try {
    const params = new URLSearchParams({ brand: b.trim(), model: m.trim(), year: String(y) });
    const kmNum = km.trim() === '' ? undefined : Number(km.replace(/\D/g, ''));
    if (kmNum != null && !Number.isNaN(kmNum)) params.set('mileage', String(kmNum));
    if (ver.trim()) params.set('version', ver.trim());
    if (kmNum === 0) params.set('condition', 'NEW');
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  } catch {
    /* ignore */
  }
}

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
      setHistory((h) =>
        [
          {
            brand: b.trim(),
            model: m.trim(),
            year: y,
            price: json.valuation!.average,
            isNew: now,
            mileage: km,
            version: ver.trim(),
          },
          ...h.filter((x) => !(x.brand === b && x.model === m && x.year === y)),
        ].slice(0, 6),
      );
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

  return (
    <div className="page">
      <header className="navbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            reset();
          }}
          aria-label="Cuánto vale mi auto - inicio"
        >
          <img src="/logo.png" alt="Cuánto vale mi auto" className="brand-logo" />
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
          <SearchForm
            brand={brand}
            model={model}
            year={year}
            mileage={mileage}
            version={version}
            formError={formError}
            history={history}
            brands={BRANDS}
            years={YEARS}
            onBrand={setBrand}
            onModel={setModel}
            onYear={setYear}
            onMileage={setMileage}
            onVersion={setVersion}
            onSubmit={() => search()}
            onClear={() => {
              setBrand('');
              setModel('');
              setYear('');
              setMileage('');
              setVersion('');
              setFormError(null);
            }}
            onPickHistory={(h) => {
              setBrand(h.brand);
              setModel(h.model);
              setYear(h.year);
              setMileage(h.mileage ?? '');
              setVersion(h.version ?? '');
              search(h.brand, h.model, h.year, h.mileage ?? '', h.version ?? '');
            }}
          />
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
              <button type="button" className="btn-secondary" onClick={reset}>
                Volver a buscar
              </button>
            </div>
          </section>
        )}

        {data?.valuation && !showListings && (
          <Result
            data={data}
            currency={currency}
            searchedNew={searchedNew}
            mileage={mileage}
            version={version}
            onCurrency={setCurrency}
            onShowListings={goListings}
            onReset={reset}
          />
        )}

        {data && showListings && (
          <Listings
            data={data}
            searchedNew={searchedNew}
            mileage={mileage}
            version={version}
            sort={sort}
            visible={visible}
            pageSize={PAGE_SIZE}
            onSort={setSort}
            onMore={() => setVisible((n) => n + PAGE_SIZE)}
            onBack={backToResult}
          />
        )}
      </main>
      <footer>
        <p className="contact-title">¿Querés contactarme?</p>
        <p className="contact-name">Franco Polesel</p>
        <p className="contact-links">
          <a href="mailto:francopolesel99@gmail.com">✉ francopolesel99@gmail.com</a>
          <span aria-hidden="true"> · </span>
          <a href="https://github.com/francopolesel" target="_blank" rel="noreferrer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
            GitHub
          </a>
          <span aria-hidden="true"> · </span>
          <a href="https://ar.linkedin.com/in/franco-paul-polesel" target="_blank" rel="noreferrer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
            </svg>
            LinkedIn
          </a>
        </p>
      </footer>
    </div>
  );
}
