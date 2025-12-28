import Dexie, { type Table } from 'dexie';
import type { Transaction } from '~/types';

export interface StoredSettings {
  key: string;
  value: unknown;
}

export interface StoredEmbedding {
  id: string; // Same as transaction id
  embedding: number[];
  createdAt: number;
}

class WakaruDB extends Dexie {
  transactions!: Table<Transaction>;
  settings!: Table<StoredSettings>;
  embeddings!: Table<StoredEmbedding>;

  constructor() {
    super('wakaru');
    
    this.version(1).stores({
      transactions: 'id, date, bankSource, category',
      settings: 'key',
    });
    
    // Version 2: Add embeddings table
    this.version(2).stores({
      transactions: 'id, date, bankSource, category',
      settings: 'key',
      embeddings: 'id, createdAt',
    });
  }
}

export const db = new WakaruDB();

// Helper functions
export async function getAllTransactions(): Promise<Transaction[]> {
  return db.transactions.toArray();
}

export async function addTransactions(transactions: Transaction[]): Promise<void> {
  await db.transactions.bulkPut(transactions);
}

export async function clearTransactions(): Promise<void> {
  await db.transactions.clear();
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const setting = await db.settings.get(key);
  return setting?.value as T | undefined;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}

export async function clearAllData(): Promise<void> {
  await db.transactions.clear();
  await db.settings.clear();
  await db.embeddings.clear();
}

// Embedding helpers
export async function getAllEmbeddings(): Promise<StoredEmbedding[]> {
  return db.embeddings.toArray();
}

export async function addEmbeddings(embeddings: StoredEmbedding[]): Promise<void> {
  await db.embeddings.bulkPut(embeddings);
}

export async function clearEmbeddings(): Promise<void> {
  await db.embeddings.clear();
}

export async function getEmbeddingIds(): Promise<string[]> {
  return db.embeddings.toCollection().primaryKeys() as Promise<string[]>;
}

export async function deleteEmbeddingsByIds(ids: string[]): Promise<void> {
  await db.embeddings.bulkDelete(ids);
}
