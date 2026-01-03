import { useEffect } from 'react';
import { useTransactionStore } from '~/stores/transactions';
import { useSettingsStore } from '~/stores/settings';
import { UploadView } from '~/components/upload/upload-view';
import { Dashboard } from '~/components/analytics/dashboard';

export function App() {
  const transactions = useTransactionStore((s) => s.transactions);
  const isTransactionsInitialized = useTransactionStore((s) => s.isInitialized);
  const theme = useSettingsStore((s) => s.theme);
  const isSettingsInitialized = useSettingsStore((s) => s.isInitialized);
  const initSettings = useSettingsStore((s) => s.init);
  const initTransactions = useTransactionStore((s) => s.init);

  // Initialize stores on mount
  useEffect(() => {
    initSettings();
    initTransactions();
  }, [initSettings, initTransactions]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light');
    
    if (theme === 'light') {
      root.classList.add('light');
    } else if (theme === 'system') {
      const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      if (prefersLight) {
        root.classList.add('light');
      }
    }
  }, [theme]);

  // Wait for stores to initialize before rendering
  const isInitialized = isTransactionsInitialized && isSettingsInitialized;
  
  if (!isInitialized) {
    return (
      <div className="min-h-screen min-h-[100dvh] flex items-center justify-center">
        <div className="text-xs text-muted-foreground">
          <span className="text-accent">$</span> loading...
        </div>
      </div>
    );
  }

  const hasTransactions = transactions.length > 0;

  return (
    <div className="min-h-screen min-h-[100dvh]">
      {hasTransactions ? <Dashboard /> : <UploadView />}
    </div>
  );
}
