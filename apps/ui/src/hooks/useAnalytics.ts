import { useMemo } from 'react';
import { useLiveQuery } from '@electric-sql/pglite-react';
import type { BalancePoint, CategorySpend, CounterpartySpend, MonthlyData } from '~/types';
import type { FilterState } from '~/lib/filters';
import type { PreparedQuery } from '~/lib/queries/analytics';
import {
  categorySpendQuery,
  dailyBalanceQuery,
  internalTransferQuery,
  monthlyFlowQuery,
  recurringQuery,
  summaryQuery,
  topCounterpartiesQuery,
} from '~/lib/queries/analytics';

export interface Summary {
  inflowMinor: number;
  outflowMinor: number;
  netMinor: number;
  feesMinor: number;
  count: number;
  minDate: Date | null;
  maxDate: Date | null;
}

export interface RecurringPayment {
  name: string;
  occurrences: number;
  avgAmountMinor: number;
}

/**
 * Run a prepared query and map its rows.
 *
 * Every analytics hook is the same three steps — build the query from the
 * current filters, subscribe, convert Postgres' bigint strings to numbers — so
 * they share one implementation rather than seven copies of it.
 */
function useQuery<Row, Out>(
  build: () => PreparedQuery,
  map: (rows: Row[]) => Out,
  deps: unknown[]
): Out {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const query = useMemo(build, deps);
  const result = useLiveQuery<Row>(query.sql, query.params);
  const rows = result?.rows;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => map((rows ?? []) as Row[]), [rows]);
}

function useSummary(filters: FilterState, search: string): Summary {
  return useQuery<
    { inflow: string; outflow: string; fees: string; count: string; min_date: Date | null; max_date: Date | null },
    Summary
  >(
    () => summaryQuery(filters, search),
    (rows) => {
      const row = rows[0];
      const inflowMinor = Number(row?.inflow ?? 0);
      const outflowMinor = Number(row?.outflow ?? 0);
      return {
        inflowMinor,
        outflowMinor,
        netMinor: inflowMinor - outflowMinor,
        feesMinor: Number(row?.fees ?? 0),
        count: Number(row?.count ?? 0),
        minDate: row?.min_date ?? null,
        maxDate: row?.max_date ?? null,
      };
    },
    [filters, search]
  );
}

function useInternalTransfers(filters: FilterState, search: string) {
  return useQuery<{ groups: string; amount: string }, { groups: number; amountMinor: number }>(
    () => internalTransferQuery(filters, search),
    (rows) => ({
      groups: Number(rows[0]?.groups ?? 0),
      amountMinor: Number(rows[0]?.amount ?? 0),
    }),
    [filters, search]
  );
}

function useMonthlyFlow(filters: FilterState, search: string): MonthlyData[] {
  return useQuery<{ month: string; inflow: string; outflow: string }, MonthlyData[]>(
    () => monthlyFlowQuery(filters, search),
    (rows) =>
      rows.map((row) => ({
        month: row.month,
        inflow: Number(row.inflow),
        outflow: Number(row.outflow),
      })),
    [filters, search]
  );
}

function useCategorySpend(filters: FilterState, search: string): CategorySpend[] {
  return useQuery<
    { category_id: string | null; category_name: string; amount: string; count: string },
    CategorySpend[]
  >(
    () => categorySpendQuery(filters, search),
    (rows) => {
      const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
      return rows.map((row) => ({
        categoryId: row.category_id,
        categoryName: row.category_name,
        amountMinor: Number(row.amount),
        share: total > 0 ? Number(row.amount) / total : 0,
        count: Number(row.count),
      }));
    },
    [filters, search]
  );
}

function useTopCounterparties(
  filters: FilterState,
  search: string,
  direction: 'out' | 'in' = 'out'
): CounterpartySpend[] {
  return useQuery<
    { counterparty_id: string | null; name: string; amount: string; count: string },
    CounterpartySpend[]
  >(
    () => topCounterpartiesQuery(filters, search, direction),
    (rows) =>
      rows.map((row) => ({
        counterpartyId: row.counterparty_id,
        name: row.name,
        amountMinor: Number(row.amount),
        count: Number(row.count),
      })),
    [filters, search, direction]
  );
}

function useRecurringPayments(filters: FilterState, search: string): RecurringPayment[] {
  return useQuery<{ name: string; occurrences: string; avg_amount: string }, RecurringPayment[]>(
    () => recurringQuery(filters, search),
    (rows) =>
      rows.map((row) => ({
        name: row.name,
        occurrences: Number(row.occurrences),
        avgAmountMinor: Number(row.avg_amount),
      })),
    [filters, search]
  );
}

/**
 * Total balance over time.
 *
 * Each account only reports a balance on days it saw activity, so an account
 * that was quiet for a week would drop out of the total and make it collapse.
 * Carry each account's last known balance forward before summing.
 */
function useBalanceSeries(filters: FilterState): BalancePoint[] {
  return useQuery<{ account_id: string; day: Date; closing: string }, BalancePoint[]>(
    () => dailyBalanceQuery(filters),
    (rows) => {
      const byDay = new Map<string, Map<string, number>>();
      for (const row of rows) {
        const day = row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day);
        if (!byDay.has(day)) byDay.set(day, new Map());
        byDay.get(day)!.set(row.account_id, Number(row.closing));
      }

      const lastKnown = new Map<string, number>();
      return [...byDay.keys()].sort().map((day) => {
        for (const [accountId, closing] of byDay.get(day)!) lastKnown.set(accountId, closing);
        let total = 0;
        for (const balance of lastKnown.values()) total += balance;
        return { at: day, balanceMinor: total };
      });
    },
    [filters]
  );
}

export function useDashboardData(filters: FilterState, search: string) {
  return {
    summary: useSummary(filters, search),
    internalTransfers: useInternalTransfers(filters, search),
    monthlyFlow: useMonthlyFlow(filters, search),
    balanceSeries: useBalanceSeries(filters),
    categorySpend: useCategorySpend(filters, search),
    paidTo: useTopCounterparties(filters, search, 'out'),
    receivedFrom: useTopCounterparties(filters, search, 'in'),
    recurringPayments: useRecurringPayments(filters, search),
  };
}
