import { PGlite } from '@electric-sql/pglite';
import { live } from '@electric-sql/pglite/live';
import type {
  Account,
  BankType,
  CurrencyCode,
  ImportRecord,
  LedgerTransaction,
  Rule,
  RuleMatchField,
  RuleMatchType,
  RuleSource,
  TransactionType,
  CategorySource,
} from '~/types';
import { hashParts } from '~/lib/utils/hash';
import { SCHEMA, SEED_RULES, SYSTEM_CATEGORIES, TRIGRAM_INDEX } from './schema';
import { assertReadOnlySelect, MAX_MODEL_ROWS } from './readonly-sql';

export type DbInstance = Awaited<ReturnType<typeof createDb>>;

/** Query-only surface, so callers that just read are easy to fake in tests. */
export interface Queryable {
  query: DbInstance['query'];
}

async function createDb() {
  return PGlite.create({
    dataDir: 'idb://wakaru-ledger',
    relaxedDurability: true,
    extensions: { live },
  });
}

let dbInstance: DbInstance | null = null;

export async function initDb(): Promise<DbInstance> {
  if (dbInstance) return dbInstance;

  const db = await createDb();
  await db.exec(SCHEMA);

  // The rules table predates the `source` column; CREATE TABLE IF NOT EXISTS
  // will not add it to an existing database, so migrate in place.
  await db.query(`ALTER TABLE rules ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user'`);

  // Substring search wants a trigram index. pg_trgm is a contrib module and
  // is not in every PGlite build; without it the search still works, just
  // with a sequential scan.
  try {
    await db.exec(TRIGRAM_INDEX);
  } catch {
    // no trigram index available
  }

  await seedReferenceData(db);

  dbInstance = db;
  return db;
}

export function getDb(): DbInstance {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return dbInstance;
}

/** Categories and starter rules. Idempotent, so it is safe on every boot. */
export async function seedReferenceData(db: Queryable): Promise<void> {
  for (const category of SYSTEM_CATEGORIES) {
    await db.query(
      `INSERT INTO categories (id, name, parent_id, is_system)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [category.id, category.name, category.parent ?? null]
    );
  }

  for (const rule of SEED_RULES) {
    await db.query(
      `INSERT INTO rules (id, match_field, match_type, pattern, category_id, priority, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'system')
       ON CONFLICT (id) DO NOTHING`,
      [rule.id, rule.matchField, rule.matchType, rule.pattern, rule.categoryId, rule.priority]
    );
  }
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

interface AccountRow {
  id: string;
  bank: string;
  number_masked: string;
  name: string;
  currency: string;
  opening_balance_minor: string | null;
  created_at: Date;
}

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    bank: row.bank as BankType,
    numberMasked: row.number_masked,
    name: row.name,
    currency: row.currency as CurrencyCode,
    openingBalanceMinor: row.opening_balance_minor === null ? null : Number(row.opening_balance_minor),
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Accounts are identified by (bank, masked number, currency). A statement
 * that does not disclose its account number collapses into the single
 * unnumbered account for that bank and currency, which is the best we can do
 * without asking the user.
 */
export async function findOrCreateAccount(
  db: Queryable,
  input: { bank: BankType; numberMasked?: string; name?: string; currency: CurrencyCode }
): Promise<Account> {
  const numberMasked = input.numberMasked ?? '';
  const id = `acc-${hashParts(input.bank, numberMasked, input.currency)}`;

  await db.query(
    `INSERT INTO accounts (id, bank, number_masked, name, currency)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (bank, number_masked, currency) DO UPDATE
       SET name = CASE WHEN accounts.name = '' THEN EXCLUDED.name ELSE accounts.name END`,
    [id, input.bank, numberMasked, input.name ?? '', input.currency]
  );

  const result = await db.query<AccountRow>('SELECT * FROM accounts WHERE id = $1', [id]);
  return mapAccount(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

interface ImportRow {
  id: string;
  account_id: string;
  file_name: string;
  file_hash: string;
  parser_id: string;
  parser_version: string;
  period_start: Date | null;
  period_end: Date | null;
  rows_seen: number;
  rows_parsed: number;
  reconciled: boolean | null;
  reconcile_breaks: number;
  imported_at: Date;
}

function mapImport(row: ImportRow): ImportRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    fileName: row.file_name,
    fileHash: row.file_hash,
    parserId: row.parser_id,
    parserVersion: row.parser_version,
    periodStart: row.period_start?.toISOString() ?? null,
    periodEnd: row.period_end?.toISOString() ?? null,
    rowsSeen: Number(row.rows_seen),
    rowsParsed: Number(row.rows_parsed),
    reconciled: row.reconciled,
    reconcileBreaks: Number(row.reconcile_breaks),
    importedAt: row.imported_at.toISOString(),
  };
}

export async function findImportByHash(
  db: Queryable,
  accountId: string,
  fileHash: string
): Promise<ImportRecord | null> {
  const result = await db.query<ImportRow>(
    'SELECT * FROM imports WHERE account_id = $1 AND file_hash = $2',
    [accountId, fileHash]
  );
  return result.rows[0] ? mapImport(result.rows[0]) : null;
}

export async function createImport(
  db: Queryable,
  input: {
    id: string;
    accountId: string;
    fileName: string;
    fileHash: string;
    parserId: string;
    parserVersion: string;
    periodStart: string | null;
    periodEnd: string | null;
    rowsSeen: number;
    rowsParsed: number;
  }
): Promise<void> {
  await db.query(
    `INSERT INTO imports (
       id, account_id, file_name, file_hash, parser_id, parser_version,
       period_start, period_end, rows_seen, rows_parsed
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      input.id,
      input.accountId,
      input.fileName,
      input.fileHash,
      input.parserId,
      input.parserVersion,
      input.periodStart,
      input.periodEnd,
      input.rowsSeen,
      input.rowsParsed,
    ]
  );
}

export async function setImportReconciliation(
  db: Queryable,
  importId: string,
  reconciled: boolean | null,
  breaks: number
): Promise<void> {
  await db.query('UPDATE imports SET reconciled = $2, reconcile_breaks = $3 WHERE id = $1', [
    importId,
    reconciled,
    breaks,
  ]);
}

/** Undo a single import. Cascades to its transactions. */
export async function deleteImport(db: Queryable, importId: string): Promise<void> {
  await db.query('DELETE FROM imports WHERE id = $1', [importId]);
  // An account with no statements left is not an account the user has.
  await db.query(
    'DELETE FROM accounts WHERE NOT EXISTS (SELECT 1 FROM imports i WHERE i.account_id = accounts.id)'
  );
}

/** Accounts already on file for a bank, so the UI can flag a currency clash. */
export async function accountCurrenciesForBank(db: Queryable, bank: string): Promise<string[]> {
  const result = await db.query<{ currency: string }>(
    'SELECT DISTINCT currency FROM accounts WHERE bank = $1',
    [bank]
  );
  return result.rows.map((r) => r.currency);
}

// ---------------------------------------------------------------------------
// Counterparties
// ---------------------------------------------------------------------------

/**
 * Collapse the spelling variants banks emit for the same person: case,
 * punctuation, honorifics, and word order all move around between statements.
 * Sorting the tokens makes "ADEBAYO JOHN" and "JOHN ADEBAYO" the same key.
 */
export function normalizeCounterpartyName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/\b(mr|mrs|miss|ms|dr|chief|alhaji|engr|prof)\b\.?/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const tokens = cleaned.split(' ').filter((t) => t.length > 1);
  if (tokens.length === 0) return cleaned;

  return tokens.slice().sort().join(' ');
}

export async function findOrCreateCounterparty(
  db: Queryable,
  input: { name: string; accountNumber?: string; bank?: string; isSelf?: boolean }
): Promise<string | null> {
  const normalized = normalizeCounterpartyName(input.name);
  if (!normalized) return null;

  const id = `cp-${hashParts(normalized)}`;

  await db.query(
    `INSERT INTO counterparties (id, canonical_name, normalized_name, account_number, bank, is_self)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (normalized_name) DO UPDATE
       SET account_number = COALESCE(counterparties.account_number, EXCLUDED.account_number),
           bank           = COALESCE(counterparties.bank, EXCLUDED.bank),
           is_self        = counterparties.is_self OR EXCLUDED.is_self`,
    [id, input.name.trim(), normalized, input.accountNumber ?? null, input.bank ?? null, input.isSelf ?? false]
  );

  const result = await db.query<{ id: string }>(
    'SELECT id FROM counterparties WHERE normalized_name = $1',
    [normalized]
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Mark counterparties that are the user's own accounts elsewhere, which is
 * what lets transfer matching tell "moved my own money" from "spent money".
 */
export async function markSelfCounterparties(db: Queryable): Promise<void> {
  await db.query(`
    UPDATE counterparties SET is_self = TRUE
    WHERE account_number IS NOT NULL
      AND account_number <> ''
      AND bank IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM accounts a
        WHERE a.number_masked <> ''
          AND RIGHT(a.number_masked, 4) = RIGHT(counterparties.account_number, 4)
          -- Four digits alone is a 1-in-10,000 collision per pair, and being
          -- marked self makes the transfer matcher hide the money. Require the
          -- bank to agree as well.
          AND LOWER(counterparties.bank) LIKE '%' || LOWER(a.bank) || '%'
      )
  `);
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export interface LedgerInsert {
  id: string;
  accountId: string;
  importId: string;
  bookedAt: string;
  valueAt: string | null;
  seq: number;
  amountMinor: number;
  currency: CurrencyCode;
  balanceAfterMinor: number | null;
  description: string;
  narration: string | null;
  reference: string;
  counterpartyId: string | null;
  kind: TransactionType;
  categoryId: string | null;
  categorySource: CategorySource | null;
  searchText: string;
}

const INSERT_COLUMNS = 17;

/**
 * @returns how many rows were new. The gap between this and `rows.length` is
 *   how much of the statement we had already seen.
 */
export async function insertTransactions(db: Queryable, rows: LedgerInsert[]): Promise<number> {
  if (rows.length === 0) return 0;

  const CHUNK_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const placeholders: string[] = [];
    const values: unknown[] = [];

    chunk.forEach((row, idx) => {
      const offset = idx * INSERT_COLUMNS;
      placeholders.push(
        `(${Array.from({ length: INSERT_COLUMNS }, (_, n) => `$${offset + n + 1}`).join(', ')})`
      );
      values.push(
        row.id,
        row.accountId,
        row.importId,
        row.bookedAt,
        row.valueAt,
        row.seq,
        row.amountMinor,
        row.currency,
        row.balanceAfterMinor,
        row.description,
        row.narration,
        row.reference,
        row.counterpartyId,
        row.kind,
        row.categoryId,
        row.categorySource,
        row.searchText
      );
    });

    const result = await db.query<{ id: string }>(
      `INSERT INTO transactions (
         id, account_id, import_id, booked_at, value_at, seq, amount_minor, currency,
         balance_after_minor, description, narration, reference, counterparty_id,
         kind, category_id, category_source, search_text
       ) VALUES ${placeholders.join(', ')}
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      values
    );

    inserted += result.rows.length;
  }

  return inserted;
}

export async function clearAllData(db: Queryable): Promise<void> {
  // Cascades from accounts through imports to transactions.
  await db.query('DELETE FROM accounts');
  await db.query('DELETE FROM counterparties');
}

// ---------------------------------------------------------------------------
// Categories and rules
// ---------------------------------------------------------------------------

interface RuleRow {
  id: string;
  match_field: string;
  match_type: string;
  pattern: string;
  category_id: string;
  priority: number;
  source: string;
}

export async function listRules(db: Queryable): Promise<Rule[]> {
  const result = await db.query<RuleRow>('SELECT * FROM rules ORDER BY priority ASC, id ASC');
  return result.rows.map((row) => ({
    id: row.id,
    matchField: row.match_field as RuleMatchField,
    matchType: row.match_type as RuleMatchType,
    pattern: row.pattern,
    categoryId: row.category_id,
    priority: Number(row.priority),
    source: row.source as RuleSource | undefined,
  }));
}

export async function createRule(db: Queryable, rule: Omit<Rule, 'id'>): Promise<string> {
  const id = `rule-user-${hashParts(rule.matchField, rule.matchType, rule.pattern, rule.categoryId)}`;
  await db.query(
    `INSERT INTO rules (id, match_field, match_type, pattern, category_id, priority, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET category_id = EXCLUDED.category_id`,
    [id, rule.matchField, rule.matchType, rule.pattern, rule.categoryId, rule.priority, rule.source ?? 'user']
  );
  return id;
}

export async function deleteRule(db: Queryable, ruleId: string): Promise<void> {
  await db.query('DELETE FROM rules WHERE id = $1', [ruleId]);
}

export async function listCategories(db: Queryable): Promise<{ id: string; name: string }[]> {
  const result = await db.query<{ id: string; name: string }>('SELECT id, name FROM categories');
  return result.rows;
}

/**
 * A user's categorisation wins over anything a rule or parser decided, and is
 * never overwritten by a later re-run of the rules engine.
 */
export async function setTransactionCategory(
  db: Queryable,
  transactionId: string,
  categoryId: string | null
): Promise<void> {
  await db.query(
    `UPDATE transactions SET category_id = $2, category_source = $3 WHERE id = $1`,
    [transactionId, categoryId, categoryId === null ? null : 'user']
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSetting<T>(db: Queryable, key: string): Promise<T | undefined> {
  const result = await db.query<{ value: T }>('SELECT value FROM settings WHERE key = $1', [key]);
  return result.rows[0]?.value;
}

export async function setSetting<T>(db: Queryable, key: string, value: T): Promise<void> {
  await db.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2`,
    [key, JSON.stringify(value)]
  );
}

// ---------------------------------------------------------------------------
// Model-authored queries
// ---------------------------------------------------------------------------

export interface QueryOutput {
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
}

/**
 * Run a query written by the chat model. Validated statically, then run
 * inside a read-only transaction so a gap in the validator still cannot
 * write. Both layers are load-bearing.
 */
export async function executeModelQuery(
  db: Queryable & { transaction?: DbInstance['transaction'] },
  sql: string
): Promise<QueryOutput> {
  const safe = assertReadOnlySelect(sql);

  const run = async (q: Queryable) => {
    const result = await q.query(safe);
    return {
      columns: result.fields.map((f) => f.name),
      allRows: result.rows.map((row) => Object.values(row as Record<string, unknown>)),
    };
  };

  const { columns, allRows } = db.transaction
    ? await db.transaction(async (tx) => {
        await tx.query('SET TRANSACTION READ ONLY');
        return run(tx as unknown as Queryable);
      })
    : await run(db);

  return {
    columns,
    rows: allRows.slice(0, MAX_MODEL_ROWS),
    truncated: allRows.length > MAX_MODEL_ROWS,
  };
}

export type { LedgerTransaction };
export { assertReadOnlySelect, UnsafeSqlError } from './readonly-sql';
