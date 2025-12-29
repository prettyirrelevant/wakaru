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
  localStatus: LLMStatus;
  
  // Local LLM methods
  initLocal: () => Promise<void>;
  generateLocalSQL: (question: string) => Promise<string>;
  generateLocalAnswer: (question: string, results: string) => Promise<string>;
  
  // Cloud methods
  generateCloudSQL: (question: string) => Promise<string>;
  generateCloudAnswer: (question: string, results: string) => Promise<string>;
}

let worker: Worker | null = null;
let api: Comlink.Remote<LLMApi> | null = null;

export const useLLMStore = create<LLMState>((set, get) => ({
  localStatus: { stage: 'idle' },
  
  initLocal: async () => {
    const currentStatus = get().localStatus;
    if (currentStatus.stage === 'ready') return;
    if (currentStatus.stage === 'loading' && worker) return;
    
    set({ localStatus: { stage: 'loading', progress: 0, message: 'Initializing local AI...' } });
    
    try {
      worker = new Worker(
        new URL('../workers/llm.worker.ts', import.meta.url),
        { type: 'module' }
      );
      api = Comlink.wrap<LLMApi>(worker);
      
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
  
  generateLocalSQL: async (question: string) => {
    if (!api) throw new Error('Local AI not initialized');
    return api.generateSQL(question);
  },
  
  generateLocalAnswer: async (question: string, results: string) => {
    if (!api) throw new Error('Local AI not initialized');
    return api.generateAnswer(question, results);
  },
  
  generateCloudSQL: async (question: string) => {
    const response = await fetch(`${PROXY_URL}/api/sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || 'Failed to generate SQL');
    }
    
    const data = await response.json() as { sql?: string; error?: string };
    if (data.error) throw new Error(data.error);
    if (!data.sql) throw new Error('No SQL returned');
    
    return data.sql;
  },
  
  generateCloudAnswer: async (question: string, results: string) => {
    const response = await fetch(`${PROXY_URL}/api/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, results }),
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || 'Failed to generate answer');
    }
    
    const data = await response.json() as { answer?: string; error?: string };
    if (data.error) throw new Error(data.error);
    if (!data.answer) throw new Error('No answer returned');
    
    return data.answer;
  },
}));
