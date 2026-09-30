import { useEffect, useRef, useState } from 'react';
import type { DollarQuote, DollarStrategy, ValuationResponse } from '../types';
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

function syncUrl(b: string, m: string, y: number | '', km: string, ver: string, dollar: DollarStrategy) {
  try {
    const params = new URLSearchParams({ brand: b.trim(), model: m.trim(), year: String(y) });
    const kmNum = km.trim() === '' ? undefined : Number(km.replace(/\D/g, ''));
    if (kmNum != null && !Number.isNaN(kmNum)) params.set('mileage', String(kmNum));
    if (ver.trim()) params.set('version', ver.trim());
    if (kmNum === 0) params.set('condition', 'NEW');
    if (dollar !== 'OFICIAL') params.set('dollar', dollar);
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
  const [dollar, setDollar] = useState<DollarStrategy>('OFICIAL');
  const [quotes, setQuotes] = useState<DollarQuote | null>(null);
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

  useEffect(() => {
    fetch('/api/dollar')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) setQuotes(j as DollarQuote);
      })
      .catch(() => {
        /* quotes are nice-to-have */
      });
  }, []);

  async function search(b = brand, m = model, y = year, km = mileage, ver = version, dl = dollar) {
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
      if (dl !== 'OFICIAL') params.set('dollar', dl);
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
      syncUrl(b, m, y, km, ver, dl);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  // Deep link: ?brand=Ford&model=Fiesta&year=2016&mileage=160000&version=Titanium&dollar=BLUE
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
      const dlRaw = q.get('dollar')?.toUpperCase();
      const dl: DollarStrategy = dlRaw === 'BLUE' || dlRaw === 'MEP' ? dlRaw : 'OFICIAL';
      setBrand(b);
      setModel(m);
      setYear(y);
      setMileage(finalKm);
      setVersion(ver);
      setDollar(dl);
      void search(b, m, y, finalKm, ver, dl);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeDollar(dl: DollarStrategy) {
    setDollar(dl);
    // The USD valuation depends on the rate: refetch when there is an active search.
    if (data && brand.trim() && model.trim() && year !== '') {
      void search(brand, model, year, mileage, version, dl);
    }
  }

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
            dollar={dollar}
            quotes={quotes}
            searchedNew={searchedNew}
            mileage={mileage}
            version={version}
            onCurrency={setCurrency}
            onDollar={changeDollar}
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
            GitHub
          </a>
          <span aria-hidden="true"> · </span>
          <a href="https://ar.linkedin.com/in/franco-paul-polesel" target="_blank" rel="noreferrer">
            LinkedIn
          </a>
        </p>
      </footer>
    </div>
  );
}
