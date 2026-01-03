import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import * as Comlink from 'comlink';
import { BottomSheet, Progress } from '~/components/ui';
import { useTransactionStore } from '~/stores/transactions';
import { DropZone } from './drop-zone';
import { BankPicker } from './bank-picker';
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

interface UploadSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UploadSheet({ isOpen, onClose }: UploadSheetProps) {
  const [selectedBank, setSelectedBank] = useState<BankType | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{
    stage: 'idle' | 'parsing' | 'error' | 'success';
    progress?: number;
    message?: string;
  }>({ stage: 'idle' });
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<Comlink.Remote<ParserApi> | null>(null);

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
    if (!isOpen) return;

    workerRef.current = new Worker(
      new URL('../../workers/parser.worker.ts', import.meta.url),
      { type: 'module' }
    );
    apiRef.current = Comlink.wrap<ParserApi>(workerRef.current);

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      apiRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setUploadStatus({ stage: 'idle' });
      setSelectedBank(null);
      setPendingFile(null);
      setPassword('');
      setPasswordError(null);
    }
  }, [isOpen]);

  const processFile = useCallback(
    async (file: File, filePassword?: string) => {
      if (!selectedBank || !apiRef.current) return;

      setPasswordError(null);
      setUploadStatus({ stage: 'parsing', progress: 0, message: 'reading file...' });

      try {
        const buffer = await file.arrayBuffer();

        const result = await apiRef.current.parseFile(
          buffer,
          file.name,
          selectedBank,
          filePassword,
          Comlink.proxy((progress: number, message: string) => {
            setUploadStatus({ stage: 'parsing', progress, message: message.toLowerCase() });
          })
        );

        if (result.error) {
          if (result.error.toLowerCase().includes('password') || result.error.toLowerCase().includes('decrypt')) {
            setPasswordError('incorrect password, please try again');
            setUploadStatus({ stage: 'idle' });
          } else {
            setUploadStatus({ stage: 'error', message: result.error });
            setPendingFile(null);
          }
          return;
        }

        setPendingFile(null);
        setPassword('');
        await addParsedTransactions(result.transactions as Transaction[]);
        setUploadStatus({ stage: 'success', message: `Added ${result.transactions.length} transactions` });

        setTimeout(() => {
          onClose();
        }, 1000);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'failed to process file';
        if (errorMessage.toLowerCase().includes('password') || errorMessage.toLowerCase().includes('decrypt')) {
          setPasswordError('incorrect password, please try again');
          setUploadStatus({ stage: 'idle' });
        } else {
          setUploadStatus({ stage: 'error', message: errorMessage });
          setPendingFile(null);
        }
      }
    },
    [selectedBank, addParsedTransactions, onClose]
  );

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!selectedBank) return;

      if (selectedBankInfo?.requiresPassword) {
        setPendingFile(file);
        setPassword('');
        setPasswordError(null);
      } else {
        await processFile(file);
      }
    },
    [selectedBank, selectedBankInfo, processFile]
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
    setUploadStatus({ stage: 'error', message });
  }, []);

  const isProcessing = uploadStatus.stage === 'parsing';

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="px-4 pb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-accent">$</span>
          <h2 className="text-sm font-semibold">add statement</h2>
        </div>

        {isProcessing && (
          <div className="mb-4 tui-box p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{uploadStatus.message}</span>
              <span className="mono-nums">{uploadStatus.progress}%</span>
            </div>
            <Progress value={uploadStatus.progress ?? 0} />
          </div>
        )}

        {uploadStatus.stage === 'error' && (
          <div className="mb-4 tui-box border-destructive/30 bg-destructive-muted p-3 text-xs text-destructive">
            <span className="text-muted-foreground mr-2">err:</span>
            {uploadStatus.message}
          </div>
        )}

        {uploadStatus.stage === 'success' && (
          <div className="mb-4 tui-box border-accent/30 bg-accent/10 p-3 text-xs text-accent">
            {uploadStatus.message}
          </div>
        )}

        <div className="mb-4">
          <BankPicker selectedBank={selectedBank} onSelectBank={setSelectedBank} />
        </div>

        {pendingFile ? (
          <div className="tui-box p-4 space-y-4">
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

        {!selectedBank && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            <span className="text-accent">hint:</span> select your bank first
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
