import { useState } from 'react';
import { usePGlite, useLiveQuery } from '@electric-sql/pglite-react';
import { BottomSheet, ModeToggle } from '~/components/ui';
import { exportTransactionsToCSV, downloadCSV } from '~/lib/csv';
import { clearAllData, deleteImport } from '~/lib/db';
import { useSettingsStore } from '~/stores/settings';
import { LocalServerConfig } from './local-server-section';
import { SuggestedRulesPanel } from './suggested-rules';
import { formatMonthRange } from '~/lib/utils';
import type { Theme } from '~/types';

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'auto' },
  { value: 'light', label: 'light' },
  { value: 'dark', label: 'dark' },
];

export function SettingsSheet({ isOpen, onClose }: SettingsSheetProps) {
  const db = usePGlite();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const chatMode = useSettingsStore((s) => s.chatMode);
  const setChatMode = useSettingsStore((s) => s.setChatMode);

  const countResult = useLiveQuery<{ count: string }>('SELECT COUNT(*) AS count FROM transactions');
  const transactionCount = Number(countResult?.rows?.[0]?.count ?? 0);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      downloadCSV(await exportTransactionsToCSV(db));
      onClose();
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearData = async () => {
    await clearAllData(db);
    setShowClearConfirm(false);
    onClose();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Settings">
      <div className="overflow-y-auto px-4 pb-8">
        <div className="mb-6 flex items-center gap-2">
          <span className="text-accent">$</span>
          <h2 className="text-sm font-semibold">config</h2>
        </div>

        <section>
          <SectionLabel>theme</SectionLabel>
          <div className="flex gap-1">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                aria-pressed={theme === option.value}
                className={`border px-3 py-1.5 text-xs ${
                  theme === option.value
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-border bg-muted hover:border-border-strong'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <div className="tui-divider my-4" />

        <section className="space-y-3">
          <SectionLabel>ai chat</SectionLabel>

          <ModeToggle
            value={chatMode.type}
            onChange={setChatMode}
            localStatus={chatMode.type === 'local' ? chatMode.status : undefined}
          />

          {chatMode.type === 'cloud' && (
            <p className="text-xs text-muted-foreground/70">
              your question and the rows that answer it are sent to our proxy and on to the model.
              your full statement is not.
            </p>
          )}

          {chatMode.type === 'local' && <LocalServerConfig />}

          <SuggestedRulesPanel />
        </section>

        <div className="tui-divider my-4" />

        <AccountsSection />

        <div className="tui-divider my-4" />

        <ImportsSection onUndo={(id) => deleteImport(db, id)} />

        <div className="tui-divider my-4" />

        <section>
          <SectionLabel>data</SectionLabel>
          <div className="flex gap-1">
            <button
              onClick={handleExport}
              disabled={transactionCount === 0 || isExporting}
              className="border border-border bg-muted px-3 py-1.5 text-xs hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExporting ? 'exporting...' : 'export csv'}
            </button>
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={showClearConfirm || transactionCount === 0}
              className={`border px-3 py-1.5 text-xs ${
                showClearConfirm
                  ? 'border-destructive bg-destructive text-white'
                  : 'border-border bg-muted text-destructive hover:border-destructive/50'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              delete everything
            </button>
          </div>

          {showClearConfirm && (
            <div className="tui-box mt-2 border-destructive/30 bg-destructive-muted p-3">
              <p className="mb-2 text-xs text-destructive">
                this deletes every account, statement and transaction. export first if you want a
                copy.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleClearData}
                  className="border border-destructive bg-destructive px-3 py-1 text-xs text-white"
                >
                  yes, delete
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="border border-border px-3 py-1 text-xs hover:bg-muted"
                >
                  cancel
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="tui-divider my-4" />

        <p className="text-xs text-muted-foreground/50">
          wakaru · your data stays here ·{' '}
          <a
            href={`https://github.com/prettyirrelevant/wakaru/commit/${__GIT_SHA__}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-muted-foreground"
          >
            {__GIT_SHA__}
          </a>
        </p>
      </div>
    </BottomSheet>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-xs text-muted-foreground">{children}</div>;
}

function AccountsSection() {
  const result = useLiveQuery<{
    id: string;
    bank: string;
    name: string;
    number_masked: string;
    currency: string;
    tx_count: string;
  }>(`
    SELECT a.id, a.bank, a.name, a.number_masked, a.currency, COUNT(t.id) AS tx_count
    FROM accounts a
    LEFT JOIN transactions t ON t.account_id = a.id
    GROUP BY a.id, a.bank, a.name, a.number_masked, a.currency
    ORDER BY a.bank
  `);

  const accounts = result?.rows ?? [];
  if (accounts.length === 0) return null;

  return (
    <section>
      <SectionLabel>accounts</SectionLabel>
      <ul className="space-y-1">
        {accounts.map((account) => (
          <li key={account.id} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate">
              {account.name || account.bank}
              {account.number_masked && (
                <span className="text-muted-foreground"> {account.number_masked}</span>
              )}
              <span className="ml-1.5 text-muted-foreground/60">{account.currency}</span>
            </span>
            <span className="mono-nums shrink-0 text-muted-foreground">
              {account.tx_count}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ImportsSection({ onUndo }: { onUndo: (importId: string) => Promise<void> }) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const result = useLiveQuery<{
    id: string;
    file_name: string;
    period_start: Date | null;
    period_end: Date | null;
    rows_parsed: number;
    reconciled: boolean | null;
    imported_at: Date;
  }>('SELECT * FROM imports ORDER BY imported_at DESC');

  const imports = result?.rows ?? [];
  if (imports.length === 0) return null;

  const handleUndo = async (id: string) => {
    setBusyId(id);
    try {
      await onUndo(id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <SectionLabel>statements</SectionLabel>
      <ul className="space-y-2">
        {imports.map((record) => (
          <li key={record.id} className="flex items-start justify-between gap-3 text-xs">
            <div className="min-w-0">
              <p className="truncate">{record.file_name}</p>
              <p className="text-muted-foreground">
                {formatMonthRange(record.period_start, record.period_end) || 'unknown period'} ·{' '}
                {record.rows_parsed} rows
                {record.reconciled === false && (
                  <span className="text-warning"> · balance mismatch</span>
                )}
              </p>
            </div>
            <button
              onClick={() => handleUndo(record.id)}
              disabled={busyId === record.id}
              className="shrink-0 text-destructive underline underline-offset-2 hover:no-underline disabled:opacity-50"
            >
              {busyId === record.id ? 'removing...' : 'remove'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
