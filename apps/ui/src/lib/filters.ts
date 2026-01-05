export type FilterField = 'bank' | 'amount' | 'date' | 'category' | 'flow';
export type FilterOperator = '=' | '!=' | '>' | '>=' | '<' | '<=';

export interface Filter {
  field: FilterField;
  operator: FilterOperator;
  value: string | string[] | number;
}

export interface ParsedQuery {
  filters: Filter[];
  text: string;
}

export interface FilterState {
  banks: string[];
  flow: 'in' | 'out' | null;
  amountMin: number | null;
  amountMax: number | null;
  dateFrom: string | null;
  dateTo: string | null;
}

export const emptyFilterState: FilterState = {
  banks: [],
  flow: null,
  amountMin: null,
  amountMax: null,
  dateFrom: null,
  dateTo: null,
};

export function isFilterEmpty(state: FilterState): boolean {
  return (
    state.banks.length === 0 &&
    state.flow === null &&
    state.amountMin === null &&
    state.amountMax === null &&
    state.dateFrom === null &&
    state.dateTo === null
  );
}

export function countActiveFilters(state: FilterState): number {
  let count = 0;
  if (state.banks.length > 0) count++;
  if (state.flow !== null) count++;
  if (state.amountMin !== null || state.amountMax !== null) count++;
  if (state.dateFrom !== null || state.dateTo !== null) count++;
  return count;
}

export function buildWhereClause(filters: FilterState, searchText: string): string {
  const conditions: string[] = [];

  if (filters.banks.length > 0) {
    const bankList = filters.banks.map(b => `'${b}'`).join(', ');
    conditions.push(`bank_source IN (${bankList})`);
  }

  if (filters.flow === 'in') {
    conditions.push('amount > 0');
  } else if (filters.flow === 'out') {
    conditions.push('amount < 0');
  }

  if (filters.amountMin !== null) {
    const kobo = filters.amountMin * 100;
    conditions.push(`ABS(amount) >= ${kobo}`);
  }

  if (filters.amountMax !== null) {
    const kobo = filters.amountMax * 100;
    conditions.push(`ABS(amount) <= ${kobo}`);
  }

  if (filters.dateFrom) {
    conditions.push(`date >= '${filters.dateFrom}'`);
  }

  if (filters.dateTo) {
    conditions.push(`date <= '${filters.dateTo}'`);
  }

  if (searchText.trim()) {
    const escaped = searchText.trim().replace(/'/g, "''");
    conditions.push(
      `(LOWER(description) LIKE LOWER('%${escaped}%') OR LOWER(counterparty_name) LIKE LOWER('%${escaped}%'))`
    );
  }

  return conditions.length > 0 ? conditions.join(' AND ') : '1=1';
}

export function formatFilterChips(filters: FilterState): { label: string; onRemove: () => FilterState }[] {
  const chips: { label: string; onRemove: () => FilterState }[] = [];

  if (filters.banks.length > 0) {
    chips.push({
      label: filters.banks.length === 1 ? filters.banks[0] : `${filters.banks.length} banks`,
      onRemove: () => ({ ...filters, banks: [] }),
    });
  }

  if (filters.flow) {
    chips.push({
      label: filters.flow === 'in' ? 'credit' : 'debit',
      onRemove: () => ({ ...filters, flow: null }),
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
    chips.push({
      label,
      onRemove: () => ({ ...filters, amountMin: null, amountMax: null }),
    });
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
    chips.push({
      label,
      onRemove: () => ({ ...filters, dateFrom: null, dateTo: null }),
    });
  }

  return chips;
}
