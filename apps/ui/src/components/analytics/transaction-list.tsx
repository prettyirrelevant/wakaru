import { useRef, useState } from 'react';
import type { CurrencyCode, LedgerTransaction } from '~/types';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { PAGE_SIZE, type SortField, type SortOrder, type useTransactions } from '~/hooks/useTransactions';
import { FilterPanel } from './filter-panel';
import { TransactionDetailSheet } from './transaction-detail-sheet';
import { countActiveFilters, isFilterEmpty, formatFilterChips } from '~/lib/filters';
import { formatCurrency, formatDate, formatDateTime } from '~/lib/utils';
import { cn } from '~/lib/utils';
import { useTinykeys } from '~/hooks/useTinykeys';

type TransactionsController = ReturnType<typeof useTransactions>;

interface TransactionListProps {
  controller: TransactionsController;
  currency: CurrencyCode;
  disableShortcuts?: boolean;
}

export function TransactionList({
  controller,
  currency,
  disableShortcuts = false,
}: TransactionListProps) {
  const [selectedTransaction, setSelectedTransaction] = useState<LedgerTransaction | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const {
    transactions,
    total,
    page,
    totalPages,
    setPage,
    sortField,
    sortOrder,
    setSort,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    clearFilters,
    isLoading,
    isSearchPending,
  } = controller;

  const activeFilterCount = countActiveFilters(filters);
  const filterChips = formatFilterChips(filters);
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  useTinykeys(
    {
      '$mod+Shift+KeyF': (event) => {
        event.preventDefault();
        searchInputRef.current?.focus();
      },
      Escape: () => {
        const input = searchInputRef.current;
        if (input && document.activeElement === input) input.blur();
      },
    },
    disableShortcuts
  );

  const updateSort = (value: string) => {
    const [field, order] = value.split('-') as [SortField, SortOrder];
    setSort(field, order);
  };

  return (
    <section className="space-y-4" aria-labelledby="transactions-heading">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="transactions-heading" className="text-lg font-semibold tracking-[-0.025em]">
            transactions
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {isSearchPending
              ? 'searching…'
              : total > 0
                ? `${rangeStart}–${rangeEnd} of ${total}`
                : 'no transactions to show'}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="relative block min-w-0">
          <span className="sr-only">Search transactions</span>
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={searchInputRef}
            name="transaction-search"
            type="search"
            autoComplete="off"
            placeholder="search merchants, descriptions, or references…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="tui-input h-11 w-full pl-10 pr-12 text-base sm:text-sm"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">
            mod+shift+f
          </kbd>
        </label>

        <button
          type="button"
          onClick={() => setShowFilters((visible) => !visible)}
          aria-expanded={showFilters}
          className={cn(
            'flex h-11 touch-manipulation items-center justify-center gap-2 border px-3 text-sm font-semibold transition-colors',
            showFilters || activeFilterCount > 0
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-border bg-surface text-foreground hover:border-border-strong'
          )}
        >
          [filters]
          {activeFilterCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center bg-accent px-1 font-mono text-[10px] text-accent-foreground">
              {activeFilterCount}
            </span>
          )}
        </button>

        <label className="relative">
          <span className="sr-only">Sort transactions</span>
          <select
            name="transaction-sort"
            aria-label="Sort transactions"
            value={`${sortField}-${sortOrder}`}
            onChange={(event) => updateSort(event.target.value)}
            className="h-11 w-full border border-border bg-surface px-3 text-sm font-semibold focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:w-auto"
          >
            <option value="date-desc">newest first</option>
            <option value="date-asc">oldest first</option>
            <option value="amount-desc">largest first</option>
            <option value="amount-asc">smallest first</option>
          </select>
        </label>
      </div>

      {showFilters && (
        <div className="border border-border bg-surface p-4 sm:p-5">
          <FilterPanel filters={filters} onChange={setFilters} />
        </div>
      )}

      {!isFilterEmpty(filters) && (
        <div className="flex flex-wrap items-center gap-2">
          {filterChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setFilters(chip.next)}
              className="inline-flex touch-manipulation items-center gap-1.5 border border-accent/25 bg-accent/[0.07] px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent/10"
            >
              {chip.label}
              <Icon name="x" className="h-3 w-3" />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="px-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            clear all
          </button>
        </div>
      )}

      <div className="overflow-hidden border border-border bg-surface">
        {isLoading ? (
          <div className="px-6 py-14 text-center" role="status">
            <p className="cursor-blink text-xs text-muted-foreground">$ loading transactions </p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center border border-border bg-muted text-muted-foreground">
              <Icon name="search" className="h-4 w-4" />
            </span>
            <p className="mt-4 text-sm font-semibold">
              {searchQuery || !isFilterEmpty(filters) ? 'no matching transactions' : 'no transactions yet'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {searchQuery || !isFilterEmpty(filters)
                ? 'change the search or remove a filter.'
                : 'import a statement to build your ledger.'}
            </p>
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {transactions.map((transaction) => (
              <li key={transaction.id}>
                <TransactionRow
                  transaction={transaction}
                  currency={currency}
                  onClick={() => setSelectedTransaction(transaction)}
                />
              </li>
            ))}
          </ol>
        )}
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Transaction pages">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            <Icon name="chevron-left" className="h-4 w-4" />
            Previous
          </Button>
          <span className="mono-nums text-xs text-muted-foreground">
            page {page}/{totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
          >
            Next
            <Icon name="chevron-right" className="h-4 w-4" />
          </Button>
        </nav>
      )}

      <TransactionDetailSheet
        transaction={selectedTransaction}
        currency={currency}
        onClose={() => setSelectedTransaction(null)}
      />
    </section>
  );
}

function TransactionRow({
  transaction,
  currency,
  onClick,
}: {
  transaction: LedgerTransaction;
  currency: CurrencyCode;
  onClick: () => void;
}) {
  const isInflow = transaction.amountMinor > 0;
  const isInternal = transaction.transferGroupId !== null;
  const name = transaction.counterpartyName || transaction.description;

  return (
    <button
      type="button"
      onClick={onClick}
      className="grid w-full touch-manipulation grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/45 active:bg-muted/70 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:px-5"
      aria-label={`Open ${name} transaction for ${formatCurrency(Math.abs(transaction.amountMinor), transaction.currency ?? currency)}`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {transaction.accountLabel}
          {transaction.categoryName ? ` · ${transaction.categoryName}` : ''}
          {isInternal ? ' · Transfer' : ''}
        </p>
      </div>

      <span
        title={formatDateTime(transaction.bookedAt)}
        className="hidden text-xs text-muted-foreground sm:block"
      >
        {formatDate(transaction.bookedAt)}
      </span>

      <div className="text-right">
        <p
          className={cn(
            'mono-nums text-sm font-semibold',
            isInternal ? 'text-muted-foreground' : isInflow ? 'text-success' : 'text-foreground'
          )}
        >
          {isInflow ? '+' : '-'}
          {formatCurrency(Math.abs(transaction.amountMinor), transaction.currency ?? currency)}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground sm:hidden">
          {formatDate(transaction.bookedAt)}
        </p>
      </div>
    </button>
  );
}
