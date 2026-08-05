import { useMemo } from 'react';
import { useLiveQuery } from '@electric-sql/pglite-react';

export interface AccountOption {
  id: string;
  bank: string;
  label: string;
}

export interface CategoryOption {
  id: string;
  name: string;
}

const ACCOUNTS_QUERY = `
  SELECT a.id, a.bank, a.name, a.number_masked, COUNT(t.id) AS tx_count
  FROM accounts a
  LEFT JOIN transactions t ON t.account_id = a.id
  GROUP BY a.id, a.bank, a.name, a.number_masked
  ORDER BY a.bank, a.number_masked
`;

const CATEGORIES_QUERY = `
  SELECT DISTINCT c.id, c.name
  FROM categories c
  JOIN transactions t ON t.category_id = c.id
  ORDER BY c.name
`;

const KINDS_QUERY = 'SELECT DISTINCT kind FROM transactions ORDER BY kind';

const DATE_RANGE_QUERY =
  'SELECT MIN(booked_at) AS min_date, MAX(booked_at) AS max_date FROM transactions';

export function useFilterOptions() {
  const accountsResult = useLiveQuery<{
    id: string;
    bank: string;
    name: string;
    number_masked: string;
    tx_count: string;
  }>(ACCOUNTS_QUERY);

  const categoriesResult = useLiveQuery<{ id: string; name: string }>(CATEGORIES_QUERY);
  const kindsResult = useLiveQuery<{ kind: string }>(KINDS_QUERY);
  const dateRangeResult = useLiveQuery<{ min_date: Date | null; max_date: Date | null }>(
    DATE_RANGE_QUERY
  );

  const accounts = useMemo<AccountOption[]>(
    () =>
      (accountsResult?.rows ?? []).map((row) => ({
        id: row.id,
        bank: row.bank,
        label: row.name || (row.number_masked ? `${row.bank} ${row.number_masked}` : row.bank),
      })),
    [accountsResult?.rows]
  );

  const banks = useMemo(
    () => [...new Set(accounts.map((a) => a.bank))].sort(),
    [accounts]
  );

  const categories = useMemo<CategoryOption[]>(
    () => (categoriesResult?.rows ?? []).map((row) => ({ id: row.id, name: row.name })),
    [categoriesResult?.rows]
  );

  const kinds = useMemo(
    () => (kindsResult?.rows ?? []).map((r) => r.kind),
    [kindsResult?.rows]
  );

  const dateRange = dateRangeResult?.rows?.[0];
  const minDate = dateRange?.min_date ? dateRange.min_date.toISOString().slice(0, 10) : null;
  const maxDate = dateRange?.max_date ? dateRange.max_date.toISOString().slice(0, 10) : null;

  return { accounts, banks, categories, kinds, minDate, maxDate };
}
