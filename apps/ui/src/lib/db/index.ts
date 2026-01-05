import { PGlite } from '@electric-sql/pglite';
import { live } from '@electric-sql/pglite/live';
import type { Transaction, TransactionMeta } from '~/types';

type DbInstance = Awaited<ReturnType<typeof createDb>>;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    date TIMESTAMPTZ NOT NULL,
    created_at BIGINT NOT NULL,
    description TEXT NOT NULL,
    amount INTEGER NOT NULL,
    category TEXT NOT NULL,
    bank_source TEXT NOT NULL,
    reference TEXT NOT NULL,
    counterparty_name TEXT,
    counterparty_account TEXT,
    counterparty_bank TEXT,
    transaction_type TEXT,
    bill_type TEXT,
    bill_provider TEXT,
    bill_token TEXT,
    narration TEXT,
    session_id TEXT,
    raw_category TEXT,
    balance_after INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date DESC);
  CREATE INDEX IF NOT EXISTS idx_tx_bank ON transactions(bank_source);
  CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
  CREATE INDEX IF NOT EXISTS idx_tx_counterparty ON transactions(counterparty_name);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL
  );
`;

async function createDb() {
  return PGlite.create({
    dataDir: 'idb://wakaru',
    relaxedDurability: true,
    extensions: { live },
  });
}

let dbInstance: DbInstance | null = null;

export async function initDb(): Promise<DbInstance> {
  if (dbInstance) return dbInstance;

  const db = await createDb();
  await db.exec(SCHEMA);

  dbInstance = db;
  return db;
}

export function getDb(): DbInstance {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return dbInstance;
}

export async function getAllTransactions(db: DbInstance): Promise<Transaction[]> {
  const result = await db.query<{
    id: string;
    date: Date;
    created_at: string;
    description: string;
    amount: number;
    category: string;
    bank_source: string;
    reference: string;
    counterparty_name: string | null;
    counterparty_account: string | null;
    counterparty_bank: string | null;
    transaction_type: string | null;
    bill_type: string | null;
    bill_provider: string | null;
    bill_token: string | null;
    narration: string | null;
    session_id: string | null;
    raw_category: string | null;
    balance_after: number | null;
  }>('SELECT * FROM transactions ORDER BY date DESC');

  return result.rows.map((row) => ({
    id: row.id,
    date: row.date.toISOString(),
    createdAt: Number(row.created_at),
    description: row.description,
    amount: row.amount,
    category: row.category as Transaction['category'],
    bankSource: row.bank_source as Transaction['bankSource'],
    reference: row.reference,
    meta: {
      counterpartyName: row.counterparty_name ?? undefined,
      counterpartyAccount: row.counterparty_account ?? undefined,
      counterpartyBank: row.counterparty_bank ?? undefined,
      type: row.transaction_type as TransactionMeta['type'],
      billType: row.bill_type ?? undefined,
      billProvider: row.bill_provider ?? undefined,
      billToken: row.bill_token ?? undefined,
      narration: row.narration ?? undefined,
      sessionId: row.session_id ?? undefined,
      rawCategory: row.raw_category ?? undefined,
      balanceAfter: row.balance_after ?? undefined,
    },
  }));
}

export async function addTransactions(db: DbInstance, transactions: Transaction[]): Promise<void> {
  if (transactions.length === 0) return;

  const CHUNK_SIZE = 100;
  for (let i = 0; i < transactions.length; i += CHUNK_SIZE) {
    const chunk = transactions.slice(i, i + CHUNK_SIZE);
    
    const placeholders: string[] = [];
    const values: unknown[] = [];
    
    chunk.forEach((tx, idx) => {
      const offset = idx * 19;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}, $${offset + 17}, $${offset + 18}, $${offset + 19})`
      );
      values.push(
        tx.id,
        tx.date,
        tx.createdAt,
        tx.description,
        tx.amount,
        tx.category,
        tx.bankSource,
        tx.reference,
        tx.meta?.counterpartyName ?? null,
        tx.meta?.counterpartyAccount ?? null,
        tx.meta?.counterpartyBank ?? null,
        tx.meta?.type ?? null,
        tx.meta?.billType ?? null,
        tx.meta?.billProvider ?? null,
        tx.meta?.billToken ?? null,
        tx.meta?.narration ?? null,
        tx.meta?.sessionId ?? null,
        tx.meta?.rawCategory ?? null,
        tx.meta?.balanceAfter ?? null
      );
    });

    await db.query(
      `INSERT INTO transactions (
        id, date, created_at, description, amount, category, bank_source, reference,
        counterparty_name, counterparty_account, counterparty_bank, transaction_type,
        bill_type, bill_provider, bill_token, narration, session_id, raw_category, balance_after
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (id) DO NOTHING`,
      values
    );
  }
}

export async function clearTransactions(db: DbInstance): Promise<void> {
  await db.query('DELETE FROM transactions');
}

export async function getSetting<T>(db: DbInstance, key: string): Promise<T | undefined> {
  const result = await db.query<{ value: T }>(
    'SELECT value FROM settings WHERE key = $1',
    [key]
  );
  return result.rows[0]?.value;
}

export async function setSetting<T>(db: DbInstance, key: string, value: T): Promise<void> {
  await db.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2`,
    [key, JSON.stringify(value)]
  );
}

export async function executeQuery(
  db: { query: DbInstance['query'] },
  sql: string
): Promise<{ columns: string[]; rows: unknown[][] }> {
  const result = await db.query(sql);

  return {
    columns: result.fields.map((f) => f.name),
    rows: result.rows.map((row) => Object.values(row as Record<string, unknown>)),
  };
}
