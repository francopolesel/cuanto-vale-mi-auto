export const fmtARS = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
export const fmtUSD = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
export const fmtNum = (n) => new Intl.NumberFormat('es-AR').format(n);
export const fmtShort = (n) => n >= 1000000 ? `$${(n / 1000000).toFixed(1).replace('.', ',').replace(',0', '')} M` : fmtARS(n);
