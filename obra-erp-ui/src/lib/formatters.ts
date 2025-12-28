const PEN_FORMATTER = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
});

const NUMBER_FORMATTER = new Intl.NumberFormat('es-PE');
const DECIMAL_FORMATTER = new Intl.NumberFormat('es-PE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const CURRENCY_CACHE = new Map<string, Intl.NumberFormat>();

const toSafeNumber = (value?: number | null) => {
  if (typeof value !== 'number') return 0;
  return Number.isFinite(value) ? value : 0;
};

export const formatPEN = (value?: number | null) => PEN_FORMATTER.format(toSafeNumber(value));
export const formatNumber = (value?: number | null) => NUMBER_FORMATTER.format(toSafeNumber(value));
export const formatDecimal = (value?: number | null) => DECIMAL_FORMATTER.format(toSafeNumber(value));

export const formatCurrency = (value?: number | null, currency?: string | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (!currency || currency === 'PEN') return formatPEN(value);
  let formatter = CURRENCY_CACHE.get(currency);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat('es-PE', { style: 'currency', currency });
      CURRENCY_CACHE.set(currency, formatter);
    } catch {
      return `${currency} ${formatDecimal(value)}`;
    }
  }
  return formatter.format(value);
};
