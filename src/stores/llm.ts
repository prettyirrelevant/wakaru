import { create } from 'zustand';
import * as Comlink from 'comlink';
import type { LLMApi } from '~/workers/llm.worker';

const PROXY_URL = 'https://wakaru-api.ienioladewumi.workers.dev';

interface LLMStatus {
  stage: 'idle' | 'loading' | 'ready' | 'error';
  progress?: number;
  message?: string;
  error?: string;
}

interface LLMState {
  // Local LLM status
  localStatus: LLMStatus;
  // Cloud is always ready (no initialization needed)
  
  // Local LLM methods
  initLocal: () => Promise<void>;
  generateQueryLocal: (question: string) => Promise<string>;
  
  // Cloud methods
  generateQueryCloud: (question: string) => Promise<string>;
}

let worker: Worker | null = null;
let api: Comlink.Remote<LLMApi> | null = null;

export const useLLMStore = create<LLMState>((set, get) => ({
  localStatus: { stage: 'idle' },
  
  initLocal: async () => {
    const currentStatus = get().localStatus;
    // Already ready, nothing to do
    if (currentStatus.stage === 'ready') {
      return;
    }
    // Already loading, let it continue
    if (currentStatus.stage === 'loading' && worker) {
      return;
    }
    
    set({ localStatus: { stage: 'loading', progress: 0, message: 'Initializing local AI...' } });
    
    try {
      // Create worker
      worker = new Worker(
        new URL('../workers/llm.worker.ts', import.meta.url),
        { type: 'module' }
      );
      api = Comlink.wrap<LLMApi>(worker);
      
      // Load model with progress
      const success = await api.loadModel(
        Comlink.proxy((progress: number, message: string) => {
          set({ localStatus: { stage: 'loading', progress, message } });
        })
      );
      
      if (success) {
        set({ localStatus: { stage: 'ready' } });
      } else {
        const error = await api.getError();
        set({ localStatus: { stage: 'error', error: error || 'Failed to load local AI' } });
      }
    } catch (error) {
      set({ 
        localStatus: { 
          stage: 'error', 
          error: error instanceof Error ? error.message : 'Failed to initialize local AI' 
        } 
      });
    }
  },
  
  generateQueryLocal: async (question: string) => {
    if (!api) throw new Error('Local AI not initialized');
    return api.generateQuery(question);
  },
  
  generateQueryCloud: async (question: string) => {
    const response = await fetch(`${PROXY_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question }),
    });
    
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
      }
      const data = await response.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || 'Cloud AI request failed');
    }
    
    const data = await response.json() as { query?: object; error?: string };
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    if (!data.query) {
      throw new Error('Invalid response from cloud AI');
    }
    
    // Return as JSON string (same format as local LLM)
    return JSON.stringify(data.query);
  },
}));
