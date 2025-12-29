import initSqlJs, { type Database } from 'sql.js';
import type { Transaction } from '~/types';

let db: Database | null = null;
let initPromise: Promise<void> | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    month_name TEXT NOT NULL,
    day INTEGER NOT NULL,
    description TEXT NOT NULL,
    amount INTEGER NOT NULL,
    amount_naira REAL NOT NULL,
    is_inflow INTEGER NOT NULL,
    category TEXT NOT NULL,
    bank_source TEXT NOT NULL,
    reference TEXT NOT NULL,
    counterparty TEXT,
    counterparty_bank TEXT,
    transaction_type TEXT,
    narration TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_year_month ON transactions(year, month);
  CREATE INDEX IF NOT EXISTS idx_counterparty ON transactions(counterparty);
  CREATE INDEX IF NOT EXISTS idx_is_inflow ON transactions(is_inflow);
  CREATE INDEX IF NOT EXISTS idx_amount ON transactions(amount);
`;

async function init(): Promise<void> {
  if (db) return;
  
  const SQL = await initSqlJs({
    locateFile: (file: string) => `https://sql.js.org/dist/${file}`
  });
  
  db = new SQL.Database();
  db.run(SCHEMA);
}

export async function initDatabase(): Promise<void> {
  if (!initPromise) {
    initPromise = init();
  }
  return initPromise;
}

export async function loadTransactions(transactions: Transaction[]): Promise<void> {
  await initDatabase();
  if (!db) throw new Error('Database not initialized');
  
  db.run('DELETE FROM transactions');
  
  const stmt = db.prepare(`
    INSERT INTO transactions (
      id, date, year, month, month_name, day, description, amount, amount_naira,
      is_inflow, category, bank_source, reference, counterparty, counterparty_bank,
      transaction_type, narration
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  for (const t of transactions) {
    const date = new Date(t.date);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthName = monthNames[date.getMonth()];
    const day = date.getDate();
    const isInflow = t.amount > 0 ? 1 : 0;
    const amountNaira = Math.abs(t.amount) / 100;
    
    stmt.run([
      t.id,
      t.date,
      year,
      month,
      monthName,
      day,
      t.description,
      t.amount,
      amountNaira,
      isInflow,
      t.category,
      t.bankSource,
      t.reference,
      t.meta?.counterpartyName || null,
      t.meta?.counterpartyBank || null,
      t.meta?.type || null,
      t.meta?.narration || null,
    ]);
  }
  
  stmt.free();
}

export async function executeQuery(sql: string): Promise<{ columns: string[]; rows: unknown[][] }> {
  await initDatabase();
  if (!db) throw new Error('Database not initialized');
  
  const results = db.exec(sql);
  
  if (results.length === 0) {
    return { columns: [], rows: [] };
  }
  
  return {
    columns: results[0].columns,
    rows: results[0].values,
  };
}
