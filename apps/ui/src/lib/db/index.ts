import Dexie, { type Table } from 'dexie';
import type { Transaction } from '~/types';

export interface StoredSettings {
  key: string;
  value: unknown;
}

class WakaruDB extends Dexie {
  transactions!: Table<Transaction>;
  settings!: Table<StoredSettings>;

  constructor() {
    super('wakaru');
    
    this.version(1).stores({
      transactions: 'id, date, bankSource, category',
      settings: 'key',
    });
  }
}

const db = new WakaruDB();

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


