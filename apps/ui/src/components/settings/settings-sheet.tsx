import { useState } from 'react';
import { usePGlite, useLiveQuery } from '@electric-sql/pglite-react';
import { BottomSheet } from '~/components/ui/bottom-sheet';
import { Button } from '~/components/ui/button';
import { ModeToggle } from '~/components/ui/mode-toggle';
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
  instant?: boolean;
}

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function SettingsSheet({ isOpen, onClose, instant }: SettingsSheetProps) {
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
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Settings" instant={instant}>
      <div className="overflow-y-auto px-5 pb-8 sm:px-8">
        <div className="mb-8">
          <p className="text-xs text-accent">$ config</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">settings</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            control appearance, AI access, and data stored on this device.
          </p>
        </div>

        <section>
          <SectionLabel>appearance</SectionLabel>
          <div className="inline-flex border border-border bg-muted/50 p-1">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                aria-pressed={theme === option.value}
                className={`touch-manipulation px-3 py-1.5 text-xs font-semibold transition-colors ${
                  theme === option.value
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <div className="tui-divider my-4" />

        <section className="space-y-3">
          <SectionLabel>ai assistant</SectionLabel>

          <ModeToggle
            value={chatMode.type}
            onChange={setChatMode}
            localStatus={chatMode.type === 'local' ? chatMode.status : undefined}
          />

          {chatMode.type === 'cloud' && (
            <p className="text-xs text-muted-foreground/70">
              Your question and relevant rows go to the cloud model. Your full statement stays on this device.
            </p>
          )}

          {chatMode.type === 'local' && <LocalServerConfig />}

          <SuggestedRulesPanel />
        </section>

        <AccountsSection />

        <ImportsSection onUndo={(id) => deleteImport(db, id)} />

        <div className="tui-divider my-4" />

        <section>
          <SectionLabel>your data</SectionLabel>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              disabled={transactionCount === 0 || isExporting}
            >
              {isExporting ? 'Exporting…' : 'Export CSV'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowClearConfirm(true)}
              disabled={showClearConfirm || transactionCount === 0}
              className="text-destructive hover:border-destructive/40 hover:bg-destructive-muted"
            >
              Delete Everything
            </Button>
          </div>

          {showClearConfirm && (
            <div className="mt-3 border border-destructive/30 bg-destructive-muted p-4">
              <p className="mb-3 text-xs leading-5 text-destructive">
                This deletes every account, statement, and transaction. Export a copy first if needed.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleClearData}
                >
                  Delete Everything
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowClearConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </section>

        <div className="tui-divider my-4" />

        <p className="text-xs text-muted-foreground/50">
          Wakaru · Your data stays here ·{' '}
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
  return <h3 className="mb-3 text-sm font-semibold">{children}</h3>;
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
    <>
      <div className="tui-divider my-4" />
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
    </>
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
    <>
      <div className="tui-divider my-4" />
      <section>
        <SectionLabel>statements</SectionLabel>
        <ul className="space-y-2">
          {imports.map((record) => (
            <li key={record.id} className="flex items-start justify-between gap-3 text-xs">
              <div className="min-w-0">
                <p className="truncate">{record.file_name}</p>
                <p className="text-muted-foreground">
                  {formatMonthRange(record.period_start, record.period_end) || 'Unknown period'} ·{' '}
                  {record.rows_parsed} rows
                  {record.reconciled === false && (
                    <span className="text-warning"> · Balance mismatch</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => handleUndo(record.id)}
                disabled={busyId === record.id}
                className="shrink-0 text-destructive underline underline-offset-2 hover:no-underline disabled:opacity-50"
              >
                {busyId === record.id ? 'Removing…' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
