/** Frontend type surface: API contract comes from `shared`, formatting helpers stay local. */
export type {
  CarDataSource,
  CarListing,
  ComparableScore,
  ConditionTag,
  Currency,
  DollarQuote,
  DollarStrategy,
  ExchangeRateInfo,
  MatchLevel,
  PriceType,
  ScraperResult,
  SearchCriteria,
  SellerType,
  ValuationResponse,
  ValuationStats,
} from 'shared';

export const fmtARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

export const fmtUSD = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export const fmtNum = (n: number) => new Intl.NumberFormat('es-AR').format(n);

export const fmtShort = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} M` : fmtARS(n);

export const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(/(\s+)/)
    .map((w) => (/^\s*$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
