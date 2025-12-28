import { useState, useCallback, useEffect, useRef } from 'react';
import * as Comlink from 'comlink';
import { BottomSheet, Progress } from '~/components/ui';
import { useTransactionStore } from '~/stores/transactions';
import { DropZone } from './drop-zone';
import { BankPicker } from './bank-picker';
import type { BankType, Transaction } from '~/types';

interface ParserApi {
  parseFile(
    fileBuffer: ArrayBuffer,
    fileName: string,
    bankType: BankType,
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

  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<Comlink.Remote<ParserApi> | null>(null);

  const addParsedTransactions = useTransactionStore((s) => s.addParsedTransactions);

  // Initialize worker when sheet opens
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

  // Reset state when sheet closes
  useEffect(() => {
    if (!isOpen) {
      setUploadStatus({ stage: 'idle' });
      setSelectedBank(null);
    }
  }, [isOpen]);

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!selectedBank || !apiRef.current) return;

      setUploadStatus({ stage: 'parsing', progress: 0, message: 'reading file...' });

      try {
        const buffer = await file.arrayBuffer();

        const result = await apiRef.current.parseFile(
          buffer,
          file.name,
          selectedBank,
          Comlink.proxy((progress: number, message: string) => {
            setUploadStatus({ stage: 'parsing', progress, message: message.toLowerCase() });
          })
        );

        if (result.error) {
          setUploadStatus({ stage: 'error', message: result.error });
          return;
        }

        await addParsedTransactions(result.transactions as Transaction[]);
        setUploadStatus({ stage: 'success', message: `Added ${result.transactions.length} transactions` });
        
        // Close after a short delay on success
        setTimeout(() => {
          onClose();
        }, 1000);
      } catch (error) {
        setUploadStatus({
          stage: 'error',
          message: error instanceof Error ? error.message : 'failed to process file',
        });
      }
    },
    [selectedBank, addParsedTransactions, onClose]
  );

  const isProcessing = uploadStatus.stage === 'parsing';

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="px-4 pb-6">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-accent">$</span>
          <h2 className="text-sm font-semibold">add statement</h2>
        </div>

        {/* Status */}
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

        {/* Bank Picker */}
        <div className="mb-4">
          <BankPicker selectedBank={selectedBank} onSelectBank={setSelectedBank} />
        </div>

        {/* Drop Zone */}
        <DropZone
          onFileSelect={handleFileSelect}
          disabled={isProcessing || !selectedBank}
        />

        {!selectedBank && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            <span className="text-accent">hint:</span> select your bank first
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
