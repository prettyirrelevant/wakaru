/**
 * LEGACY MIGRATION CODE - REMOVE AFTER APRIL 2026
 *
 * This file migrates data from the old Dexie (IndexedDB) database to PGLite.
 * Once most users have migrated, this entire file can be safely deleted.
 */

import type { Transaction } from '~/types';
import { addTransactions, setSetting } from './index';

const MIGRATION_KEY = 'wakaru_pglite_migrated';

type DbInstance = Parameters<typeof addTransactions>[0];

export async function migrateFromLegacyDexie(db: DbInstance): Promise<void> {
  if (localStorage.getItem(MIGRATION_KEY)) return;

  try {
    const oldDb = await openLegacyDatabase();
    if (!oldDb) {
      localStorage.setItem(MIGRATION_KEY, '1');
      return;
    }

    const transactions = await readLegacyTransactions(oldDb);
    if (transactions.length > 0) {
      await addTransactions(db, transactions);
    }

    const settings = await readLegacySettings(oldDb);
    for (const { key, value } of settings) {
      await setSetting(db, key, value);
    }

    oldDb.close();
    indexedDB.deleteDatabase('wakaru');
    localStorage.setItem(MIGRATION_KEY, '1');

    if (transactions.length > 0) {
      console.log(`[wakaru] Migrated ${transactions.length} transactions from legacy database`);
    }
  } catch (err) {
    console.error('[wakaru] Migration failed, starting fresh:', err);
    localStorage.setItem(MIGRATION_KEY, '1');
  }
}

function openLegacyDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open('wakaru');
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('transactions')) {
        db.close();
        resolve(null);
        return;
      }
      resolve(db);
    };
    request.onupgradeneeded = () => {
      request.transaction?.abort();
      resolve(null);
    };
  });
}

function readLegacyTransactions(db: IDBDatabase): Promise<Transaction[]> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('transactions', 'readonly');
      const store = tx.objectStore('transactions');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } catch {
      resolve([]);
    }
  });
}

function readLegacySettings(db: IDBDatabase): Promise<{ key: string; value: unknown }[]> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } catch {
      resolve([]);
    }
  });
}
