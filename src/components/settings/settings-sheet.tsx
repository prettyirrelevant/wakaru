import { useState } from 'react';
import { BottomSheet, Switch } from '~/components/ui';
import { useSettingsStore } from '~/stores/settings';
import { useTransactionStore } from '~/stores/transactions';
import { ExportImport } from './export-import';
import type { Theme } from '~/types';

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsSheet({ isOpen, onClose }: SettingsSheetProps) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const chatEnabled = useSettingsStore((s) => s.chatEnabled);
  const setChatEnabled = useSettingsStore((s) => s.setChatEnabled);

  const clearAll = useTransactionStore((s) => s.clearAll);

  const handleClearData = async () => {
    await clearAll();
    setShowClearConfirm(false);
    onClose();
  };

  const themeOptions: { value: Theme; label: string }[] = [
    { value: 'system', label: 'auto' },
    { value: 'light', label: 'light' },
    { value: 'dark', label: 'dark' },
  ];

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="max-h-[85vh] overflow-y-auto px-4 pb-8">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-accent">$</span>
          <h2 className="text-sm font-semibold">config</h2>
        </div>

        {/* Theme */}
        <section>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <span>theme</span>
          </div>
          <div className="flex gap-1">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={`text-xs px-3 py-1.5 border ${
                  theme === option.value
                    ? 'bg-accent text-accent-foreground border-accent'
                    : 'bg-muted border-border hover:border-border-strong'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <div className="tui-divider my-4" />

        {/* AI Chat */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs">
              <span className="text-muted-foreground">ai chat</span>
              <span className="text-muted-foreground/50 mx-1">—</span>
              <span className="text-muted-foreground/70">ask questions about your spending</span>
            </div>
            <Switch
              checked={chatEnabled}
              onCheckedChange={setChatEnabled}
              aria-label="Enable AI chat"
            />
          </div>
          <p className="text-xs text-muted-foreground/50">
            &gt; your data stays on your device. we send your question to ai, get an answer, and keep nothing.
          </p>
        </section>

        <div className="tui-divider my-4" />

        {/* Data Management */}
        <section>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <span>data</span>
          </div>
          <div className="space-y-2">
            <ExportImport onComplete={onClose} />

            {!showClearConfirm ? (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="w-full text-left text-xs px-3 py-2 text-destructive hover:bg-destructive-muted border border-transparent hover:border-destructive/30"
              >
                [clear all data]
              </button>
            ) : (
              <div className="tui-box border-destructive/30 bg-destructive-muted p-3">
                <p className="text-xs text-destructive mb-2">
                  this will delete everything. are you sure?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleClearData}
                    className="text-xs px-3 py-1 bg-destructive text-white border border-destructive"
                  >
                    yes, clear
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="text-xs px-3 py-1 border border-border hover:bg-muted"
                  >
                    cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="tui-divider my-4" />

        <section>
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
        </section>
      </div>
    </BottomSheet>
  );
}
