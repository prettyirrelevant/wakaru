import { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from '@electric-sql/pglite-react';
import type { Transaction, TransactionMeta } from '~/types';
import { type FilterState, type WhereClauseResult, emptyFilterState, buildWhereClause } from '~/lib/filters';

export type SortField = 'date' | 'amount';
export type SortOrder = 'asc' | 'desc';

export interface TransactionRow {
  id: string;
  date: Date;
  created_at: string;
  description: string;
  amount: number;
  category: string;
  bank_source: string;
  reference: string;
  counterparty_name: string | null;
  counterparty_account: string | null;
  counterparty_bank: string | null;
  transaction_type: string | null;
  bill_type: string | null;
  bill_provider: string | null;
  bill_token: string | null;
  narration: string | null;
  session_id: string | null;
  raw_category: string | null;
  balance_after: number | null;
}

export function mapRowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    date: row.date.toISOString(),
    createdAt: Number(row.created_at),
    description: row.description,
    amount: row.amount,
    category: row.category as Transaction['category'],
    bankSource: row.bank_source as Transaction['bankSource'],
    reference: row.reference,
    meta: {
      counterpartyName: row.counterparty_name ?? undefined,
      counterpartyAccount: row.counterparty_account ?? undefined,
      counterpartyBank: row.counterparty_bank ?? undefined,
      type: row.transaction_type as TransactionMeta['type'],
      billType: row.bill_type ?? undefined,
      billProvider: row.bill_provider ?? undefined,
      billToken: row.bill_token ?? undefined,
      narration: row.narration ?? undefined,
      sessionId: row.session_id ?? undefined,
      rawCategory: row.raw_category ?? undefined,
      balanceAfter: row.balance_after ?? undefined,
    },
  };
}

export function useTransactions() {
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterState>(emptyFilterState);

  const { query, params } = useMemo(() => {
    const orderByColumn = sortField === 'amount' ? 'ABS(amount)' : 'date';
    const orderDir = sortOrder === 'desc' ? 'DESC' : 'ASC';
    const whereClause = buildWhereClause(filters, searchQuery);

    return {
      query: `SELECT * FROM transactions WHERE ${whereClause.sql} ORDER BY ${orderByColumn} ${orderDir}`,
      params: whereClause.params,
    };
  }, [sortField, sortOrder, searchQuery, filters]);

  const result = useLiveQuery<TransactionRow>(query, params);
  
  const transactions = useMemo(
    () => (result?.rows ?? []).map(mapRowToTransaction),
    [result?.rows]
  );

  const toggleSort = useCallback((field: SortField) => {
    if (field === sortField) {
      setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  }, [sortField]);

  const clearFilters = useCallback(() => {
    setFilters(emptyFilterState);
  }, []);

  return {
    transactions,
    sortField,
    sortOrder,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    clearFilters,
    toggleSort,
  };
}
