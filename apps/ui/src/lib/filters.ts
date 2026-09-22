import type { CurrencyCode } from '~/types';

export interface FilterState {
  /**
   * Totals are only meaningful within one currency, so analytics always pin
   * to a single one rather than summing naira and dollars together.
   */
  currency: CurrencyCode | null;
  accounts: string[];
  banks: string[];
  categories: string[];
  kinds: string[];
  flow: 'in' | 'out' | null;
  amountMin: number | null;
  amountMax: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  /** Hide both legs of money moved between the user's own accounts. */
  excludeInternal: boolean;
  /**
   * Roll bank charges up into the transaction that caused them.
   *
   * A presentation choice for the list only. Analytics ignore it, because
   * hiding a fee row does not mean the money stayed in the account.
   */
  hideChildFees: boolean;
}

export const emptyFilterState: FilterState = {
  currency: null,
  accounts: [],
  banks: [],
  categories: [],
  kinds: [],
  flow: null,
  amountMin: null,
  amountMax: null,
  dateFrom: null,
  dateTo: null,
  excludeInternal: true,
  hideChildFees: false,
};

/** Defaults that are on by default should not read as "filtered". */
export function isFilterEmpty(state: FilterState): boolean {
  return (
    state.accounts.length === 0 &&
    state.banks.length === 0 &&
    state.categories.length === 0 &&
    state.kinds.length === 0 &&
    state.flow === null &&
    state.amountMin === null &&
    state.amountMax === null &&
    state.dateFrom === null &&
    state.dateTo === null &&
    state.hideChildFees === false
  );
}

export function countActiveFilters(state: FilterState): number {
  let count = 0;
  if (state.accounts.length > 0) count++;
  if (state.banks.length > 0) count++;
  if (state.categories.length > 0) count++;
  if (state.kinds.length > 0) count++;
  if (state.flow !== null) count++;
  if (state.amountMin !== null || state.amountMax !== null) count++;
  if (state.dateFrom !== null || state.dateTo !== null) count++;
  if (state.hideChildFees) count++;
  return count;
}

export interface WhereClauseResult {
  sql: string;
  params: (string | number | boolean)[];
}

/**
 * Build the WHERE clause shared by the transaction list and every analytics
 * query, so a filter the user set is honoured everywhere at once.
 *
 * Table aliases are fixed: `t` transactions, `a` accounts.
 */
export function buildWhereClause(filters: FilterState, searchText: string): WhereClauseResult {
  const conditions: string[] = [];
  const params: (string | number | boolean)[] = [];

  const placeholder = (value: string | number | boolean): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.currency) {
    conditions.push(`t.currency = ${placeholder(filters.currency)}`);
  }

  if (filters.accounts.length > 0) {
    conditions.push(`t.account_id IN (${filters.accounts.map(placeholder).join(', ')})`);
  }

  if (filters.banks.length > 0) {
    conditions.push(`a.bank IN (${filters.banks.map(placeholder).join(', ')})`);
  }

  if (filters.categories.length > 0) {
    const hasUncategorized = filters.categories.includes('uncategorized');
    const explicit = filters.categories.filter((c) => c !== 'uncategorized');
    const parts: string[] = [];
    if (explicit.length > 0) {
      parts.push(`t.category_id IN (${explicit.map(placeholder).join(', ')})`);
    }
    if (hasUncategorized) {
      parts.push('t.category_id IS NULL');
    }
    if (parts.length > 0) {
      conditions.push(`(${parts.join(' OR ')})`);
    }
  }

  if (filters.kinds.length > 0) {
    conditions.push(`t.kind IN (${filters.kinds.map(placeholder).join(', ')})`);
  }

  if (filters.flow === 'in') {
    conditions.push('t.amount_minor > 0');
  } else if (filters.flow === 'out') {
    conditions.push('t.amount_minor < 0');
  }

  if (filters.amountMin !== null) {
    conditions.push(`ABS(t.amount_minor) >= ${placeholder(Math.round(filters.amountMin * 100))}`);
  }

  if (filters.amountMax !== null) {
    conditions.push(`ABS(t.amount_minor) <= ${placeholder(Math.round(filters.amountMax * 100))}`);
  }

  if (filters.dateFrom) {
    conditions.push(`t.booked_at >= ${placeholder(filters.dateFrom)}::date`);
  }

  if (filters.dateTo) {
    // Half-open upper bound. Comparing a date against a timestamptz pins the
    // bound to midnight, which would drop everything booked on the end date
    // itself.
    conditions.push(`t.booked_at < ${placeholder(filters.dateTo)}::date + INTERVAL '1 day'`);
  }

  if (filters.excludeInternal) {
    conditions.push('t.transfer_group_id IS NULL');
  }

  const trimmed = searchText.trim();
  if (trimmed) {
    conditions.push(`t.search_text LIKE ${placeholder(`%${trimmed.toLowerCase()}%`)}`);
  }

  return {
    sql: conditions.length > 0 ? conditions.join(' AND ') : 'TRUE',
    params,
  };
}

/**
 * The subset of filters that still make sense for a running balance.
 *
 * A balance is a property of an account at a point in time. Narrowing by
 * category or amount and then reading `balance_after` off whichever row
 * survived gives a number that looks like a balance and is not one.
 */
export function buildScopeClause(filters: FilterState): WhereClauseResult {
  return buildWhereClause(
    {
      ...emptyFilterState,
      currency: filters.currency,
      accounts: filters.accounts,
      banks: filters.banks,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      excludeInternal: false,
    },
    ''
  );
}

export interface FilterChip {
  label: string;
  next: FilterState;
}

export function formatFilterChips(
  filters: FilterState,
  labels: { categories?: Record<string, string>; accounts?: Record<string, string> } = {}
): FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.accounts.length > 0) {
    chips.push({
      label:
        filters.accounts.length === 1
          ? labels.accounts?.[filters.accounts[0]] ?? 'account'
          : `${filters.accounts.length} accounts`,
      next: { ...filters, accounts: [] },
    });
  }

  if (filters.banks.length > 0) {
    chips.push({
      label: filters.banks.length === 1 ? filters.banks[0] : `${filters.banks.length} banks`,
      next: { ...filters, banks: [] },
    });
  }

  if (filters.categories.length > 0) {
    chips.push({
      label:
        filters.categories.length === 1
          ? labels.categories?.[filters.categories[0]] ?? 'category'
          : `${filters.categories.length} categories`,
      next: { ...filters, categories: [] },
    });
  }

  if (filters.kinds.length > 0) {
    chips.push({
      label: filters.kinds.length === 1 ? filters.kinds[0].replace(/_/g, ' ') : `${filters.kinds.length} types`,
      next: { ...filters, kinds: [] },
    });
  }

  if (filters.flow) {
    chips.push({
      label: filters.flow === 'in' ? 'credit' : 'debit',
      next: { ...filters, flow: null },
    });
  }

  if (filters.amountMin !== null || filters.amountMax !== null) {
    let label = '';
    if (filters.amountMin !== null && filters.amountMax !== null) {
      label = `₦${filters.amountMin.toLocaleString()} - ₦${filters.amountMax.toLocaleString()}`;
    } else if (filters.amountMin !== null) {
      label = `≥ ₦${filters.amountMin.toLocaleString()}`;
    } else if (filters.amountMax !== null) {
      label = `≤ ₦${filters.amountMax.toLocaleString()}`;
    }
    chips.push({ label, next: { ...filters, amountMin: null, amountMax: null } });
  }

  if (filters.dateFrom || filters.dateTo) {
    let label = '';
    if (filters.dateFrom && filters.dateTo) {
      label = `${filters.dateFrom} to ${filters.dateTo}`;
    } else if (filters.dateFrom) {
      label = `from ${filters.dateFrom}`;
    } else if (filters.dateTo) {
      label = `until ${filters.dateTo}`;
    }
    chips.push({ label, next: { ...filters, dateFrom: null, dateTo: null } });
  }

  if (filters.hideChildFees) {
    chips.push({ label: 'fees rolled up', next: { ...filters, hideChildFees: false } });
  }

  return chips;
}

export type PeriodKey = 'all' | '30d' | '90d' | 'this-month' | 'this-year' | 'custom';

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  all: 'All Time',
  '30d': '30 Days',
  '90d': '90 Days',
  'this-month': 'This Month',
  'this-year': 'This Year',
  custom: 'Custom',
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** @returns the date bounds for a period, or nulls for "all time". */
export function periodToRange(
  period: PeriodKey,
  now: Date = new Date()
): { dateFrom: string | null; dateTo: string | null } {
  switch (period) {
    case '30d': {
      const from = new Date(now);
      from.setUTCDate(from.getUTCDate() - 29);
      return { dateFrom: isoDate(from), dateTo: isoDate(now) };
    }
    case '90d': {
      const from = new Date(now);
      from.setUTCDate(from.getUTCDate() - 89);
      return { dateFrom: isoDate(from), dateTo: isoDate(now) };
    }
    case 'this-month': {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { dateFrom: isoDate(from), dateTo: isoDate(now) };
    }
    case 'this-year': {
      const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      return { dateFrom: isoDate(from), dateTo: isoDate(now) };
    }
    case 'all':
    case 'custom':
    default:
      return { dateFrom: null, dateTo: null };
  }
}
