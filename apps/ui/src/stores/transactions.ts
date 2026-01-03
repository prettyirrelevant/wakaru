import { create } from 'zustand';
import type { Transaction, ProcessingStatus } from '~/types';
import { getAllTransactions, addTransactions, clearTransactions } from '~/lib/db';

interface TransactionState {
  transactions: Transaction[];
  status: ProcessingStatus;
  isInitialized: boolean;

  init: () => Promise<void>;
  setStatus: (status: ProcessingStatus) => void;
  setTransactions: (transactions: Transaction[]) => void;
  addParsedTransactions: (transactions: Transaction[]) => Promise<void>;
  clearAll: () => Promise<void>;
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  transactions: [],
  status: { stage: 'idle' },
  isInitialized: false,

  init: async () => {
    if (get().isInitialized) return;

    const transactions = await getAllTransactions();

    if (transactions.length > 0) {
      const sorted = transactions.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const dateRange = getDateRange(sorted);

      set({
        transactions: sorted,
        status: {
          stage: 'complete',
          transactionCount: sorted.length,
          dateRange,
        },
        isInitialized: true,
      });
    } else {
      set({ isInitialized: true });
    }
  },

  setStatus: (status) => {
    set({ status });
  },

  setTransactions: (transactions) => {
    set({ transactions });
  },

  addParsedTransactions: async (newTransactions) => {
    if (newTransactions.length === 0) {
      set({
        status: { stage: 'error', message: 'No transactions found in file' },
      });
      return;
    }

    set({
      status: { stage: 'parsing', progress: 95, message: 'Saving...' },
    });

    await addTransactions(newTransactions);

    const existing = get().transactions;
    const existingIds = new Set(existing.map((t) => t.id));
    const uniqueNew = newTransactions.filter((t) => !existingIds.has(t.id));
    const merged = [...existing, ...uniqueNew].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const dateRange = getDateRange(merged);

    set({
      transactions: merged,
      status: {
        stage: 'complete',
        transactionCount: merged.length,
        dateRange,
      },
    });
  },

  clearAll: async () => {
    await clearTransactions();
    set({
      transactions: [],
      status: { stage: 'idle' },
    });
  },
}));

function getDateRange(transactions: Transaction[]): string {
  if (transactions.length === 0) return '';

  const dates = transactions.map((t) => new Date(t.date).getTime());
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));

  const format = (d: Date) =>
    d.toLocaleDateString('en-NG', { month: 'short', year: 'numeric' });

  const start = format(minDate);
  const end = format(maxDate);

  return start === end ? start : `${start} - ${end}`;
}
