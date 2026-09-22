import { useState } from 'react';
import { Brand } from '~/components/ui/brand';
import { Button } from '~/components/ui/button';
import { SettingsSheet } from '~/components/settings/settings-sheet';
import { StatementImporter } from './statement-importer';

export function UploadView() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSettingsMounted, setIsSettingsMounted] = useState(false);

  const openSettings = () => {
    setIsSettingsMounted(true);
    setIsSettingsOpen(true);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-hidden">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <header className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-5 py-5 sm:px-8">
        <Brand />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={openSettings}
          aria-label="Open settings"
          aria-haspopup="dialog"
          aria-expanded={isSettingsOpen}
        >
          [cfg]
        </Button>
      </header>

      <main
        id="main-content"
        className="mx-auto grid w-full max-w-[1200px] flex-1 items-center gap-10 px-5 py-8 sm:px-8 sm:py-12 lg:grid-cols-[minmax(0,0.75fr)_minmax(480px,1fr)] lg:gap-14 lg:py-16"
      >
        <section className="max-w-xl lg:pb-10">
          <p className="mb-5 text-xs text-accent" aria-hidden="true">$ wakaru --open</p>
          <h1 className="max-w-lg text-balance font-display text-5xl font-semibold leading-[0.96] tracking-[-0.055em] text-foreground sm:text-6xl lg:text-[4.25rem]">
            your statement, decoded.
          </h1>
          <p className="mt-6 max-w-md text-pretty text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
            drop in a bank statement. wakaru turns it into a private ledger you can search and question.
          </p>
          <p className="mt-6 border-l border-accent pl-3 text-xs leading-5 text-muted-foreground">
            // your statement stays in this browser
          </p>
        </section>

        <section
          aria-labelledby="import-title"
          className="w-full border border-border bg-surface/95 p-5 shadow-xl shadow-black/10 backdrop-blur sm:p-7"
        >
          <h2 id="import-title" className="mb-5 text-sm font-semibold text-accent">
            &gt; import-statement
          </h2>
          <StatementImporter />
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-[1200px] justify-end px-5 py-5 text-[11px] text-muted-foreground sm:px-8">
        <a
          href={`https://github.com/prettyirrelevant/wakaru/commit/${__GIT_SHA__}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-border-strong underline-offset-4 hover:text-foreground"
        >
          build/{__GIT_SHA__}
        </a>
      </footer>

      {isSettingsMounted && (
        <SettingsSheet isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      )}
    </div>
  );
}
