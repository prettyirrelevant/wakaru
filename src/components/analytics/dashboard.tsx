import { useState, useMemo } from 'react';
import { useTransactionStore } from '~/stores/transactions';
import { StatsRow } from './stats-row';
import { FlowChart } from './flow-chart';
import { TransactionList } from './transaction-list';
import { ChatFab } from '~/components/chat/chat-fab';
import { ChatSheet } from '~/components/chat/chat-sheet';
import { SettingsSheet } from '~/components/settings/settings-sheet';
import { UploadSheet } from '~/components/upload/upload-sheet';

import type { AnalyticsSummary } from '~/types';
import { TransactionCategory } from '~/types';

export function Dashboard() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const transactions = useTransactionStore((s) => s.transactions);
  const status = useTransactionStore((s) => s.status);

  const analytics = useMemo((): AnalyticsSummary => {
    const inflow = transactions
      .filter((t) => t.category === TransactionCategory.Inflow)
      .reduce((sum, t) => sum + t.amount, 0);

    const outflow = transactions
      .filter((t) => t.category === TransactionCategory.Outflow)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const dates = transactions.map((t) => new Date(t.date).getTime());
    const dateRange =
      dates.length > 0
        ? {
            start: new Date(Math.min(...dates)).toISOString(),
            end: new Date(Math.max(...dates)).toISOString(),
          }
        : null;

    // Group by month
    const byMonthMap = new Map<string, { inflow: number; outflow: number }>();
    transactions.forEach((t) => {
      const month = t.date.slice(0, 7); // YYYY-MM
      const existing = byMonthMap.get(month) || { inflow: 0, outflow: 0 };
      if (t.amount > 0) {
        existing.inflow += t.amount;
      } else {
        existing.outflow += Math.abs(t.amount);
      }
      byMonthMap.set(month, existing);
    });

    const byMonth = Array.from(byMonthMap.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      totalInflow: inflow,
      totalOutflow: outflow,
      netChange: inflow - outflow,
      transactionCount: transactions.length,
      dateRange,
      byMonth,
      byCategory: [], // TODO: implement category breakdown
    };
  }, [transactions]);

  const statusText =
    status.stage === 'complete'
      ? `${status.transactionCount} transactions`
      : 'Loading...';

  const dateRangeText =
    status.stage === 'complete' ? status.dateRange : '';

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-accent">$</span>
            <h1 className="text-sm font-semibold">wakaru</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsUploadOpen(true)}
              className="tui-btn-ghost text-xs px-2 py-1"
            >
              [add]
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="tui-btn-ghost text-xs px-2 py-1"
              aria-label="Settings"
            >
              [cfg]
            </button>
          </div>
        </div>

        {/* Status Bar */}
        <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span className="tui-badge mono-nums">{statusText}</span>
          {dateRangeText && (
            <>
              <span className="text-border-strong">|</span>
              <span>{dateRangeText}</span>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 space-y-6 px-4 py-6 pb-24">
        {/* Stats Row */}
        <StatsRow
          inflow={analytics.totalInflow}
          outflow={analytics.totalOutflow}
          net={analytics.netChange}
        />

        {/* Flow Chart */}
        {analytics.byMonth.length > 0 && (
          <FlowChart data={analytics.byMonth} />
        )}

        {/* Transactions */}
        <TransactionList transactions={transactions} />
      </main>

      {/* Chat FAB */}
      <ChatFab onClick={() => setIsChatOpen(true)} />

      {/* Chat Sheet */}
      <ChatSheet 
        isOpen={isChatOpen} 
        onClose={() => setIsChatOpen(false)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Settings Sheet */}
      <SettingsSheet
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Upload Sheet */}
      <UploadSheet
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
      />
    </div>
  );
}
