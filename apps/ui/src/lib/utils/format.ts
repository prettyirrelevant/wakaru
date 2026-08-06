import { CURRENCY_SYMBOL, MINOR_UNITS, type CurrencyCode } from '~/types';

/**
 * Safely extract the index from a regex match.
 * Throws if index is undefined (should never happen for valid matches).
 */
export function getMatchIndex(match: RegExpMatchArray | RegExpExecArray): number {
  if (match.index === undefined) {
    throw new Error('Match index is undefined - this should never happen for a valid match');
  }
  return match.index;
}

/** Minor units to major units. */
export function toMajorUnits(amountMinor: number): number {
  return amountMinor / MINOR_UNITS;
}

/** Full precision, e.g. ₦1,234.56 */
export function formatCurrency(amountMinor: number, currency: CurrencyCode = 'NGN'): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toMajorUnits(amountMinor));
}

/**
 * Compact form with smart precision, e.g. ₦1.5M, ₦234K, ₦12.5K
 */
export function formatCompactCurrency(amountMinor: number, currency: CurrencyCode = 'NGN'): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? '';
  const major = Math.abs(toMajorUnits(amountMinor));

  const precision = (value: number) => (value >= 100 ? 0 : value >= 10 ? 1 : 2);

  if (major >= 1_000_000_000) {
    const value = major / 1_000_000_000;
    return `${symbol}${value.toFixed(precision(value))}B`;
  }
  if (major >= 1_000_000) {
    const value = major / 1_000_000;
    return `${symbol}${value.toFixed(precision(value))}M`;
  }
  if (major >= 1_000) {
    const value = major / 1_000;
    return `${symbol}${value.toFixed(value >= 100 ? 0 : 1)}K`;
  }
  return `${symbol}${major.toFixed(0)}`;
}

/** Millify a number for chart axes (no currency symbol). */
export function millify(value: number): string {
  const abs = Math.abs(value);

  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toFixed(0);
}

/** DD/MM/YYYY */
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

/** DD/MM/YYYY HH:MM */
export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${formatDate(isoString)} ${hours}:${minutes}`;
}

/** "Mar 2025", or "Mar 2025 - Aug 2025" across a range. */
export function formatMonthRange(start: Date | string | null, end: Date | string | null): string {
  if (!start || !end) return '';

  const format = (value: Date | string) =>
    new Date(value).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' });

  const from = format(start);
  const to = format(end);

  return from === to ? from : `${from} - ${to}`;
}

/** Human label for a transaction kind. */
export function formatKind(kind: string): string {
  return kind.replace(/_/g, ' ');
}
