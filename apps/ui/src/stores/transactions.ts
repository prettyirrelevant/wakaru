import { create } from 'zustand';
import type { Transaction, ProcessingStatus } from '~/types';
import { getDb, addTransactions, clearTransactions } from '~/lib/db';

interface TransactionState {
  status: ProcessingStatus;

  setStatus: (status: ProcessingStatus) => void;
  addParsedTransactions: (transactions: Transaction[]) => Promise<void>;
  clearAll: () => Promise<void>;
}

export const useTransactionStore = create<TransactionState>((set) => ({
  status: { stage: 'idle' },

  setStatus: (status) => {
    set({ status });
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

    const db = getDb();
    await addTransactions(db, newTransactions);

    const dateRange = getDateRange(newTransactions);

    set({
      status: {
        stage: 'complete',
        transactionCount: newTransactions.length,
        dateRange,
      },
    });
  },

  clearAll: async () => {
    const db = getDb();
    await clearTransactions(db);
    set({
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
