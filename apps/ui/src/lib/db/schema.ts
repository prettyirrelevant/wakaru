/**
 * Ledger schema.
 *
 * Money lives in an `account`. Every row is traceable to the `import` that
 * produced it. Amounts are signed minor units (kobo for NGN) in BIGINT, and
 * the currency is explicit rather than assumed.
 *
 * Direction is `sign(amount_minor)` and deliberately has no column of its own.
 */
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS accounts (
    id                    TEXT PRIMARY KEY,
    bank                  TEXT NOT NULL,
    number_masked         TEXT NOT NULL DEFAULT '',
    name                  TEXT NOT NULL DEFAULT '',
    currency              TEXT NOT NULL DEFAULT 'NGN',
    opening_balance_minor BIGINT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (bank, number_masked, currency)
  );

  CREATE TABLE IF NOT EXISTS imports (
    id               TEXT PRIMARY KEY,
    account_id       TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    file_name        TEXT NOT NULL,
    file_hash        TEXT NOT NULL,
    parser_id        TEXT NOT NULL,
    parser_version   TEXT NOT NULL,
    period_start     TIMESTAMPTZ,
    period_end       TIMESTAMPTZ,
    rows_seen        INTEGER NOT NULL DEFAULT 0,
    rows_parsed      INTEGER NOT NULL DEFAULT 0,
    reconciled       BOOLEAN,
    reconcile_breaks INTEGER NOT NULL DEFAULT 0,
    imported_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (account_id, file_hash)
  );

  CREATE TABLE IF NOT EXISTS counterparties (
    id              TEXT PRIMARY KEY,
    canonical_name  TEXT NOT NULL,
    normalized_name TEXT NOT NULL UNIQUE,
    account_number  TEXT,
    bank            TEXT,
    is_self         BOOLEAN NOT NULL DEFAULT FALSE
  );

  CREATE TABLE IF NOT EXISTS categories (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    parent_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
    is_system BOOLEAN NOT NULL DEFAULT TRUE
  );

  CREATE TABLE IF NOT EXISTS rules (
    id          TEXT PRIMARY KEY,
    match_field TEXT NOT NULL,
    match_type  TEXT NOT NULL,
    pattern     TEXT NOT NULL,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    priority    INTEGER NOT NULL DEFAULT 100,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id                    TEXT PRIMARY KEY,
    account_id            TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    import_id             TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    booked_at             TIMESTAMPTZ NOT NULL,
    value_at              TIMESTAMPTZ,
    seq                   INTEGER NOT NULL,
    amount_minor          BIGINT NOT NULL,
    currency              TEXT NOT NULL,
    balance_after_minor   BIGINT,
    description           TEXT NOT NULL,
    narration             TEXT,
    reference             TEXT NOT NULL,
    counterparty_id       TEXT REFERENCES counterparties(id) ON DELETE SET NULL,
    kind                  TEXT NOT NULL DEFAULT 'other',
    category_id           TEXT REFERENCES categories(id) ON DELETE SET NULL,
    category_source       TEXT,
    parent_transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
    transfer_group_id     TEXT,
    search_text           TEXT NOT NULL DEFAULT '',
    UNIQUE (account_id, import_id, seq)
  );

  CREATE INDEX IF NOT EXISTS idx_tx_account_time
    ON transactions(account_id, booked_at DESC, seq DESC);
  CREATE INDEX IF NOT EXISTS idx_tx_booked_at      ON transactions(booked_at DESC);
  CREATE INDEX IF NOT EXISTS idx_tx_counterparty   ON transactions(counterparty_id);
  CREATE INDEX IF NOT EXISTS idx_tx_category       ON transactions(category_id);
  CREATE INDEX IF NOT EXISTS idx_tx_kind           ON transactions(kind);
  CREATE INDEX IF NOT EXISTS idx_tx_import         ON transactions(import_id);
  CREATE INDEX IF NOT EXISTS idx_tx_abs_amount     ON transactions(ABS(amount_minor));
  CREATE INDEX IF NOT EXISTS idx_tx_parent         ON transactions(parent_transaction_id)
    WHERE parent_transaction_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_tx_transfer_group ON transactions(transfer_group_id)
    WHERE transfer_group_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value JSONB NOT NULL
  );
`;

/**
 * Substring search over `search_text` uses a leading wildcard, which no btree
 * can serve. pg_trgm gives us a GIN index that can; it ships as a contrib
 * module that may not be present in every PGlite build, so treat it as an
 * optimisation and fall back to a sequential scan when it is missing.
 */
export const TRIGRAM_INDEX = `
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS idx_tx_search_trgm
    ON transactions USING GIN (search_text gin_trgm_ops);
`;

/** Seeded on first run. Ids are stable so rules can reference them. */
export const SYSTEM_CATEGORIES: { id: string; name: string; parent?: string }[] = [
  { id: 'cat-income', name: 'Income' },
  { id: 'cat-income-salary', name: 'Salary', parent: 'cat-income' },
  { id: 'cat-income-transfer', name: 'Transfers in', parent: 'cat-income' },
  { id: 'cat-income-refund', name: 'Refunds', parent: 'cat-income' },

  { id: 'cat-food', name: 'Food & drink' },
  { id: 'cat-food-groceries', name: 'Groceries', parent: 'cat-food' },
  { id: 'cat-food-eating-out', name: 'Eating out', parent: 'cat-food' },

  { id: 'cat-transport', name: 'Transport' },
  { id: 'cat-transport-ride', name: 'Ride hailing', parent: 'cat-transport' },
  { id: 'cat-transport-fuel', name: 'Fuel', parent: 'cat-transport' },

  { id: 'cat-bills', name: 'Bills & utilities' },
  { id: 'cat-bills-power', name: 'Electricity', parent: 'cat-bills' },
  { id: 'cat-bills-data', name: 'Airtime & data', parent: 'cat-bills' },
  { id: 'cat-bills-tv', name: 'TV & streaming', parent: 'cat-bills' },

  { id: 'cat-shopping', name: 'Shopping' },
  { id: 'cat-health', name: 'Health' },
  { id: 'cat-entertainment', name: 'Entertainment' },
  { id: 'cat-fees', name: 'Bank charges' },
  { id: 'cat-cash', name: 'Cash' },
  { id: 'cat-transfer-out', name: 'Transfers out' },
  { id: 'cat-internal', name: 'Internal transfer' },
  { id: 'cat-uncategorized', name: 'Uncategorized' },
];

/**
 * Seed rules. Deliberately conservative — a wrong category is worse than none,
 * because the user has to notice it to correct it.
 */
export const SEED_RULES: {
  id: string;
  matchField: 'description' | 'counterparty' | 'kind';
  matchType: 'contains' | 'equals';
  pattern: string;
  categoryId: string;
  priority: number;
}[] = [
  { id: 'rule-kind-fee', matchField: 'kind', matchType: 'equals', pattern: 'bank_charge', categoryId: 'cat-fees', priority: 10 },
  { id: 'rule-kind-atm', matchField: 'kind', matchType: 'equals', pattern: 'atm_withdrawal', categoryId: 'cat-cash', priority: 10 },
  { id: 'rule-kind-airtime', matchField: 'kind', matchType: 'equals', pattern: 'airtime', categoryId: 'cat-bills-data', priority: 10 },

  { id: 'rule-uber', matchField: 'description', matchType: 'contains', pattern: 'uber', categoryId: 'cat-transport-ride', priority: 50 },
  { id: 'rule-bolt', matchField: 'description', matchType: 'contains', pattern: 'bolt', categoryId: 'cat-transport-ride', priority: 50 },
  { id: 'rule-netflix', matchField: 'description', matchType: 'contains', pattern: 'netflix', categoryId: 'cat-bills-tv', priority: 50 },
  { id: 'rule-spotify', matchField: 'description', matchType: 'contains', pattern: 'spotify', categoryId: 'cat-entertainment', priority: 50 },
  { id: 'rule-dstv', matchField: 'description', matchType: 'contains', pattern: 'dstv', categoryId: 'cat-bills-tv', priority: 50 },
  { id: 'rule-gotv', matchField: 'description', matchType: 'contains', pattern: 'gotv', categoryId: 'cat-bills-tv', priority: 50 },
  { id: 'rule-ikedc', matchField: 'description', matchType: 'contains', pattern: 'ikedc', categoryId: 'cat-bills-power', priority: 50 },
  { id: 'rule-ekedc', matchField: 'description', matchType: 'contains', pattern: 'ekedc', categoryId: 'cat-bills-power', priority: 50 },
  { id: 'rule-salary', matchField: 'description', matchType: 'contains', pattern: 'salary', categoryId: 'cat-income-salary', priority: 40 },
  { id: 'rule-jumia', matchField: 'description', matchType: 'contains', pattern: 'jumia', categoryId: 'cat-shopping', priority: 50 },
  { id: 'rule-shoprite', matchField: 'description', matchType: 'contains', pattern: 'shoprite', categoryId: 'cat-food-groceries', priority: 50 },
  { id: 'rule-chicken-republic', matchField: 'description', matchType: 'contains', pattern: 'chicken republic', categoryId: 'cat-food-eating-out', priority: 50 },
];
