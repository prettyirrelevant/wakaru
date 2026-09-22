import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Comlink from 'comlink';
import { usePGlite } from '@electric-sql/pglite-react';
import type {
  BankType,
  CurrencyCode,
  ImportSummary,
  ParseOutput,
  ProcessingStatus,
} from '~/types';
import { SUPPORTED_BANKS } from '~/lib/constants';
import { accountCurrenciesForBank } from '~/lib/db';
import { hashBytes } from '~/lib/utils/hash';
import { ingestParsedStatement } from '~/lib/ledger/ingest';
import { runSuggestionPass } from '~/lib/ledger/suggested-rules';
import { useSettingsStore } from '~/stores/settings';
import { PARSER_VERSION } from '~/workers/parser-version';

interface ParserApi {
  parseFile(
    fileBuffer: ArrayBuffer,
    fileName: string,
    bankType: BankType,
    password: string | undefined,
    onProgress: (progress: number, message: string) => void
  ): Promise<ParseOutput>;
}

export interface UseStatementUploadOptions {
  onComplete?: (summary: ImportSummary) => void;
  enabled?: boolean;
}

export function useStatementUpload({ onComplete, enabled = true }: UseStatementUploadOptions = {}) {
  const db = usePGlite();

  const [selectedBank, setSelectedBank] = useState<BankType | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>('NGN');
  const [status, setStatus] = useState<ProcessingStatus>({ stage: 'idle' });
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [knownCurrencies, setKnownCurrencies] = useState<string[]>([]);

  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<Comlink.Remote<ParserApi> | null>(null);

  const selectedBankInfo = useMemo(
    () => SUPPORTED_BANKS.find((b) => b.id === selectedBank),
    [selectedBank]
  );

  useEffect(() => {
    if (!enabled) return;

    const worker = new Worker(new URL('../workers/parser.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    apiRef.current = Comlink.wrap<ParserApi>(worker);

    return () => {
      worker.terminate();
      workerRef.current = null;
      apiRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    setPendingFile(null);
    setPassword('');
    setPasswordError(null);
  }, [selectedBank]);

  // Currency is part of an account's identity, so picking the wrong one
  // silently creates a second account. Look up what this bank already uses.
  useEffect(() => {
    if (!selectedBank) {
      setKnownCurrencies([]);
      return;
    }
    let cancelled = false;
    accountCurrenciesForBank(db, selectedBank).then((currencies) => {
      if (!cancelled) setKnownCurrencies(currencies);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedBank, db]);

  const currencyWarning =
    knownCurrencies.length > 0 && !knownCurrencies.includes(currency)
      ? `This bank already has a ${knownCurrencies.join('/')} account. Importing as ${currency} creates another account.`
      : null;

  const reset = useCallback(() => {
    setStatus({ stage: 'idle' });
    setSelectedBank(null);
    setCurrency('NGN');
    setPendingFile(null);
    setPassword('');
    setPasswordError(null);
  }, []);

  const processFile = useCallback(
    async (file: File, filePassword?: string) => {
      const api = apiRef.current;
      if (!selectedBank || !api) return;

      setPasswordError(null);
      setStatus({ stage: 'parsing', progress: 0, message: 'Reading file…' });

      try {
        const buffer = await file.arrayBuffer();
        const fileHash = await hashBytes(buffer);

        const parsed = await api.parseFile(
          buffer,
          file.name,
          selectedBank,
          filePassword,
          Comlink.proxy((progress: number, message: string) => {
            setStatus({ stage: 'parsing', progress, message });
          })
        );

        if (parsed.errorCode === 'password_required' || parsed.errorCode === 'password_incorrect') {
          setPendingFile(file);
          setPasswordError(
            parsed.errorCode === 'password_incorrect' ? 'The password is incorrect. Try again.' : null
          );
          setStatus({ stage: 'idle' });
          return;
        }

        if (parsed.error) {
          setPendingFile(null);
          setStatus({ stage: 'error', message: parsed.error });
          return;
        }

        setStatus({ stage: 'parsing', progress: 95, message: 'Building your ledger…' });

        const summary = await ingestParsedStatement(db, {
          parsed,
          fileName: file.name,
          fileHash,
          bank: selectedBank,
          currency,
          parserVersion: PARSER_VERSION,
        });

        setPendingFile(null);
        setPassword('');
        setStatus({ stage: 'complete', summary });

        if (summary.inserted > 0) {
          const chatMode = useSettingsStore.getState().chatMode;
          if (
            chatMode.type === 'cloud' ||
            (chatMode.type === 'local' && chatMode.status === 'connected')
          ) {
            try {
              const suggestions = await runSuggestionPass(db, chatMode);
              if (suggestions && suggestions.rules > 0) {
                setStatus({ stage: 'complete', summary, suggestions });
              }
            } catch {
              // Suggestions are optional and must never fail an import.
            }
          }
        }

        onComplete?.(summary);
      } catch (error) {
        setPendingFile(null);
        setStatus({
          stage: 'error',
          message: error instanceof Error ? error.message : 'The file could not be processed.',
        });
      }
    },
    [selectedBank, currency, db, onComplete]
  );

  const selectFile = useCallback(
    async (file: File) => {
      if (!selectedBank) return;
      await processFile(file);
    },
    [selectedBank, processFile]
  );

  const unlock = useCallback(async () => {
    if (!pendingFile || !password) return;
    await processFile(pendingFile, password);
  }, [pendingFile, password, processFile]);

  const cancelPending = useCallback(() => {
    setPendingFile(null);
    setPassword('');
    setPasswordError(null);
  }, []);

  const fail = useCallback((message: string) => {
    setStatus({ stage: 'error', message });
  }, []);

  return {
    selectedBank,
    setSelectedBank,
    selectedBankInfo,
    currency,
    setCurrency,
    currencyWarning,
    status,
    isProcessing: status.stage === 'parsing',
    pendingFile,
    password,
    setPassword,
    passwordError,
    selectFile,
    unlock,
    cancelPending,
    fail,
    reset,
  };
}
