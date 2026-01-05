import { useLiveQuery } from '@electric-sql/pglite-react';

interface BankRow {
  bank_source: string;
}

interface CategoryRow {
  category: string;
}

interface DateRangeRow {
  min_date: Date | null;
  max_date: Date | null;
}

export function useFilterOptions() {
  const banksResult = useLiveQuery<BankRow>(
    'SELECT DISTINCT bank_source FROM transactions ORDER BY bank_source'
  );

  const categoriesResult = useLiveQuery<CategoryRow>(
    'SELECT DISTINCT category FROM transactions ORDER BY category'
  );

  const dateRangeResult = useLiveQuery<DateRangeRow>(
    'SELECT MIN(date) as min_date, MAX(date) as max_date FROM transactions'
  );

  const banks = (banksResult?.rows ?? []).map(r => r.bank_source);
  const categories = (categoriesResult?.rows ?? []).map(r => r.category);
  
  const dateRange = dateRangeResult?.rows?.[0];
  const minDate = dateRange?.min_date ? dateRange.min_date.toISOString().split('T')[0] : null;
  const maxDate = dateRange?.max_date ? dateRange.max_date.toISOString().split('T')[0] : null;

  return {
    banks,
    categories,
    minDate,
    maxDate,
  };
}
