import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import * as Comlink from 'comlink';
import { useTransactionStore } from '~/stores/transactions';
import { DropZone } from './drop-zone';
import { BankPicker } from './bank-picker';
import { Progress } from '~/components/ui';
import { SettingsSheet } from '~/components/settings/settings-sheet';
import { SUPPORTED_BANKS } from '~/lib/constants';
import type { BankType, Transaction } from '~/types';

interface ParserApi {
  parseFile(
    fileBuffer: ArrayBuffer,
    fileName: string,
    bankType: BankType,
    password: string | undefined,
    onProgress: (progress: number, message: string) => void
  ): Promise<{ transactions: Transaction[]; error?: string }>;
}

export function UploadView() {
  const [selectedBank, setSelectedBank] = useState<BankType | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<Comlink.Remote<ParserApi> | null>(null);

  const status = useTransactionStore((s) => s.status);
  const setStatus = useTransactionStore((s) => s.setStatus);
  const addParsedTransactions = useTransactionStore((s) => s.addParsedTransactions);

  const selectedBankInfo = useMemo(
    () => SUPPORTED_BANKS.find((b) => b.id === selectedBank),
    [selectedBank]
  );

  useEffect(() => {
    setPendingFile(null);
    setPassword('');
    setPasswordError(null);
  }, [selectedBank]);

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

  const processFile = useCallback(
    async (file: File, filePassword?: string) => {
      if (!selectedBank || !apiRef.current) return;

      setPasswordError(null);
      setStatus({ stage: 'parsing', progress: 0, message: 'reading file...' });

      try {
        const buffer = await file.arrayBuffer();

        const result = await apiRef.current.parseFile(
          buffer,
          file.name,
          selectedBank,
          filePassword,
          Comlink.proxy((progress: number, message: string) => {
            setStatus({ stage: 'parsing', progress, message: message.toLowerCase() });
          })
        );

        if (result.error) {
          const isPasswordError = result.error.toLowerCase().includes('password') || 
                                  result.error.toLowerCase().includes('decrypt') ||
                                  result.error.toLowerCase().includes('encrypted');
          
          if (isPasswordError) {
            setPendingFile(file);
            setPasswordError(filePassword ? 'incorrect password, please try again' : null);
            setStatus({ stage: 'idle' });
          } else {
            setStatus({ stage: 'error', message: result.error });
            setPendingFile(null);
          }
          return;
        }

        setPendingFile(null);
        setPassword('');
        await addParsedTransactions(result.transactions as Transaction[]);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'failed to process file';
        const isPasswordError = errorMessage.toLowerCase().includes('password') || 
                                errorMessage.toLowerCase().includes('decrypt') ||
                                errorMessage.toLowerCase().includes('encrypted');
        
        if (isPasswordError) {
          setPendingFile(file);
          setPasswordError(filePassword ? 'incorrect password, please try again' : null);
          setStatus({ stage: 'idle' });
        } else {
          setStatus({ stage: 'error', message: errorMessage });
          setPendingFile(null);
        }
      }
    },
    [selectedBank, setStatus, addParsedTransactions]
  );

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!selectedBank) return;
      await processFile(file);
    },
    [selectedBank, processFile]
  );

  const handleUnlock = useCallback(async () => {
    if (!pendingFile || !password) return;
    await processFile(pendingFile, password);
  }, [pendingFile, password, processFile]);

  const handleCancelPending = useCallback(() => {
    setPendingFile(null);
    setPassword('');
    setPasswordError(null);
  }, []);

  const handleFileError = useCallback((message: string) => {
    setStatus({ stage: 'error', message });
  }, [setStatus]);

  const isProcessing = status.stage === 'parsing';

  return (
    <div className="flex min-h-screen flex-col px-4 py-6">
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

      <div className="mt-8 flex flex-1 flex-col items-center justify-center gap-8">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            know where your money went
          </p>
          <p className="text-xs text-muted-foreground/70">
            your bank statement never leaves your device
          </p>
        </div>

        {pendingFile ? (
          <div className="w-full max-w-sm tui-box p-4 space-y-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">selected file</p>
              <p className="text-sm truncate">{pendingFile.name}</p>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">
                this pdf is password protected
              </label>
              <input
                type="password"
                placeholder="enter password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && password) {
                    handleUnlock();
                  }
                }}
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                autoFocus
              />
              {passwordError && (
                <p className="text-xs text-destructive">{passwordError}</p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCancelPending}
                className="flex-1 border border-border px-3 py-2 text-xs hover:bg-muted"
              >
                cancel
              </button>
              <button
                onClick={handleUnlock}
                disabled={!password || isProcessing}
                className="flex-1 bg-accent text-accent-foreground px-3 py-2 text-xs disabled:opacity-50"
              >
                unlock
              </button>
            </div>
          </div>
        ) : (
          <DropZone
            onFileSelect={handleFileSelect}
            onError={handleFileError}
            disabled={isProcessing || !selectedBank}
            fileFormat={selectedBankInfo?.fileFormat}
          />
        )}

        <BankPicker selectedBank={selectedBank} onSelectBank={setSelectedBank} />

        {!selectedBank && (
          <p className="text-center text-xs text-muted-foreground">
            <span className="text-accent">hint:</span> select your bank first
          </p>
        )}
      </div>

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

      <SettingsSheet
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
