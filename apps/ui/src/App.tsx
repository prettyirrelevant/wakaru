import { useEffect, useState } from 'react';
import { PGliteProvider } from '@electric-sql/pglite-react';
import { initDb } from '~/lib/db';
import { useSettingsStore } from '~/stores/settings';
import { UploadView } from '~/components/upload/upload-view';
import { Dashboard } from '~/components/analytics/dashboard';
import { useLiveQuery } from '@electric-sql/pglite-react';

function AppContent() {
  const theme = useSettingsStore((s) => s.theme);
  const isSettingsInitialized = useSettingsStore((s) => s.isInitialized);
  const initSettings = useSettingsStore((s) => s.init);

  const result = useLiveQuery<{ id: string }>('SELECT id FROM transactions LIMIT 1');
  const hasTransactions = (result?.rows?.length ?? 0) > 0;

  useEffect(() => {
    initSettings();
  }, [initSettings]);

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

  if (!isSettingsInitialized) {
    return (
      <div className="min-h-screen min-h-[100dvh] flex items-center justify-center">
        <div className="text-xs text-muted-foreground">
          <span className="text-accent">$</span> loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh]">
      {hasTransactions ? <Dashboard /> : <UploadView />}
    </div>
  );
}

export function App() {
  const [db, setDb] = useState<Awaited<ReturnType<typeof initDb>> | null>(null);

  useEffect(() => {
    initDb().then(setDb);
  }, []);

  if (!db) {
    return (
      <div className="min-h-screen min-h-[100dvh] flex items-center justify-center">
        <div className="text-xs text-muted-foreground">
          <span className="text-accent">$</span> loading...
        </div>
      </div>
    );
  }

  return (
    <PGliteProvider db={db}>
      <AppContent />
    </PGliteProvider>
  );
}
