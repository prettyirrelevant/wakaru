import { useState, useCallback, useEffect, useRef } from 'react';
import * as Comlink from 'comlink';
import { useTransactionStore } from '~/stores/transactions';
import { DropZone } from './drop-zone';
import { BankPicker } from './bank-picker';
import { Progress } from '~/components/ui';
import { SettingsSheet } from '~/components/settings/settings-sheet';
import type { BankType, Transaction } from '~/types';

interface ParserApi {
  parseFile(
    fileBuffer: ArrayBuffer,
    fileName: string,
    bankType: BankType,
    onProgress: (progress: number, message: string) => void
  ): Promise<{ transactions: Transaction[]; error?: string }>;
}

export function UploadView() {
  const [selectedBank, setSelectedBank] = useState<BankType | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<Comlink.Remote<ParserApi> | null>(null);

  const status = useTransactionStore((s) => s.status);
  const setStatus = useTransactionStore((s) => s.setStatus);
  const addParsedTransactions = useTransactionStore((s) => s.addParsedTransactions);

  // Initialize worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../../workers/parser.worker.ts', import.meta.url),
      { type: 'module' }
    );
    apiRef.current = Comlink.wrap<ParserApi>(workerRef.current);

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!selectedBank || !apiRef.current) return;

      setStatus({ stage: 'parsing', progress: 0, message: 'reading file...' });

      try {
        const buffer = await file.arrayBuffer();

        const result = await apiRef.current.parseFile(
          buffer,
          file.name,
          selectedBank,
          Comlink.proxy((progress: number, message: string) => {
            setStatus({ stage: 'parsing', progress, message: message.toLowerCase() });
          })
        );

        if (result.error) {
          setStatus({ stage: 'error', message: result.error });
          return;
        }

        await addParsedTransactions(result.transactions as Transaction[]);
      } catch (error) {
        setStatus({
          stage: 'error',
          message: error instanceof Error ? error.message : 'failed to process file',
        });
      }
    },
    [selectedBank, setStatus, addParsedTransactions]
  );

  const isProcessing = status.stage === 'parsing';

  return (
    <div className="flex min-h-screen flex-col px-4 py-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-accent">$</span>
          <h1 className="text-sm font-semibold">wakaru</h1>
        </div>
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="tui-btn-ghost text-xs px-2 py-1"
          aria-label="Settings"
        >
          [cfg]
        </button>
      </header>

      {/* Status Bar */}
      {isProcessing && (
        <div className="mt-4 tui-box p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{status.message}</span>
            <span className="mono-nums">{status.progress}%</span>
          </div>
          <Progress value={status.progress} />
        </div>
      )}

      {status.stage === 'error' && (
        <div className="mt-4 tui-box border-destructive/30 bg-destructive-muted p-3 text-xs text-destructive">
          <span className="text-muted-foreground mr-2">err:</span>
          {status.message}
        </div>
      )}

      {/* Main Content */}
      <div className="mt-8 flex flex-1 flex-col items-center justify-center gap-8">
        {/* Tagline */}
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            understand your spending
          </p>
          <p className="text-xs text-muted-foreground/70">
            100% private · runs locally · never leaves your device
          </p>
        </div>

        <DropZone
          onFileSelect={handleFileSelect}
          disabled={isProcessing || !selectedBank}
        />

        <BankPicker selectedBank={selectedBank} onSelectBank={setSelectedBank} />

        {!selectedBank && (
          <p className="text-center text-xs text-muted-foreground">
            <span className="text-accent">hint:</span> select your bank first
          </p>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-auto pt-8 text-center">
        <p className="text-xs text-muted-foreground/50">
          <a
            href={`https://github.com/prettyirrelevant/wakaru/commit/${__GIT_SHA__}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-muted-foreground"
          >
            {__GIT_SHA__}
          </a>
          {' · your data stays here'}
        </p>
      </footer>

      {/* Settings Sheet */}
      <SettingsSheet
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
