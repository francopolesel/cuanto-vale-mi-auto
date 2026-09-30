import type { DollarQuote, DollarStrategy, ValuationResponse } from '../types';
import { fmtARS, fmtNum, fmtUSD, titleCase } from '../types';
import { Distribution } from './Distribution';

interface Props {
  data: ValuationResponse;
  currency: 'ARS' | 'USD';
  dollar: DollarStrategy;
  quotes: DollarQuote | null;
  searchedNew: boolean;
  mileage: string;
  version: string;
  onCurrency: (c: 'ARS' | 'USD') => void;
  onDollar: (d: DollarStrategy) => void;
  onShowListings: () => void;
  onReset: () => void;
}

const DOLLARS: DollarStrategy[] = ['OFICIAL', 'BLUE', 'MEP'];

function buildShareLink(d: ValuationResponse, mileage: string, version: string, dollar: DollarStrategy): string {
  const params = new URLSearchParams({ brand: d.vehicle.brand, model: d.vehicle.model, year: String(d.vehicle.year) });
  const kmNum = mileage.trim() === '' ? undefined : Number(mileage.replace(/\D/g, ''));
  if (kmNum != null && !Number.isNaN(kmNum)) params.set('mileage', String(kmNum));
  const ver = version.trim() || d.comparables?.appliedFilters?.version || '';
  if (ver.trim()) params.set('version', ver.trim());
  if (kmNum === 0) params.set('condition', 'NEW');
  if (dollar !== 'OFICIAL') params.set('dollar', dollar);
  if (d.valuation) params.set('price', String(d.valuation.average));
  return `${window.location.origin}${window.location.pathname}?${params}`;
}

export function Result(p: Props) {
  const { data } = p;
  const v = p.currency === 'USD' ? data.valuationUSD : data.valuation;
  const fmt = p.currency === 'USD' ? fmtUSD : fmtARS;
  if (!v) return null;

  const appliedMileage = data.comparables?.appliedFilters?.mileage ?? null;
  const appliedVersion = data.comparables?.appliedFilters?.version?.trim() ?? '';
  const versionLabel = p.version.trim() || appliedVersion ? ` ${titleCase(p.version.trim() || appliedVersion)}` : '';
  const shareTitle = p.searchedNew
    ? `${titleCase(data.vehicle.brand)} ${titleCase(data.vehicle.model)} ${data.vehicle.year}${versionLabel} 0 km`
    : (() => {
        const kmRaw = p.mileage.trim() !== '' ? p.mileage.trim() : appliedMileage != null ? fmtNum(appliedMileage) : '';
        return `${titleCase(data.vehicle.brand)} ${titleCase(data.vehicle.model)} ${data.vehicle.year}${versionLabel}${kmRaw !== '' ? ` ${kmRaw} km` : ''}`;
      })();
  const resultSubtitle = p.searchedNew
    ? `${data.vehicle.year}${versionLabel ? ` · ${versionLabel.trim()}` : ''} · 0 km`
    : (() => {
        const kmRaw = p.mileage.trim() !== '' ? p.mileage.trim() : appliedMileage != null ? fmtNum(appliedMileage) : '';
        const verLabel = versionLabel ? ` · ${versionLabel.trim()}` : '';
        return `${data.vehicle.year}${verLabel}${kmRaw !== '' ? ` · ${kmRaw} km` : ''}`;
      })();
  const shareLink = buildShareLink(data, p.mileage, p.version, p.dollar);
  const shareText = `${shareTitle}\nValor estimado: ${fmt(v.average)}\nRango: ${fmt(v.min)} - ${fmt(v.max)}\nMirá el detalle acá: ${shareLink}`;
  const shareUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const dollarLabel = p.dollar === 'OFICIAL' ? 'oficial' : p.dollar === 'BLUE' ? 'blue' : 'MEP';

  return (
    <section aria-labelledby="result-title">
      <div className="vehicle">
        <h1 id="result-title">
          {titleCase(data.vehicle.brand)} {titleCase(data.vehicle.model)}
        </h1>
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
        {' · '}Dólar {dollarLabel} ${fmtNum(Math.round(data.exchangeRate.arsPerUsd))}
        {data.exchangeRate.fallback && ' (respaldo)'}
      </p>
      <div className="currency" role="group" aria-label="Moneda">
        <button type="button" aria-pressed={p.currency === 'ARS'} onClick={() => p.onCurrency('ARS')}>
          Pesos
        </button>
        <button type="button" aria-pressed={p.currency === 'USD'} onClick={() => p.onCurrency('USD')}>
          Dólares
        </button>
      </div>
      <div className="currency" role="group" aria-label="Tipo de dólar">
        {DOLLARS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={p.dollar === d}
            onClick={() => p.onDollar(d)}
            title={
              p.quotes
                ? d === 'OFICIAL'
                  ? p.quotes.oficial
                    ? `Oficial $${fmtNum(Math.round(p.quotes.oficial.arsPerUsd))}`
                    : 'Oficial'
                  : d === 'BLUE'
                    ? p.quotes.blue
                      ? `Blue $${fmtNum(Math.round(p.quotes.blue.arsPerUsd))}`
                      : 'Blue'
                    : p.quotes.mep
                      ? `MEP $${fmtNum(Math.round(p.quotes.mep.arsPerUsd))}`
                      : 'MEP'
                : d
            }
          >
            {d === 'OFICIAL' ? 'Oficial' : d === 'BLUE' ? 'Blue' : 'MEP'}
          </button>
        ))}
      </div>
      <Distribution data={data} fmt={fmt} />
      <div className="actions">
        <button type="button" className="btn-primary" onClick={p.onShowListings}>
          Ver publicaciones
        </button>
        <a className="btn-secondary btn-share" href={shareUrl} target="_blank" rel="noreferrer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.1 14.9l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 0 1 12 4zm-3.2 4.1c-.2 0-.5 0-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.9 3 4.7 4.1 2.3.9 2.8.7 3.3.7.5-.1 1.6-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.1l-.9 1.1c-.2.2-.3.2-.6.1a7.6 7.6 0 0 1-2.2-1.4 8.3 8.3 0 0 1-1.5-1.9c-.2-.3 0-.5.1-.6l.5-.6c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5L9.3 8.5c-.2-.4-.4-.4-.5-.4z" />
          </svg>
          Compartir por WhatsApp
        </a>
        <button type="button" className="btn-secondary" onClick={p.onReset}>
          Buscar otro auto
        </button>
      </div>
      <details className="more">
        <summary>Más detalles ▾</summary>
        <div className="body">
          <p>
            Promedio: <strong>{fmt(v.average)}</strong>
          </p>
          <p>
            Rango:{' '}
            <strong>
              {fmt(v.min)} – {fmt(v.max)}
            </strong>
          </p>
          <p>
            Publicaciones analizadas: <strong>{fmtNum(data.comparables.total)}</strong>
          </p>
          {(data.comparables.appliedFilters.mileage != null || data.comparables.appliedFilters.version) && (
            <p>
              Filtros:{' '}
              <strong>
                {[
                  data.comparables.appliedFilters.mileage != null
                    ? `${fmtNum(data.comparables.appliedFilters.mileage)} km`
                    : null,
                  data.comparables.appliedFilters.version,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </strong>
              {data.comparables.appliedFilters.relaxed.length > 0 &&
                ` (se ampliaron por poca muestra: ${data.comparables.appliedFilters.relaxed.join(', ')})`}
            </p>
          )}
          <p>
            Actualización: <strong>{new Date(data.queriedAt).toLocaleString('es-AR')}</strong>
          </p>
        </div>
      </details>
    </section>
  );
}
