import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from '@electric-sql/pglite-react';
import type { CurrencyCode } from '~/types';
import { StatsRow } from './stats-row';
import { CategoryBreakdown } from './category-breakdown';
import { TopCounterparties } from './top-counterparties';
import { RecurringList } from './recurring-list';
import { PeriodSelector } from './period-selector';
import { TransactionList } from './transaction-list';
import { ChatFab } from '~/components/chat/chat-fab';
import { Brand } from '~/components/ui/brand';
import { Button } from '~/components/ui/button';
import { ShortcutSheet } from '~/components/ui/shortcut-sheet';
import { useKeyboardShortcuts } from '~/hooks/useKeyboardShortcuts';
import { useTransactions } from '~/hooks/useTransactions';
import { useDashboardData } from '~/hooks/useAnalytics';
import { periodToRange, type PeriodKey } from '~/lib/filters';
import { formatCompactCurrency, formatMonthRange } from '~/lib/utils';

const ChatSheet = lazy(() =>
  import('~/components/chat/chat-sheet').then((module) => ({ default: module.ChatSheet }))
);
const SettingsSheet = lazy(() =>
  import('~/components/settings/settings-sheet').then((module) => ({
    default: module.SettingsSheet,
  }))
);
const UploadSheet = lazy(() =>
  import('~/components/upload/upload-sheet').then((module) => ({ default: module.UploadSheet }))
);
const FlowChart = lazy(() =>
  import('./flow-chart').then((module) => ({ default: module.FlowChart }))
);
const BalanceChart = lazy(() =>
  import('./balance-chart').then((module) => ({ default: module.BalanceChart }))
);

type SheetName = 'chat' | 'settings' | 'upload' | 'shortcuts';

export function Dashboard() {
  const [activeSheet, setActiveSheet] = useState<SheetName | null>(null);
  const [instantSheet, setInstantSheet] = useState(false);
  const [openedSheets, setOpenedSheets] = useState(() => new Set<SheetName>());
  const [period, setPeriod] = useState<PeriodKey>('all');
  const controller = useTransactions();
  const { filters, setFilters, dataSearchQuery, setSearchQuery } = controller;

  const currencyResult = useLiveQuery<{ currency: string; n: string }>(
    'SELECT currency, COUNT(*) AS n FROM transactions GROUP BY currency ORDER BY n DESC'
  );
  const availableCurrencies = useMemo(
    () => (currencyResult?.rows ?? []).map((row) => row.currency as CurrencyCode),
    [currencyResult?.rows]
  );
  const currency: CurrencyCode = filters.currency ?? availableCurrencies[0] ?? 'NGN';

  useEffect(() => {
    if (!filters.currency && availableCurrencies.length > 0) {
      setFilters({ ...filters, currency: availableCurrencies[0] });
    }
  }, [availableCurrencies, filters, setFilters]);

  useEffect(() => {
    if (period === 'custom') return;
    const range = periodToRange(period);
    if (range.dateFrom !== filters.dateFrom || range.dateTo !== filters.dateTo) {
      setPeriod('custom');
    }
  }, [filters.dateFrom, filters.dateTo, period]);

  const handlePeriodChange = (next: PeriodKey) => {
    setPeriod(next);
    const { dateFrom, dateTo } = periodToRange(next);
    setFilters({ ...filters, dateFrom, dateTo });
  };

  const openSheet = useCallback((sheet: SheetName, instant = false) => {
    setOpenedSheets((current) => new Set(current).add(sheet));
    setInstantSheet(instant);
    setActiveSheet(sheet);
  }, []);
  const closeSheet = useCallback(() => setActiveSheet(null), []);
  const openUpload = useCallback(() => openSheet('upload'), [openSheet]);
  const openChat = useCallback(() => openSheet('chat'), [openSheet]);
  const openSettings = useCallback(() => openSheet('settings'), [openSheet]);
  const openShortcuts = useCallback(() => openSheet('shortcuts'), [openSheet]);
  const shortcutUpload = useCallback(() => openSheet('upload', true), [openSheet]);
  const shortcutChat = useCallback(() => openSheet('chat', true), [openSheet]);
  const shortcutSettings = useCallback(() => openSheet('settings', true), [openSheet]);
  const shortcutHelp = useCallback(() => openSheet('shortcuts', true), [openSheet]);

  useKeyboardShortcuts({
    disabled: activeSheet !== null,
    onAddStatement: shortcutUpload,
    onOpenChat: shortcutChat,
    onOpenSettings: shortcutSettings,
    onShowHelp: shortcutHelp,
  });

  const {
    summary,
    internalTransfers: internal,
    monthlyFlow: monthly,
    balanceSeries: balances,
    categorySpend: categories,
    paidTo,
    receivedFrom,
    recurringPayments: recurring,
  } = useDashboardData(filters, dataSearchQuery);

  const dateRangeText = formatMonthRange(summary.minDate, summary.maxDate);
  const hasFlow = monthly.length > 1 && monthly.some((point) => point.inflow !== 0 || point.outflow !== 0);
  const hasBalance = balances.length > 1 && balances.some((point) => point.balanceMinor !== 0);

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-hidden">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between px-4 sm:px-8 lg:px-12">
          <Brand />
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Application actions">
            <Button variant="secondary" size="sm" onClick={openUpload}>
              [+ add]
              <kbd className="hidden font-mono text-[10px] text-muted-foreground md:inline">
                mod+shift+u
              </kbd>
            </Button>
            <Button variant="ghost" size="icon" onClick={openShortcuts} aria-label="Keyboard shortcuts">
              <span className="font-mono text-xs font-semibold">[?]</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={openSettings} aria-label="Open settings">
              <span className="font-mono text-xs font-semibold">[cfg]</span>
            </Button>
          </nav>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 pb-28 sm:px-8 lg:px-12 lg:py-10">
        <section className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs text-accent">$ report --all</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">overview</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="mono-nums">{summary.count}</span> transactions
              {dateRangeText ? ` from ${dateRangeText}` : ''}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <PeriodSelector value={period} onChange={handlePeriodChange} />
            {availableCurrencies.length > 1 && (
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="sr-only">Currency</span>
                <select
                  name="currency"
                  aria-label="Currency"
                  value={currency}
                  onChange={(event) =>
                    setFilters({ ...filters, currency: event.target.value as CurrencyCode })
                  }
                  className="border border-border bg-surface px-2.5 py-2 text-xs font-semibold text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                >
                  {availableCurrencies.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </section>

        <div className="space-y-6">
          <div className="space-y-3">
            <StatsRow
              inflowMinor={summary.inflowMinor}
              outflowMinor={summary.outflowMinor}
              netMinor={summary.netMinor}
              feesMinor={summary.feesMinor}
              currency={currency}
            />
            {internal.groups > 0 && (
              <p className="text-xs leading-5 text-muted-foreground">
                {filters.excludeInternal ? 'Excluding' : 'Including'}{' '}
                <span className="mono-nums font-medium text-foreground">
                  {formatCompactCurrency(internal.amountMinor, currency)}
                </span>{' '}
                moved between your accounts.{' '}
                <button
                  type="button"
                  onClick={() => setFilters({ ...filters, excludeInternal: !filters.excludeInternal })}
                  className="font-semibold text-accent underline underline-offset-4 hover:no-underline"
                >
                  {filters.excludeInternal ? 'Include transfers' : 'Exclude transfers'}
                </button>
              </p>
            )}
          </div>

          {(hasFlow || hasBalance) && (
            <div className="grid gap-6 xl:grid-cols-5">
              {hasFlow && (
                <div className={hasBalance ? 'xl:col-span-3' : 'xl:col-span-5'}>
                  <Suspense fallback={<ChartLoading label="cashflow" />}>
                    <FlowChart data={monthly} currency={currency} />
                  </Suspense>
                </div>
              )}
              {hasBalance && (
                <div className={hasFlow ? 'xl:col-span-2' : 'xl:col-span-5'}>
                  <Suspense fallback={<ChartLoading label="balance" />}>
                    <BalanceChart data={balances} currency={currency} />
                  </Suspense>
                </div>
              )}
            </div>
          )}

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
            disableShortcuts={activeSheet !== null}
          />
        </div>
      </main>

      <ChatFab onClick={openChat} />

      {openedSheets.has('chat') && (
        <Suspense fallback={<SheetLoading />}>
          <ChatSheet
            isOpen={activeSheet === 'chat'}
            onClose={closeSheet}
            onOpenSettings={openSettings}
            instant={instantSheet}
          />
        </Suspense>
      )}
      {openedSheets.has('settings') && (
        <Suspense fallback={<SheetLoading />}>
          <SettingsSheet isOpen={activeSheet === 'settings'} onClose={closeSheet} instant={instantSheet} />
        </Suspense>
      )}
      {openedSheets.has('upload') && (
        <Suspense fallback={<SheetLoading />}>
          <UploadSheet isOpen={activeSheet === 'upload'} onClose={closeSheet} instant={instantSheet} />
        </Suspense>
      )}
      {openedSheets.has('shortcuts') && (
        <ShortcutSheet isOpen={activeSheet === 'shortcuts'} onClose={closeSheet} instant={instantSheet} />
      )}
    </div>
  );
}

function SheetLoading() {
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 border border-border bg-surface p-4 text-sm shadow-xl sm:left-auto sm:w-80"
    >
      Loading…
    </div>
  );
}

function ChartLoading({ label }: { label: string }) {
  return (
    <div className="tui-box flex h-64 items-center justify-center text-xs text-muted-foreground" role="status">
      loading {label}…
    </div>
  );
}
