const PEN_FORMATTER = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
});

const NUMBER_FORMATTER = new Intl.NumberFormat('es-PE');
const DECIMAL_FORMATTER = new Intl.NumberFormat('es-PE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatPEN = (value?: number | null) => PEN_FORMATTER.format(value ?? 0);
export const formatNumber = (value?: number | null) => NUMBER_FORMATTER.format(value ?? 0);
export const formatDecimal = (value?: number | null) => DECIMAL_FORMATTER.format(value ?? 0);
