import { describe, it, expect } from 'vitest';
import {
  isFilterEmpty,
  countActiveFilters,
  buildWhereClause,
  formatFilterChips,
  emptyFilterState,
  type FilterState,
} from '~/lib/filters';

describe('filters', () => {
  describe('isFilterEmpty', () => {
    it('returns true for empty filter state', () => {
      expect(isFilterEmpty(emptyFilterState)).toBe(true);
    });

    it('returns false when banks filter is set', () => {
      const state: FilterState = { ...emptyFilterState, banks: ['GTB'] };
      expect(isFilterEmpty(state)).toBe(false);
    });

    it('returns false when flow filter is set', () => {
      const state: FilterState = { ...emptyFilterState, flow: 'in' };
      expect(isFilterEmpty(state)).toBe(false);
    });

    it('returns false when amount filters are set', () => {
      const state: FilterState = { ...emptyFilterState, amountMin: 100 };
      expect(isFilterEmpty(state)).toBe(false);
    });

    it('returns false when date filters are set', () => {
      const state: FilterState = { ...emptyFilterState, dateFrom: '2024-01-01' };
      expect(isFilterEmpty(state)).toBe(false);
    });
  });

  describe('countActiveFilters', () => {
    it('returns 0 for empty filter state', () => {
      expect(countActiveFilters(emptyFilterState)).toBe(0);
    });

    it('counts banks as 1 filter regardless of count', () => {
      const state: FilterState = { ...emptyFilterState, banks: ['GTB', 'Kuda', 'OPay'] };
      expect(countActiveFilters(state)).toBe(1);
    });

    it('counts flow as 1 filter', () => {
      const state: FilterState = { ...emptyFilterState, flow: 'out' };
      expect(countActiveFilters(state)).toBe(1);
    });

    it('counts amount range as 1 filter', () => {
      const state: FilterState = { ...emptyFilterState, amountMin: 100, amountMax: 500 };
      expect(countActiveFilters(state)).toBe(1);
    });

    it('counts date range as 1 filter', () => {
      const state: FilterState = { ...emptyFilterState, dateFrom: '2024-01-01', dateTo: '2024-12-31' };
      expect(countActiveFilters(state)).toBe(1);
    });

    it('counts all active filters', () => {
      const state: FilterState = {
        banks: ['GTB'],
        flow: 'in',
        amountMin: 100,
        amountMax: null,
        dateFrom: '2024-01-01',
        dateTo: null,
      };
      expect(countActiveFilters(state)).toBe(4);
    });
  });

  describe('buildWhereClause', () => {
    it('returns 1=1 for empty filters and no search', () => {
      const result = buildWhereClause(emptyFilterState, '');
      expect(result.sql).toBe('1=1');
      expect(result.params).toEqual([]);
    });

    it('builds parameterized query for bank filter', () => {
      const state: FilterState = { ...emptyFilterState, banks: ['GTB', 'Kuda'] };
      const result = buildWhereClause(state, '');
      expect(result.sql).toBe('bank_source IN ($1, $2)');
      expect(result.params).toEqual(['GTB', 'Kuda']);
    });

    it('builds query for inflow filter', () => {
      const state: FilterState = { ...emptyFilterState, flow: 'in' };
      const result = buildWhereClause(state, '');
      expect(result.sql).toBe('amount > 0');
      expect(result.params).toEqual([]);
    });

    it('builds query for outflow filter', () => {
      const state: FilterState = { ...emptyFilterState, flow: 'out' };
      const result = buildWhereClause(state, '');
      expect(result.sql).toBe('amount < 0');
      expect(result.params).toEqual([]);
    });

    it('converts amount to kobo for min amount', () => {
      const state: FilterState = { ...emptyFilterState, amountMin: 100 };
      const result = buildWhereClause(state, '');
      expect(result.sql).toBe('ABS(amount) >= $1');
      expect(result.params).toEqual([10000]); // 100 * 100 = 10000 kobo
    });

    it('converts amount to kobo for max amount', () => {
      const state: FilterState = { ...emptyFilterState, amountMax: 500 };
      const result = buildWhereClause(state, '');
      expect(result.sql).toBe('ABS(amount) <= $1');
      expect(result.params).toEqual([50000]); // 500 * 100 = 50000 kobo
    });

    it('builds parameterized query for date from', () => {
      const state: FilterState = { ...emptyFilterState, dateFrom: '2024-01-01' };
      const result = buildWhereClause(state, '');
      expect(result.sql).toBe('date >= $1');
      expect(result.params).toEqual(['2024-01-01']);
    });

    it('builds parameterized query for date to', () => {
      const state: FilterState = { ...emptyFilterState, dateTo: '2024-12-31' };
      const result = buildWhereClause(state, '');
      expect(result.sql).toBe('date <= $1');
      expect(result.params).toEqual(['2024-12-31']);
    });

    it('builds parameterized query for search text', () => {
      const result = buildWhereClause(emptyFilterState, 'uber');
      expect(result.sql).toBe('(LOWER(description) LIKE LOWER($1) OR LOWER(counterparty_name) LIKE LOWER($1))');
      expect(result.params).toEqual(['%uber%']);
    });

    it('trims search text', () => {
      const result = buildWhereClause(emptyFilterState, '  uber  ');
      expect(result.params).toEqual(['%uber%']);
    });

    it('combines multiple filters with AND', () => {
      const state: FilterState = {
        banks: ['GTB'],
        flow: 'in',
        amountMin: 100,
        amountMax: null,
        dateFrom: '2024-01-01',
        dateTo: null,
      };
      const result = buildWhereClause(state, 'transfer');
      expect(result.sql).toContain('AND');
      expect(result.sql).toContain('bank_source IN ($1)');
      expect(result.sql).toContain('amount > 0');
      expect(result.sql).toContain('ABS(amount) >= $2');
      expect(result.sql).toContain('date >= $3');
      expect(result.params).toEqual(['GTB', 10000, '2024-01-01', '%transfer%']);
    });

    it('prevents SQL injection by using parameterized queries', () => {
      const state: FilterState = { ...emptyFilterState, banks: ["'; DROP TABLE transactions; --"] };
      const result = buildWhereClause(state, '');
      // The malicious input should be in params, not in the SQL string
      expect(result.sql).toBe('bank_source IN ($1)');
      expect(result.params).toEqual(["'; DROP TABLE transactions; --"]);
      expect(result.sql).not.toContain('DROP TABLE');
    });
  });

  describe('formatFilterChips', () => {
    it('returns empty array for empty filters', () => {
      const chips = formatFilterChips(emptyFilterState);
      expect(chips).toEqual([]);
    });

    it('formats single bank chip', () => {
      const state: FilterState = { ...emptyFilterState, banks: ['GTB'] };
      const chips = formatFilterChips(state);
      expect(chips).toHaveLength(1);
      expect(chips[0].label).toBe('GTB');
    });

    it('formats multiple banks chip', () => {
      const state: FilterState = { ...emptyFilterState, banks: ['GTB', 'Kuda', 'OPay'] };
      const chips = formatFilterChips(state);
      expect(chips).toHaveLength(1);
      expect(chips[0].label).toBe('3 banks');
    });

    it('formats inflow as credit', () => {
      const state: FilterState = { ...emptyFilterState, flow: 'in' };
      const chips = formatFilterChips(state);
      expect(chips).toHaveLength(1);
      expect(chips[0].label).toBe('credit');
    });

    it('formats outflow as debit', () => {
      const state: FilterState = { ...emptyFilterState, flow: 'out' };
      const chips = formatFilterChips(state);
      expect(chips).toHaveLength(1);
      expect(chips[0].label).toBe('debit');
    });

    it('formats amount range', () => {
      const state: FilterState = { ...emptyFilterState, amountMin: 100, amountMax: 500 };
      const chips = formatFilterChips(state);
      expect(chips).toHaveLength(1);
      expect(chips[0].label).toContain('100');
      expect(chips[0].label).toContain('500');
    });

    it('formats min amount only', () => {
      const state: FilterState = { ...emptyFilterState, amountMin: 100, amountMax: null };
      const chips = formatFilterChips(state);
      expect(chips[0].label).toContain('≥');
    });

    it('formats max amount only', () => {
      const state: FilterState = { ...emptyFilterState, amountMin: null, amountMax: 500 };
      const chips = formatFilterChips(state);
      expect(chips[0].label).toContain('≤');
    });

    it('formats date range', () => {
      const state: FilterState = { ...emptyFilterState, dateFrom: '2024-01-01', dateTo: '2024-12-31' };
      const chips = formatFilterChips(state);
      expect(chips).toHaveLength(1);
      expect(chips[0].label).toBe('2024-01-01 to 2024-12-31');
    });

    it('formats date from only', () => {
      const state: FilterState = { ...emptyFilterState, dateFrom: '2024-01-01', dateTo: null };
      const chips = formatFilterChips(state);
      expect(chips[0].label).toBe('from 2024-01-01');
    });

    it('formats date to only', () => {
      const state: FilterState = { ...emptyFilterState, dateFrom: null, dateTo: '2024-12-31' };
      const chips = formatFilterChips(state);
      expect(chips[0].label).toBe('until 2024-12-31');
    });

    it('onRemove clears the correct filter', () => {
      const state: FilterState = { ...emptyFilterState, banks: ['GTB'], flow: 'in' };
      const chips = formatFilterChips(state);

      const bankChip = chips.find(c => c.label === 'GTB');
      const newState = bankChip!.onRemove();
      expect(newState.banks).toEqual([]);
      expect(newState.flow).toBe('in'); // Other filters unchanged
    });
  });
});
