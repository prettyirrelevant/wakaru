/**
 * Format amount in kobo to Naira with currency symbol
 */
export function formatCurrency(amountInKobo: number): string {
  const naira = amountInKobo / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(naira);
}

/**
 * Format amount in kobo to compact form with smart precision
 * e.g., 1.5M, 234K, 12.5K
 */
export function formatCompactCurrency(amountInKobo: number): string {
  const naira = Math.abs(amountInKobo) / 100;
  
  if (naira >= 1_000_000_000) {
    const val = naira / 1_000_000_000;
    return `₦${val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)}B`;
  }
  if (naira >= 1_000_000) {
    const val = naira / 1_000_000;
    return `₦${val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)}M`;
  }
  if (naira >= 1_000) {
    const val = naira / 1_000;
    return `₦${val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(1)}K`;
  }
  return `₦${naira.toFixed(0)}`;
}

/**
 * Millify a number for chart display (no currency symbol)
 */
export function millify(value: number): string {
  const abs = Math.abs(value);
  
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }
  return value.toFixed(0);
}

/**
 * Format date as DD/MM/YYYY
 */
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format date with year for display (short month format)
 */
export function formatDateWithYear(isoString: string): string {
  const date = new Date(isoString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format date with time as DD/MM/YYYY HH:MM
 */
export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}


