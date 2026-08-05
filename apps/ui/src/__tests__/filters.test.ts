import { describe, it, expect } from 'vitest';
import {
  isFilterEmpty,
  countActiveFilters,
  buildWhereClause,
  buildScopeClause,
  formatFilterChips,
  emptyFilterState,
  periodToRange,
  type FilterState,
} from '~/lib/filters';

/** `excludeInternal` defaults on, so switch it off where it is not the subject. */
const base: FilterState = { ...emptyFilterState, excludeInternal: false };

describe('filters', () => {
  describe('what counts as filtered', () => {
    it('treats the default state as unfiltered, including its default exclusions', () => {
      expect(isFilterEmpty(emptyFilterState)).toBe(true);
      expect(isFilterEmpty({ ...emptyFilterState, excludeInternal: true })).toBe(true);
      expect(countActiveFilters(emptyFilterState)).toBe(0);
    });

    it('counts a multi-value dimension once, not once per value', () => {
      expect(countActiveFilters({ ...emptyFilterState, banks: ['gtb', 'kuda', 'opay'] })).toBe(1);
      expect(countActiveFilters({ ...emptyFilterState, amountMin: 100, amountMax: 500 })).toBe(1);
      expect(
        countActiveFilters({ ...emptyFilterState, dateFrom: '2024-01-01', dateTo: '2024-12-31' })
      ).toBe(1);
    });
  });

  describe('buildWhereClause', () => {
    it('returns TRUE when nothing is filtered', () => {
      expect(buildWhereClause(base, '').sql).toBe('TRUE');
    });

    it('treats uncategorized as a null category alongside explicit ones', () => {
      const result = buildWhereClause({ ...base, categories: ['cat-food', 'uncategorized'] }, '');
      expect(result.sql).toBe('(t.category_id IN ($1) OR t.category_id IS NULL)');
      expect(result.params).toEqual(['cat-food']);
    });

    it('converts amounts to minor units, rounding rather than passing a float', () => {
      expect(buildWhereClause({ ...base, amountMin: 100 }, '').params).toEqual([10000]);
      expect(buildWhereClause({ ...base, amountMin: 10.005 }, '').params).toEqual([1001]);
    });

    it('uses a half-open upper bound so the end date is included', () => {
      // A plain `<=` against a timestamptz pins to midnight and drops the day.
      expect(buildWhereClause({ ...base, dateTo: '2024-12-31' }, '').sql).toBe(
        "t.booked_at < $1::date + INTERVAL '1 day'"
      );
    });

    it('leaves fee rows alone — hiding them is a list concern, not an analytics one', () => {
      expect(buildWhereClause({ ...base, hideChildFees: true }, '').sql).toBe('TRUE');
    });

    it('numbers parameters in the order the clauses are emitted', () => {
      const state: FilterState = {
        ...base,
        currency: 'NGN',
        banks: ['gtb'],
        flow: 'in',
        amountMin: 100,
        dateFrom: '2024-01-01',
      };
      const result = buildWhereClause(state, 'transfer');

      expect(result.sql).toContain('t.currency = $1');
      expect(result.sql).toContain('a.bank IN ($2)');
      expect(result.sql).toContain('ABS(t.amount_minor) >= $3');
      expect(result.sql).toContain('t.booked_at >= $4::date');
      expect(result.sql).toContain('t.search_text LIKE $5');
      expect(result.params).toEqual(['NGN', 'gtb', 10000, '2024-01-01', '%transfer%']);
    });

    it('keeps hostile input out of the SQL string', () => {
      const result = buildWhereClause({ ...base, banks: ["'; DROP TABLE transactions; --"] }, '');
      expect(result.sql).toBe('a.bank IN ($1)');
      expect(result.sql).not.toContain('DROP TABLE');
      expect(result.params).toEqual(["'; DROP TABLE transactions; --"]);
    });
  });

  describe('buildScopeClause', () => {
    it('keeps account, currency and date but drops anything that would distort a balance', () => {
      const result = buildScopeClause({
        ...base,
        currency: 'NGN',
        accounts: ['acc-1'],
        dateFrom: '2024-01-01',
        categories: ['cat-food'],
        kinds: ['card_payment'],
        flow: 'out',
        amountMin: 500,
        excludeInternal: true,
      });

      expect(result.sql).toContain('t.currency = $1');
      expect(result.sql).toContain('t.account_id IN ($2)');
      expect(result.sql).toContain('t.booked_at >= $3::date');
      expect(result.sql).not.toContain('category_id');
      expect(result.sql).not.toContain('kind');
      expect(result.sql).not.toContain('ABS(');
      expect(result.sql).not.toContain('transfer_group_id');
    });
  });

  describe('formatFilterChips', () => {
    it('names one value and counts several', () => {
      expect(formatFilterChips({ ...base, banks: ['gtb'] })[0].label).toBe('gtb');
      expect(formatFilterChips({ ...base, banks: ['gtb', 'kuda', 'opay'] })[0].label).toBe('3 banks');
    });

    it('resolves a category id through the supplied labels', () => {
      const chips = formatFilterChips(
        { ...base, categories: ['cat-food'] },
        { categories: { 'cat-food': 'Food & drink' } }
      );
      expect(chips[0].label).toBe('Food & drink');
    });

    it('clears only its own dimension', () => {
      const state: FilterState = { ...base, banks: ['gtb'], flow: 'in' };
      const bankChip = formatFilterChips(state).find((c) => c.label === 'gtb');

      expect(bankChip!.next.banks).toEqual([]);
      expect(bankChip!.next.flow).toBe('in');
    });
  });

  describe('periodToRange', () => {
    it('bounds each period inclusively of today, and not at all for "all"', () => {
      const now = new Date('2026-03-15T12:00:00.000Z');

      expect(periodToRange('all', now)).toEqual({ dateFrom: null, dateTo: null });
      expect(periodToRange('30d', now)).toEqual({ dateFrom: '2026-02-14', dateTo: '2026-03-15' });
      expect(periodToRange('this-month', now)).toEqual({
        dateFrom: '2026-03-01',
        dateTo: '2026-03-15',
      });
      expect(periodToRange('this-year', now)).toEqual({
        dateFrom: '2026-01-01',
        dateTo: '2026-03-15',
      });
    });
  });
});
