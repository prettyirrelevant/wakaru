import * as Comlink from 'comlink';
import { pipeline } from '@huggingface/transformers';

// Model configuration
const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const BATCH_SIZE = 32;

// Types for worker isolation
interface TransactionForEmbedding {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: 'inflow' | 'outflow';
}

export interface EmbeddingResult {
  id: string;
  embedding: number[];
}

export interface SearchResult {
  id: string;
  score: number;
}

type ProgressCallback = (progress: number, message: string) => void;

// Pipeline type - use any to avoid complex union type issues with @huggingface/transformers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EmbeddingPipeline = any;

// Singleton pipeline
let embeddingPipeline: EmbeddingPipeline | null = null;
let isModelLoading = false;
let modelLoadError: string | null = null;

// Helper to create searchable text from transaction
function createSearchText(tx: TransactionForEmbedding): string {
  const type = tx.category === 'inflow' ? 'received' : 'spent';
  const absAmount = Math.abs(tx.amount / 100).toFixed(2);
  const date = new Date(tx.date).toLocaleDateString('en-NG', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${type} ${absAmount} naira on ${date}: ${tx.description}`;
}

// Cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

const embeddingApi = {
  /**
   * Load the embedding model. Call this once before using other methods.
   * Returns true if model is ready, false if loading failed.
   */
  async loadModel(onProgress?: ProgressCallback): Promise<boolean> {
    if (embeddingPipeline) return true;
    if (isModelLoading) return false;
    if (modelLoadError) return false;

    isModelLoading = true;
    onProgress?.(0, 'Initializing embedding model...');

    try {
      embeddingPipeline = await pipeline('feature-extraction', MODEL_ID, {
        progress_callback: (data: { status?: string; progress?: number; file?: string }) => {
          if (data.status === 'progress' && data.progress !== undefined) {
            const progress = Math.round(data.progress);
            onProgress?.(progress, `Downloading model... ${progress}%`);
          } else if (data.status === 'done') {
            onProgress?.(100, 'Model ready');
          }
        },
      });

      isModelLoading = false;
      return true;
    } catch (error) {
      isModelLoading = false;
      modelLoadError = error instanceof Error ? error.message : 'Failed to load model';
      console.error('Failed to load embedding model:', error);
      return false;
    }
  },

  /**
   * Check if the model is loaded and ready
   */
  isReady(): boolean {
    return embeddingPipeline !== null;
  },

  /**
   * Get the model loading error if any
   */
  getError(): string | null {
    return modelLoadError;
  },

  /**
   * Generate embeddings for a list of transactions
   */
  async embedTransactions(
    transactions: TransactionForEmbedding[],
    onProgress?: ProgressCallback
  ): Promise<EmbeddingResult[]> {
    if (!embeddingPipeline) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    const results: EmbeddingResult[] = [];
    const total = transactions.length;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = transactions.slice(i, i + BATCH_SIZE);
      const texts = batch.map((tx) => createSearchText(tx));

      const embeddings = await embeddingPipeline(texts, {
        pooling: 'mean',
        normalize: true,
      });

      // Convert tensor to array
      const embeddingData = embeddings.tolist() as number[][];

      for (let j = 0; j < batch.length; j++) {
        results.push({
          id: batch[j].id,
          embedding: embeddingData[j],
        });
      }

      const progress = Math.round(((i + batch.length) / total) * 100);
      onProgress?.(progress, `Embedding transactions... ${i + batch.length}/${total}`);
    }

    return results;
  },

  /**
   * Generate embedding for a single query
   */
  async embedQuery(query: string): Promise<number[]> {
    if (!embeddingPipeline) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    const embedding = await embeddingPipeline(query, {
      pooling: 'mean',
      normalize: true,
    });

    return (embedding.tolist() as number[][])[0];
  },

  /**
   * Search for similar transactions given a query embedding and stored embeddings
   */
  async search(
    queryEmbedding: number[],
    storedEmbeddings: EmbeddingResult[],
    topK: number = 5
  ): Promise<SearchResult[]> {
    const scores: SearchResult[] = storedEmbeddings.map((item) => ({
      id: item.id,
      score: cosineSimilarity(queryEmbedding, item.embedding),
    }));

    // Sort by score descending and take top K
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  },

  /**
   * Full semantic search: embed query and find similar transactions
   */
  async semanticSearch(
    query: string,
    storedEmbeddings: EmbeddingResult[],
    topK: number = 5
  ): Promise<SearchResult[]> {
    const queryEmbedding = await this.embedQuery(query);
    return this.search(queryEmbedding, storedEmbeddings, topK);
  },
};

Comlink.expose(embeddingApi);

export type EmbeddingApi = typeof embeddingApi;
