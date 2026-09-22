import { lazy, Suspense, useEffect, useState } from 'react';
import { PGliteProvider } from '@electric-sql/pglite-react';
import { initDb } from '~/lib/db';
import { useSettingsStore } from '~/stores/settings';
import { useLiveQuery } from '@electric-sql/pglite-react';
import { Brand } from '~/components/ui/brand';
import { Button } from '~/components/ui/button';

const UploadView = lazy(() =>
  import('~/components/upload/upload-view').then((module) => ({ default: module.UploadView }))
);
const Dashboard = lazy(() =>
  import('~/components/analytics/dashboard').then((module) => ({ default: module.Dashboard }))
);

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
    const preference = window.matchMedia('(prefers-color-scheme: light)');
    const applyTheme = () => {
      const isLight = theme === 'light' || (theme === 'system' && preference.matches);
      root.classList.toggle('light', isLight);
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
        'content',
        isLight ? '#f7f5ef' : '#12110f'
      );
    };

    applyTheme();
    preference.addEventListener('change', applyTheme);
    return () => preference.removeEventListener('change', applyTheme);
  }, [theme]);

  if (!isSettingsInitialized) {
    return <AppLoading label="loading preferences…" />;
  }

  if (!result) {
    return <AppLoading label="loading ledger…" />;
  }

  return (
    <Suspense fallback={<AppLoading label="Loading interface…" />}>
      <div className="min-h-screen min-h-[100dvh]">
        {hasTransactions ? <Dashboard /> : <UploadView />}
      </div>
    </Suspense>
  );
}

export function App() {
  const [db, setDb] = useState<Awaited<ReturnType<typeof initDb>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    initDb()
      .then((database) => {
        if (!cancelled) setDb(database);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'The local database could not start.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center px-5">
        <div className="w-full max-w-md border border-destructive/30 bg-surface p-6 shadow-xl">
          <Brand />
          <h1 className="mt-8 text-xl font-semibold">err: wakaru could not start</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{error}</p>
          <Button className="mt-6" onClick={() => window.location.reload()}>
            [retry]
          </Button>
        </div>
      </main>
    );
  }

  if (!db) {
    return <AppLoading label="preparing your private ledger…" />;
  }

  return (
    <PGliteProvider db={db}>
      <AppContent />
    </PGliteProvider>
  );
}

function AppLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-5" role="status">
      <div className="border border-border bg-surface px-5 py-4 shadow-xl">
        <p className="cursor-blink text-sm text-muted-foreground">$ {label} </p>
      </div>
    </div>
  );
}
