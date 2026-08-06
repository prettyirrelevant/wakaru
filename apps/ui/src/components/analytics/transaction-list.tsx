import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from '@electric-sql/pglite-react';
import type { CurrencyCode, LedgerTransaction } from '~/types';
import { formatCurrency, formatDate, formatDateTime, formatKind } from '~/lib/utils';
import { cn } from '~/lib/utils';
import { BottomSheet } from '~/components/ui';
import { PAGE_SIZE, type useTransactions } from '~/hooks/useTransactions';
import { FilterPanel } from './filter-panel';
import { CategoryPicker } from './category-picker';
import { countActiveFilters, isFilterEmpty, formatFilterChips } from '~/lib/filters';
import { childFeesQuery } from '~/lib/queries/analytics';

type TransactionsApi = ReturnType<typeof useTransactions>;

interface TransactionListProps {
  controller: TransactionsApi;
  currency: CurrencyCode;
  disableShortcuts?: boolean;
}

export function TransactionList({
  controller,
  currency,
  disableShortcuts = false,
}: TransactionListProps) {
  const [selectedTx, setSelectedTx] = useState<LedgerTransaction | null>(null);
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
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    clearFilters,
    toggleSort,
  } = controller;

  const activeFilterCount = countActiveFilters(filters);
  const filterChips = formatFilterChips(filters);

  useEffect(() => {
    if (disableShortcuts) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';

      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        searchInputRef.current?.blur();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [disableShortcuts]);

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <section className="space-y-3" aria-labelledby="transactions-heading">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">$</span>
          <h2 id="transactions-heading" className="text-sm font-medium">
            transactions
          </h2>
          {total > 0 && (
            <span className="mono-nums text-xs text-muted-foreground">
              {rangeStart}–{rangeEnd} of {total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <SortButton
            label="date"
            active={sortField === 'date'}
            order={sortOrder}
            onClick={() => toggleSort('date')}
          />
          <SortButton
            label="amount"
            active={sortField === 'amount'}
            order={sortOrder}
            onClick={() => toggleSort('amount')}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
            aria-hidden="true"
          >
            /
          </span>
          <input
            ref={searchInputRef}
            type="search"
            aria-label="Search transactions"
            placeholder="uber, spotify, rent... (press /)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="tui-input w-full pl-7 text-base sm:text-sm"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
          className={cn(
            'shrink-0 border px-3 py-2 text-xs',
            showFilters || activeFilterCount > 0
              ? 'border-accent bg-accent text-accent-foreground'
              : 'border-border hover:border-border-strong'
          )}
        >
          filter{activeFilterCount > 0 && ` (${activeFilterCount})`}
        </button>
      </div>

      {showFilters && <FilterPanel filters={filters} onChange={setFilters} />}

      {!isFilterEmpty(filters) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filterChips.map((chip, i) => (
            <button
              key={i}
              onClick={() => setFilters(chip.next)}
              className="inline-flex items-center gap-1 border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] text-accent hover:bg-accent/20"
            >
              {chip.label}
              <span aria-hidden="true" className="text-accent/70">
                ×
              </span>
              <span className="sr-only">remove filter</span>
            </button>
          ))}
          <button
            onClick={clearFilters}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            clear all
          </button>
        </div>
      )}

      <div className="tui-box divide-y divide-border">
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p className="mb-2 text-sm" aria-hidden="true">
              ¯\_(ツ)_/¯
            </p>
            <p className="text-xs">
              {searchQuery || !isFilterEmpty(filters)
                ? 'nothing matches those filters'
                : 'no transactions yet'}
            </p>
          </div>
        ) : (
          transactions.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              currency={currency}
              onClick={() => setSelectedTx(transaction)}
            />
          ))
        )}
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center justify-between text-xs" aria-label="Pagination">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="tui-btn-ghost px-2 py-1 disabled:opacity-30"
          >
            {'<'} prev
          </button>
          <span className="mono-nums text-muted-foreground">
            {page}/{totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="tui-btn-ghost px-2 py-1 disabled:opacity-30"
          >
            next {'>'}
          </button>
        </nav>
      )}

      <TransactionDetailSheet
        transaction={selectedTx}
        currency={currency}
        onClose={() => setSelectedTx(null)}
      />
    </section>
  );
}

function SortButton({
  label,
  active,
  order,
  onClick,
}: {
  label: string;
  active: boolean;
  order: 'asc' | 'desc';
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'border px-2 py-1',
        active ? 'border-accent bg-accent text-accent-foreground' : 'border-border hover:border-border-strong'
      )}
    >
      {label} {active && (order === 'desc' ? '↓' : '↑')}
    </button>
  );
}

interface TransactionRowProps {
  transaction: LedgerTransaction;
  currency: CurrencyCode;
  onClick: () => void;
}

function TransactionRow({ transaction, currency, onClick }: TransactionRowProps) {
  const isInflow = transaction.amountMinor > 0;
  const isInternal = transaction.transferGroupId !== null;

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">
          {transaction.counterpartyName || transaction.description}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          <span title={formatDateTime(transaction.bookedAt)}>{formatDate(transaction.bookedAt)}</span>
          <span> · {transaction.accountLabel}</span>
          {transaction.categoryName && <span> · {transaction.categoryName}</span>}
          {isInternal && <span className="text-accent"> · internal</span>}
        </p>
      </div>

      <div
        className={cn(
          'mono-nums shrink-0 text-right text-xs font-medium',
          isInternal ? 'text-muted-foreground' : isInflow ? 'text-success' : 'text-destructive'
        )}
      >
        {isInflow ? '+' : '-'}
        {formatCurrency(Math.abs(transaction.amountMinor), transaction.currency ?? currency)}
      </div>
    </button>
  );
}

interface TransactionDetailSheetProps {
  transaction: LedgerTransaction | null;
  currency: CurrencyCode;
  onClose: () => void;
}

function TransactionDetailSheet({ transaction, currency, onClose }: TransactionDetailSheetProps) {
  return (
    <BottomSheet isOpen={transaction !== null} onClose={onClose} title="Transaction detail">
      {transaction && (
        <TransactionDetail transaction={transaction} currency={currency} onClose={onClose} />
      )}
    </BottomSheet>
  );
}

function TransactionDetail({
  transaction,
  currency,
}: {
  transaction: LedgerTransaction;
  currency: CurrencyCode;
  onClose: () => void;
}) {
  const isInflow = transaction.amountMinor > 0;
  const txCurrency = transaction.currency ?? currency;

  const feesQuery = childFeesQuery(transaction.id);
  const feesResult = useLiveQuery<{
    id: string;
    description: string;
    amount_minor: string;
    kind: string;
  }>(feesQuery.sql, feesQuery.params);

  const fees = feesResult?.rows ?? [];
  const feeTotal = fees.reduce((sum, fee) => sum + Math.abs(Number(fee.amount_minor)), 0);

  return (
    <div className="overflow-y-auto px-4 pb-8">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {isInflow ? 'received' : 'sent'}
          </p>
          <p
            className={cn(
              'mono-nums mt-1 text-2xl font-semibold',
              isInflow ? 'text-success' : 'text-destructive'
            )}
          >
            {isInflow ? '+' : '-'}
            {formatCurrency(Math.abs(transaction.amountMinor), txCurrency)}
          </p>
          {feeTotal > 0 && (
            <p className="mt-1 text-xs text-warning">
              + {formatCurrency(feeTotal, txCurrency)} in charges
            </p>
          )}
        </div>
        <span className="tui-badge">{formatKind(transaction.kind)}</span>
      </div>

      {transaction.transferGroupId && (
        <p className="tui-box mt-4 border-accent/30 bg-accent/10 p-3 text-xs text-accent">
          matched as a transfer between your own accounts, so it is left out of spending totals.
        </p>
      )}

      <div className="tui-box mt-4 p-3">
        <DetailRow label="date" value={formatDate(transaction.bookedAt)} />
        {transaction.valueAt && transaction.valueAt !== transaction.bookedAt && (
          <DetailRow label="value date" value={formatDate(transaction.valueAt)} />
        )}
        <DetailRow label="account" value={transaction.accountLabel ?? '—'} />
        {transaction.balanceAfterMinor !== null && (
          <DetailRow
            label="balance after"
            value={formatCurrency(transaction.balanceAfterMinor, txCurrency)}
            mono
          />
        )}
      </div>

      <div className="tui-box mt-3 p-3">
        <DetailRow label="description" value={transaction.description} />
        {transaction.narration && transaction.narration !== transaction.description && (
          <DetailRow label="narration" value={transaction.narration} />
        )}
      </div>

      {transaction.counterpartyName && (
        <div className="tui-box mt-3 p-3">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
            {isInflow ? 'from' : 'to'}
          </p>
          <DetailRow label="name" value={transaction.counterpartyName} />
        </div>
      )}

      <div className="tui-box mt-3 p-3">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">category</p>
        <CategoryPicker
          transactionId={transaction.id}
          categoryId={transaction.categoryId}
          source={transaction.categorySource}
        />
      </div>

      {fees.length > 0 && (
        <div className="tui-box mt-3 p-3">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">charges</p>
          {fees.map((fee) => (
            <DetailRow
              key={fee.id}
              label={fee.description}
              value={formatCurrency(Math.abs(Number(fee.amount_minor)), txCurrency)}
              mono
            />
          ))}
        </div>
      )}

      <div className="tui-box mt-3 p-3">
        <DetailRow label="reference" value={transaction.reference} mono />
      </div>
    </div>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

function DetailRow({ label, value, mono }: DetailRowProps) {
  return (
    <div className="flex items-start justify-between py-1.5 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn('ml-4 break-all text-right', mono && 'mono-nums')}>{value}</span>
    </div>
  );
}
