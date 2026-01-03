import { useState, useMemo, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import type { Transaction } from '~/types';
import { TransactionCategory, TransactionType } from '~/types';
import { formatCurrency, formatDateWithYear } from '~/lib/utils';
import { cn } from '~/lib/utils';
import { BottomSheet } from '~/components/ui';

const PAGE_SIZE = 25;

type SortField = 'date' | 'amount';
type SortOrder = 'asc' | 'desc';

interface TransactionListProps {
  transactions: Transaction[];
  disableShortcuts?: boolean;
}

export function TransactionList({ transactions, disableShortcuts = false }: TransactionListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disableShortcuts) return;
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [disableShortcuts]);

  const filteredAndSortedTransactions = useMemo(() => {
    let result = transactions;

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = transactions.filter(
        (t) =>
          t.description.toLowerCase().includes(query) ||
          t.meta?.counterpartyName?.toLowerCase().includes(query) ||
          t.meta?.rawCategory?.toLowerCase().includes(query)
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortField === 'amount') {
        comparison = Math.abs(a.amount) - Math.abs(b.amount);
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [transactions, searchQuery, sortField, sortOrder]);

  const totalPages = Math.ceil(filteredAndSortedTransactions.length / PAGE_SIZE);
  const paginatedTransactions = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredAndSortedTransactions.slice(start, start + PAGE_SIZE);
  }, [filteredAndSortedTransactions, page]);

  // Reset page when search or sort changes
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  return (
    <div className="space-y-3">
      {/* Header with sort options */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">$</span>
          <span className="text-sm font-medium">transactions</span>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <button
            onClick={() => toggleSort('date')}
            className={cn(
              'px-2 py-1 border',
              sortField === 'date'
                ? 'bg-accent text-accent-foreground border-accent'
                : 'border-border hover:border-border-strong'
            )}
          >
            date {sortField === 'date' && (sortOrder === 'desc' ? '↓' : '↑')}
          </button>
          <button
            onClick={() => toggleSort('amount')}
            className={cn(
              'px-2 py-1 border',
              sortField === 'amount'
                ? 'bg-accent text-accent-foreground border-accent'
                : 'border-border hover:border-border-strong'
            )}
          >
            amount {sortField === 'amount' && (sortOrder === 'desc' ? '↓' : '↑')}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
          /
        </span>
        <input
          ref={searchInputRef}
          type="text"
          placeholder="search..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="tui-input w-full pl-7 text-xs"
        />
      </div>

      {/* Transaction List */}
      <div className="tui-box divide-y divide-border">
        {paginatedTransactions.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {searchQuery ? 'no matches found' : 'no transactions'}
          </div>
        ) : (
          paginatedTransactions.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              onClick={() => setSelectedTx(transaction)}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="tui-btn-ghost px-2 py-1 disabled:opacity-30"
          >
            {'<'} prev
          </button>
          <span className="text-muted-foreground mono-nums">
            {page}/{totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="tui-btn-ghost px-2 py-1 disabled:opacity-30"
          >
            next {'>'}
          </button>
        </div>
      )}

      {/* Transaction Detail Sheet */}
      <TransactionDetailSheet
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
      />
    </div>
  );
}

interface TransactionRowProps {
  transaction: Transaction;
  onClick: () => void;
}

function TransactionRow({ transaction, onClick }: TransactionRowProps) {
  const isInflow = transaction.category === TransactionCategory.Inflow;

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{transaction.description}</p>
        <p 
          className="mt-0.5 text-xs text-muted-foreground truncate"
          title={dayjs(transaction.date).format('DD/MM/YYYY h:mm A')}
        >
          {dayjs(transaction.date).format('DD/MM/YYYY')}
          <span> · {transaction.bankSource}</span>
        </p>
      </div>

      <div
        className={cn(
          'text-right text-xs font-medium mono-nums shrink-0',
          isInflow ? 'text-green-500' : 'text-red-500'
        )}
      >
        {isInflow ? '+' : '-'}
        {formatCurrency(Math.abs(transaction.amount))}
      </div>
    </button>
  );
}



interface TransactionDetailSheetProps {
  transaction: Transaction | null;
  onClose: () => void;
}

function TransactionDetailSheet({ transaction, onClose }: TransactionDetailSheetProps) {
  if (!transaction) return null;

  const isInflow = transaction.category === TransactionCategory.Inflow;
  const meta = transaction.meta;

  return (
    <BottomSheet isOpen={!!transaction} onClose={onClose}>
      <div className="max-h-[85vh] overflow-y-auto px-4 pb-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              {isInflow ? 'received' : 'sent'}
            </p>
            <p
              className={cn(
                'text-2xl font-semibold mono-nums mt-1',
                isInflow ? 'text-green-500' : 'text-red-500'
              )}
            >
              {isInflow ? '+' : '-'}{formatCurrency(Math.abs(transaction.amount))}
            </p>
          </div>
          <span className={cn('tui-badge', isInflow ? 'tui-badge-success' : '')}>
            {getTypeLabel(meta?.type)}
          </span>
        </div>

        {/* Date */}
        <div className="mt-4 tui-box p-3">
          <DetailRow label="date" value={formatDateWithYear(transaction.date)} />
          <DetailRow label="time" value={new Date(transaction.date).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })} />
        </div>

        {/* Description */}
        <div className="mt-3 tui-box p-3">
          <DetailRow label="description" value={transaction.description} />
        </div>

        {/* Counterparty */}
        {(meta?.counterpartyName || meta?.counterpartyAccount || meta?.counterpartyBank) && (
          <div className="mt-3 tui-box p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
              {isInflow ? 'from' : 'to'}
            </p>
            {meta.counterpartyName && (
              <DetailRow label="name" value={meta.counterpartyName} />
            )}
            {meta.counterpartyAccount && (
              <DetailRow label="account" value={maskAccountNumber(meta.counterpartyAccount)} mono />
            )}
            {meta.counterpartyBank && (
              <DetailRow label="bank" value={meta.counterpartyBank} />
            )}
          </div>
        )}

        {/* Bill Details */}
        {meta?.billProvider && (
          <div className="mt-3 tui-box p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
              bill details
            </p>
            <DetailRow label="provider" value={meta.billProvider} />
            {meta.billType && <DetailRow label="type" value={meta.billType} />}
            {meta.billToken && <DetailRow label="token" value={meta.billToken} mono />}
          </div>
        )}

        {/* Reference */}
        <div className="mt-3 tui-box p-3">
          <DetailRow label="reference" value={transaction.reference} mono />
          {meta?.sessionId && (
            <DetailRow label="session" value={meta.sessionId} mono />
          )}
        </div>

        {/* Raw Category */}
        {meta?.rawCategory && (
          <div className="mt-3">
            <span className="text-xs text-muted-foreground">
              category: {meta.rawCategory}
            </span>
          </div>
        )}
      </div>
    </BottomSheet>
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
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn('text-right ml-4 break-all', mono && 'mono-nums')}>
        {value}
      </span>
    </div>
  );
}

function getTypeLabel(type?: TransactionType): string {
  switch (type) {
    case TransactionType.Transfer:
      return 'transfer';
    case TransactionType.BillPayment:
      return 'bill';
    case TransactionType.Airtime:
      return 'airtime';
    case TransactionType.CardPayment:
      return 'card';
    case TransactionType.AtmWithdrawal:
      return 'atm';
    case TransactionType.BankCharge:
      return 'fee';
    case TransactionType.Interest:
      return 'interest';
    case TransactionType.Reversal:
      return 'reversal';
    default:
      return 'other';
  }
}

function maskAccountNumber(account: string): string {
  if (account.length <= 4) return account;
  return '****' + account.slice(-4);
}
