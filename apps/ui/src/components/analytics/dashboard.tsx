import { useState } from 'react';
import { useLiveQuery } from '@electric-sql/pglite-react';
import { StatsRow } from './stats-row';
import { FlowChart } from './flow-chart';
import { TransactionList } from './transaction-list';
import { ChatFab } from '~/components/chat/chat-fab';
import { ChatSheet } from '~/components/chat/chat-sheet';
import { SettingsSheet } from '~/components/settings/settings-sheet';
import { UploadSheet } from '~/components/upload/upload-sheet';

interface StatsRow {
  total_inflow: string;
  total_outflow: string;
  count: string;
  min_date: Date | null;
  max_date: Date | null;
}

interface MonthlyRow {
  month: string;
  inflow: string;
  outflow: string;
}

const STATS_QUERY = `
  SELECT 
    COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_inflow,
    COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_outflow,
    COUNT(*) as count,
    MIN(date) as min_date,
    MAX(date) as max_date
  FROM transactions
`;

function formatDateRange(minDate: Date | null, maxDate: Date | null): string {
  if (!minDate || !maxDate) return '';
  
  const format = (d: Date) =>
    d.toLocaleDateString('en-NG', { month: 'short', year: 'numeric' });
  
  const start = format(minDate);
  const end = format(maxDate);
  
  return start === end ? start : `${start} - ${end}`;
}

const MONTHLY_QUERY = `
  SELECT 
    TO_CHAR(date, 'YYYY-MM') as month,
    COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as inflow,
    COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as outflow
  FROM transactions
  GROUP BY TO_CHAR(date, 'YYYY-MM')
  ORDER BY month ASC
`;

export function Dashboard() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const statsResult = useLiveQuery<StatsRow>(STATS_QUERY);
  const monthlyResult = useLiveQuery<MonthlyRow>(MONTHLY_QUERY);

  const stats = statsResult?.rows?.[0];
  const totalInflow = Number(stats?.total_inflow ?? 0);
  const totalOutflow = Number(stats?.total_outflow ?? 0);
  const transactionCount = Number(stats?.count ?? 0);
  const dateRangeText = formatDateRange(stats?.min_date ?? null, stats?.max_date ?? null);

  const byMonth = (monthlyResult?.rows ?? []).map(row => ({
    month: row.month,
    inflow: Number(row.inflow),
    outflow: Number(row.outflow),
  }));

  const statusText =
    transactionCount > 0
      ? `${transactionCount} transactions`
      : 'Loading...';

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Wakaru" className="h-8 sm:h-12" />
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

      <main className="flex-1 space-y-6 px-4 py-6 pb-24">
        <StatsRow
          inflow={totalInflow}
          outflow={totalOutflow}
          net={totalInflow - totalOutflow}
        />

        {byMonth.length > 0 && (
          <FlowChart data={byMonth} />
        )}

        <TransactionList disableShortcuts={isChatOpen || isSettingsOpen || isUploadOpen} />
      </main>

      <ChatFab onClick={() => setIsChatOpen(true)} />

      <ChatSheet 
        isOpen={isChatOpen} 
        onClose={() => setIsChatOpen(false)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <SettingsSheet
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <UploadSheet
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
      />
    </div>
  );
}
