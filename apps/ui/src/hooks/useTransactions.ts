import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useLiveQuery } from '@electric-sql/pglite-react';
import type { BankType, CategorySource, CurrencyCode, LedgerTransaction, TransactionType } from '~/types';
import { type FilterState, emptyFilterState } from '~/lib/filters';
import { transactionCountQuery, transactionPageQuery } from '~/lib/queries/analytics';

export type SortField = 'date' | 'amount';
export type SortOrder = 'asc' | 'desc';

export const PAGE_SIZE = 25;

interface TransactionRow {
  id: string;
  account_id: string;
  import_id: string;
  booked_at: Date;
  value_at: Date | null;
  seq: number;
  amount_minor: string;
  currency: string;
  balance_after_minor: string | null;
  description: string;
  narration: string | null;
  reference: string;
  counterparty_id: string | null;
  kind: string;
  category_id: string | null;
  category_source: string | null;
  parent_transaction_id: string | null;
  transfer_group_id: string | null;
  counterparty_name: string | null;
  category_name: string | null;
  account_bank: string;
  account_number_masked: string;
  account_name: string;
}

function mapRowToTransaction(row: TransactionRow): LedgerTransaction {
  return {
    id: row.id,
    accountId: row.account_id,
    importId: row.import_id,
    bookedAt: row.booked_at.toISOString(),
    valueAt: row.value_at?.toISOString() ?? null,
    seq: Number(row.seq),
    amountMinor: Number(row.amount_minor),
    currency: row.currency as CurrencyCode,
    balanceAfterMinor: row.balance_after_minor === null ? null : Number(row.balance_after_minor),
    description: row.description,
    narration: row.narration,
    reference: row.reference,
    counterpartyId: row.counterparty_id,
    kind: row.kind as TransactionType,
    categoryId: row.category_id,
    categorySource: row.category_source as CategorySource | null,
    parentTransactionId: row.parent_transaction_id,
    transferGroupId: row.transfer_group_id,
    counterpartyName: row.counterparty_name,
    categoryName: row.category_name,
    accountBank: row.account_bank as BankType,
    accountLabel: accountLabel(row),
  };
}

function accountLabel(row: TransactionRow): string {
  if (row.account_name) return row.account_name;
  if (row.account_number_masked) return `${row.account_bank} ${row.account_number_masked}`;
  return row.account_bank;
}

/**
 * Paged transaction list.
 *
 * Ordering and pagination happen in SQL — the previous version pulled every
 * matching row into memory and sliced it, which meant a full table read on
 * every keystroke in the search box.
 */
export function useTransactions() {
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [filters, setFilters] = useState<FilterState>(emptyFilterState);
  const [page, setPage] = useState(1);

  const pageQuery = useMemo(
    () =>
      transactionPageQuery(filters, deferredSearchQuery, {
        sortField,
        sortOrder,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    [filters, deferredSearchQuery, sortField, sortOrder, page]
  );

  const countQuery = useMemo(
    () => transactionCountQuery(filters, deferredSearchQuery),
    [filters, deferredSearchQuery]
  );

  const pageResult = useLiveQuery<TransactionRow>(pageQuery.sql, pageQuery.params);
  const countResult = useLiveQuery<{ count: string }>(countQuery.sql, countQuery.params);

  const transactions = useMemo(
    () => (pageResult?.rows ?? []).map(mapRowToTransaction),
    [pageResult?.rows]
  );

  const total = Number(countResult?.rows?.[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const applyFilters = useCallback((next: FilterState) => {
    setFilters(next);
    setPage(1);
  }, []);

  const applySearch = useCallback((next: string) => {
    setSearchQuery(next);
    setPage(1);
  }, []);

  const applySort = useCallback((field: SortField, order: SortOrder) => {
    setSortField(field);
    setSortOrder(order);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(emptyFilterState);
    setPage(1);
  }, []);

  return {
    transactions,
    total,
    page,
    totalPages,
    setPage,
    sortField,
    sortOrder,
    searchQuery,
    dataSearchQuery: deferredSearchQuery,
    isSearchPending: searchQuery !== deferredSearchQuery,
    setSearchQuery: applySearch,
    filters,
    setFilters: applyFilters,
    clearFilters,
    setSort: applySort,
    isLoading: pageResult === undefined,
  };
}
