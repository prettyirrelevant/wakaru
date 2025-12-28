import { create } from 'zustand';
import * as Comlink from 'comlink';
import type { EmbeddingApi } from '~/workers/embedding.worker';
import {
  getAllEmbeddings,
  addEmbeddings,
  clearEmbeddings,
  getEmbeddingIds,
  type StoredEmbedding,
} from '~/lib/db';
import type { Transaction } from '~/types';

export type EmbeddingStatus =
  | { stage: 'idle' }
  | { stage: 'loading_model'; progress: number; message: string }
  | { stage: 'model_ready' }
  | { stage: 'embedding'; progress: number; message: string }
  | { stage: 'ready'; embeddingCount: number }
  | { stage: 'error'; message: string };

interface EmbeddingState {
  status: EmbeddingStatus;
  embeddings: StoredEmbedding[];
  worker: Comlink.Remote<EmbeddingApi> | null;
  isModelLoaded: boolean;

  // Actions
  init: () => Promise<void>;
  loadModel: () => Promise<boolean>;
  embedTransactions: (transactions: Transaction[]) => Promise<void>;
  search: (query: string, topK?: number) => Promise<Array<{ id: string; score: number }>>;
  clearAll: () => Promise<void>;
}

// Lazy worker initialization
let workerInstance: Worker | null = null;
let workerProxy: Comlink.Remote<EmbeddingApi> | null = null;

function getWorker(): Comlink.Remote<EmbeddingApi> {
  if (!workerProxy) {
    workerInstance = new Worker(
      new URL('../workers/embedding.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerProxy = Comlink.wrap<EmbeddingApi>(workerInstance);
  }
  return workerProxy;
}

export const useEmbeddingStore = create<EmbeddingState>((set, get) => ({
  status: { stage: 'idle' },
  embeddings: [],
  worker: null,
  isModelLoaded: false,

  init: async () => {
    // Load existing embeddings from IndexedDB
    const embeddings = await getAllEmbeddings();
    
    if (embeddings.length > 0) {
      set({
        embeddings,
        status: { stage: 'ready', embeddingCount: embeddings.length },
      });
    }
  },

  loadModel: async () => {
    const { isModelLoaded } = get();
    if (isModelLoaded) return true;

    set({ status: { stage: 'loading_model', progress: 0, message: 'Initializing...' } });

    try {
      const worker = getWorker();
      set({ worker });

      const success = await worker.loadModel(
        Comlink.proxy((progress: number, message: string) => {
          set({ status: { stage: 'loading_model', progress, message } });
        })
      );

      if (success) {
        set({ isModelLoaded: true, status: { stage: 'model_ready' } });
        return true;
      } else {
        const error = await worker.getError();
        set({ status: { stage: 'error', message: error || 'Failed to load model' } });
        return false;
      }
    } catch (error) {
      set({
        status: {
          stage: 'error',
          message: error instanceof Error ? error.message : 'Failed to load model',
        },
      });
      return false;
    }
  },

  embedTransactions: async (transactions) => {
    const { isModelLoaded } = get();

    // First ensure model is loaded
    if (!isModelLoaded) {
      const success = await get().loadModel();
      if (!success) return;
    }

    const currentWorker = get().worker;
    if (!currentWorker) return;

    set({ status: { stage: 'embedding', progress: 0, message: 'Starting...' } });

    try {
      // Get existing embedding IDs to only embed new transactions
      const existingIds = new Set(await getEmbeddingIds());
      const newTransactions = transactions.filter((t) => !existingIds.has(t.id));

      if (newTransactions.length === 0) {
        // All transactions already embedded
        const embeddings = await getAllEmbeddings();
        set({
          embeddings,
          status: { stage: 'ready', embeddingCount: embeddings.length },
        });
        return;
      }

      // Prepare transactions for embedding
      const toEmbed = newTransactions.map((t) => ({
        id: t.id,
        description: t.description,
        amount: t.amount,
        date: t.date,
        category: t.category as 'inflow' | 'outflow',
      }));

      // Generate embeddings
      const results = await currentWorker.embedTransactions(
        toEmbed,
        Comlink.proxy((progress: number, message: string) => {
          set({ status: { stage: 'embedding', progress, message } });
        })
      );

      // Convert to stored format
      const now = Date.now();
      const newEmbeddings: StoredEmbedding[] = results.map((r) => ({
        id: r.id,
        embedding: r.embedding,
        createdAt: now,
      }));

      // Save to database
      await addEmbeddings(newEmbeddings);

      // Update state with all embeddings
      const allEmbeddings = await getAllEmbeddings();
      set({
        embeddings: allEmbeddings,
        status: { stage: 'ready', embeddingCount: allEmbeddings.length },
      });
    } catch (error) {
      set({
        status: {
          stage: 'error',
          message: error instanceof Error ? error.message : 'Failed to embed transactions',
        },
      });
    }
  },

  search: async (query, topK = 5) => {
    const { embeddings, worker, isModelLoaded } = get();

    if (!isModelLoaded || !worker || embeddings.length === 0) {
      return [];
    }

    try {
      const results = await worker.semanticSearch(
        query,
        embeddings.map((e) => ({ id: e.id, embedding: e.embedding })),
        topK
      );
      return results;
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  },

  clearAll: async () => {
    await clearEmbeddings();
    set({
      embeddings: [],
      status: { stage: 'idle' },
    });
  },
}));
