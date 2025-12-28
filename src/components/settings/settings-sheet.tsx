import { useState } from 'react';
import { BottomSheet, Progress } from '~/components/ui';
import { useSettingsStore, type AIProvider } from '~/stores/settings';
import { useTransactionStore } from '~/stores/transactions';
import { useEmbeddingStore } from '~/stores/embeddings';
import { useLLMStore } from '~/stores/llm';
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
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const setAIProvider = useSettingsStore((s) => s.setAIProvider);

  const clearAll = useTransactionStore((s) => s.clearAll);
  const transactions = useTransactionStore((s) => s.transactions);

  // Embedding state
  const embeddingStatus = useEmbeddingStore((s) => s.status);
  const embedTransactions = useEmbeddingStore((s) => s.embedTransactions);
  const clearEmbeddings = useEmbeddingStore((s) => s.clearAll);

  // Local LLM state
  const localLLMStatus = useLLMStore((s) => s.localStatus);
  const initLocalLLM = useLLMStore((s) => s.initLocal);

  const handleClearData = async () => {
    await clearAll();
    await clearEmbeddings();
    setShowClearConfirm(false);
    onClose();
  };

  const handleSelectProvider = async (provider: AIProvider) => {
    setAIProvider(provider);
    
    // If selecting local, start loading the model
    if (provider === 'local' && localLLMStatus.stage === 'idle') {
      initLocalLLM();
    }
    
    // Also enable semantic search for better queries
    if (transactions.length > 0 && embeddingStatus.stage === 'idle') {
      embedTransactions(transactions);
    }
  };

  const themeOptions: { value: Theme; label: string }[] = [
    { value: 'system', label: 'auto' },
    { value: 'light', label: 'light' },
    { value: 'dark', label: 'dark' },
  ];

  // Check if embedding is loading
  const isEmbeddingLoading = 
    embeddingStatus.stage === 'loading_model' || 
    embeddingStatus.stage === 'embedding';

  // Check if local LLM is loading
  const isLocalLoading = localLLMStatus.stage === 'loading';

  // Get status text for each provider
  const getProviderStatus = (provider: AIProvider) => {
    if (provider === 'cloud') {
      return aiProvider === 'cloud' ? 'ready' : null;
    }
    if (provider === 'local') {
      if (aiProvider !== 'local') return null;
      if (localLLMStatus.stage === 'ready') return 'ready';
      if (localLLMStatus.stage === 'loading') return 'loading...';
      if (localLLMStatus.stage === 'error') return 'error';
      return null;
    }
    return null;
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="max-h-[85vh] overflow-y-auto px-4 pb-8">
        {/* Header */}
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
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <span>ai chat</span>
          </div>
          
          <div className="space-y-2">
            {/* Cloud option */}
            <button
              onClick={() => handleSelectProvider('cloud')}
              className={`w-full text-left text-xs px-3 py-2 border ${
                aiProvider === 'cloud'
                  ? 'bg-accent/10 border-accent text-foreground'
                  : 'bg-muted border-border hover:border-border-strong'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{aiProvider === 'cloud' ? '>' : ' '} cloud</span>
                {getProviderStatus('cloud') && (
                  <span className="tui-badge-success">{getProviderStatus('cloud')}</span>
                )}
              </div>
              <div className="text-muted-foreground/70 mt-0.5 pl-2">
                instant responses, requires internet
              </div>
            </button>

            {/* Local option */}
            <button
              onClick={() => handleSelectProvider('local')}
              className={`w-full text-left text-xs px-3 py-2 border ${
                aiProvider === 'local'
                  ? 'bg-accent/10 border-accent text-foreground'
                  : 'bg-muted border-border hover:border-border-strong'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{aiProvider === 'local' ? '>' : ' '} local</span>
                {getProviderStatus('local') && (
                  <span className={
                    localLLMStatus.stage === 'error' 
                      ? 'tui-badge-error' 
                      : localLLMStatus.stage === 'ready'
                        ? 'tui-badge-success'
                        : 'tui-badge'
                  }>
                    {getProviderStatus('local')}
                  </span>
                )}
              </div>
              <div className="text-muted-foreground/70 mt-0.5 pl-2">
                works offline, ~135mb one-time download
              </div>
            </button>
          </div>

          {/* Local LLM loading progress */}
          {aiProvider === 'local' && isLocalLoading && (
            <div className="mt-3 tui-box p-3">
              <div className="flex items-center justify-between text-xs mb-2">
                <span>{localLLMStatus.message || 'Loading model...'}</span>
                <span>{localLLMStatus.progress ?? 0}%</span>
              </div>
              <Progress value={localLLMStatus.progress ?? 0} />
            </div>
          )}

          {/* Embedding progress */}
          {isEmbeddingLoading && (
            <div className="mt-3 tui-box p-3">
              <div className="flex items-center justify-between text-xs mb-2">
                <span>
                  {embeddingStatus.stage === 'loading_model' 
                    ? 'Loading search...' 
                    : 'Indexing transactions...'}
                </span>
                <span>{embeddingStatus.progress ?? 0}%</span>
              </div>
              <Progress value={embeddingStatus.progress ?? 0} />
            </div>
          )}

          {/* Local LLM error */}
          {aiProvider === 'local' && localLLMStatus.stage === 'error' && (
            <div className="mt-3 text-xs text-destructive">
              error: {localLLMStatus.error}
            </div>
          )}

          {/* Help text */}
          {aiProvider === 'none' && (
            <p className="mt-3 text-xs text-muted-foreground/70">
              select a provider to enable ai chat
            </p>
          )}
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

        {/* About */}
        <section>
          <div className="text-xs text-muted-foreground/70 space-y-1">
            <p>wakaru - understand your spending</p>
            <p>all data stays on your device</p>
            <p className="mt-2 text-muted-foreground/50">v0.0.1</p>
          </div>
        </section>
      </div>
    </BottomSheet>
  );
}
