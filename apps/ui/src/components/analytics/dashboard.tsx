import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from '@electric-sql/pglite-react';
import type { CurrencyCode } from '~/types';
import { StatsRow } from './stats-row';
import { FlowChart } from './flow-chart';
import { BalanceChart } from './balance-chart';
import { CategoryBreakdown } from './category-breakdown';
import { TopCounterparties } from './top-counterparties';
import { RecurringList } from './recurring-list';
import { PeriodSelector } from './period-selector';
import { TransactionList } from './transaction-list';
import { ChatFab } from '~/components/chat/chat-fab';
import { ChatSheet } from '~/components/chat/chat-sheet';
import { SettingsSheet } from '~/components/settings/settings-sheet';
import { UploadSheet } from '~/components/upload/upload-sheet';
import { useTransactions } from '~/hooks/useTransactions';
import {
  useBalanceSeries,
  useCategorySpend,
  useInternalTransfers,
  useMonthlyFlow,
  useRecurringPayments,
  useSummary,
  useTopCounterparties,
} from '~/hooks/useAnalytics';
import { periodToRange, type PeriodKey } from '~/lib/filters';
import { formatCompactCurrency, formatMonthRange } from '~/lib/utils';

export function Dashboard() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodKey>('all');

  const controller = useTransactions();
  const { filters, setFilters, searchQuery, setSearchQuery } = controller;

  // Pin analytics to one currency. Summing naira and dollars would be
  // meaningless, so default to whichever the user has most of.
  const currencyResult = useLiveQuery<{ currency: string; n: string }>(
    'SELECT currency, COUNT(*) AS n FROM transactions GROUP BY currency ORDER BY n DESC'
  );
  const availableCurrencies = useMemo(
    () => (currencyResult?.rows ?? []).map((r) => r.currency as CurrencyCode),
    [currencyResult?.rows]
  );
  const currency: CurrencyCode = filters.currency ?? availableCurrencies[0] ?? 'NGN';

  useEffect(() => {
    if (!filters.currency && availableCurrencies.length > 0) {
      setFilters({ ...filters, currency: availableCurrencies[0] });
    }
    // Only reacting to the currency list settling after first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableCurrencies]);

  const handlePeriodChange = (next: PeriodKey) => {
    setPeriod(next);
    const { dateFrom, dateTo } = periodToRange(next);
    setFilters({ ...filters, dateFrom, dateTo });
  };

  const summary = useSummary(filters, searchQuery);
  const internal = useInternalTransfers(filters, searchQuery);
  const monthly = useMonthlyFlow(filters, searchQuery);
  const balances = useBalanceSeries(filters, searchQuery);
  const categories = useCategorySpend(filters, searchQuery);
  const paidTo = useTopCounterparties(filters, searchQuery, 'out');
  const receivedFrom = useTopCounterparties(filters, searchQuery, 'in');
  const recurring = useRecurringPayments(filters, searchQuery);

  const dateRangeText = formatMonthRange(summary.minDate, summary.maxDate);
  const anySheetOpen = isChatOpen || isSettingsOpen || isUploadOpen;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="flex items-center justify-between px-4 py-3">
          <img src="/logo.png" alt="Wakaru" className="h-8 sm:h-12" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsUploadOpen(true)}
              className="tui-btn-ghost px-2 py-1 text-xs"
              aria-label="Add a statement"
            >
              [add]
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="tui-btn-ghost px-2 py-1 text-xs"
              aria-label="Settings"
            >
              [cfg]
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span className="tui-badge mono-nums">{summary.count} transactions</span>
          {dateRangeText && (
            <>
              <span className="text-border-strong" aria-hidden="true">
                |
              </span>
              <span>{dateRangeText}</span>
            </>
          )}
          {availableCurrencies.length > 1 && (
            <>
              <span className="text-border-strong" aria-hidden="true">
                |
              </span>
              <label className="sr-only" htmlFor="currency-select">
                Currency
              </label>
              <select
                id="currency-select"
                value={currency}
                onChange={(e) => setFilters({ ...filters, currency: e.target.value as CurrencyCode })}
                className="border border-border bg-background px-1 py-0.5 text-xs focus:border-accent focus:outline-none"
              >
                {availableCurrencies.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 space-y-6 px-4 py-6 pb-24">
        <PeriodSelector value={period} onChange={handlePeriodChange} />

        <div className="space-y-2">
          <StatsRow
            inflowMinor={summary.inflowMinor}
            outflowMinor={summary.outflowMinor}
            netMinor={summary.netMinor}
            feesMinor={summary.feesMinor}
            currency={currency}
          />
          {internal.groups > 0 && (
            <p className="text-xs text-muted-foreground">
              {filters.excludeInternal ? 'excluding' : 'including'}{' '}
              <span className="mono-nums text-foreground/80">
                {formatCompactCurrency(internal.amountMinor, currency)}
              </span>{' '}
              moved between your own accounts{' '}
              <button
                type="button"
                onClick={() => setFilters({ ...filters, excludeInternal: !filters.excludeInternal })}
                className="text-accent underline underline-offset-2 hover:no-underline"
              >
                {filters.excludeInternal ? 'include' : 'exclude'}
              </button>
            </p>
          )}
        </div>

        {monthly.length > 1 && <FlowChart data={monthly} currency={currency} />}

        <BalanceChart data={balances} currency={currency} />

        <div className="grid gap-6 lg:grid-cols-2">
          <CategoryBreakdown
            data={categories}
            currency={currency}
            onSelect={(categoryId) =>
              setFilters({ ...filters, categories: [categoryId ?? 'uncategorized'] })
            }
          />
          <TopCounterparties
            outgoing={paidTo}
            incoming={receivedFrom}
            currency={currency}
            onSelect={setSearchQuery}
          />
        </div>

        <RecurringList data={recurring} currency={currency} onSelect={setSearchQuery} />

        <TransactionList
          controller={controller}
          currency={currency}
          disableShortcuts={anySheetOpen}
        />
      </main>

      <ChatFab onClick={() => setIsChatOpen(true)} />

      <ChatSheet
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <SettingsSheet isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <UploadSheet isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} />
    </div>
  );
}
