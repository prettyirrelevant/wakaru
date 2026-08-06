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
    source      TEXT NOT NULL DEFAULT 'user',
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

export interface SeedRule {
  id: string;
  matchField: 'description' | 'counterparty' | 'kind' | 'any';
  matchType: 'contains' | 'equals';
  pattern: string;
  categoryId: string;
  priority: number;
}

/**
 * Seed rules. Deliberately conservative — a wrong category is worse than none,
 * because the user has to notice it to correct it.
 *
 * Merchant names match on `any` (description or counterparty): the same
 * purchase reads "POS/WEB PURCHASE ... SHOPRITE" in one statement and carries
 * "SHOPRITE LEKKI" as a counterparty in another. Kinds are the only exact
 * matches. Substrings that collide with ordinary words (glo, mtn, mrs, hm)
 * are excluded on purpose.
 */
function merchant(id: string, pattern: string, categoryId: string, priority = 50): SeedRule {
  return { id, matchField: 'any', matchType: 'contains', pattern, categoryId, priority };
}

export const SEED_RULES: SeedRule[] = [
  { id: 'rule-kind-fee', matchField: 'kind', matchType: 'equals', pattern: 'bank_charge', categoryId: 'cat-fees', priority: 10 },
  { id: 'rule-kind-atm', matchField: 'kind', matchType: 'equals', pattern: 'atm_withdrawal', categoryId: 'cat-cash', priority: 10 },
  { id: 'rule-kind-airtime', matchField: 'kind', matchType: 'equals', pattern: 'airtime', categoryId: 'cat-bills-data', priority: 10 },
  { id: 'rule-kind-reversal', matchField: 'kind', matchType: 'equals', pattern: 'reversal', categoryId: 'cat-income-refund', priority: 10 },

  merchant('rule-salary', 'salary', 'cat-income-salary', 30),
  merchant('rule-wages', 'wages', 'cat-income-salary', 30),
  merchant('rule-payroll', 'payroll', 'cat-income-salary', 30),
  merchant('rule-refund', 'refund', 'cat-income-refund', 40),

  merchant('rule-uber', 'uber', 'cat-transport-ride'),
  merchant('rule-bolt', 'bolt', 'cat-transport-ride'),
  merchant('rule-indriver', 'indriver', 'cat-transport-ride'),
  merchant('rule-gokada', 'gokada', 'cat-transport-ride'),

  merchant('rule-nnpc', 'nnpc', 'cat-transport-fuel'),
  merchant('rule-oando', 'oando', 'cat-transport-fuel'),
  merchant('rule-conoil', 'conoil', 'cat-transport-fuel'),

  merchant('rule-shoprite', 'shoprite', 'cat-food-groceries'),
  merchant('rule-spar', 'spar', 'cat-food-groceries'),
  merchant('rule-justrite', 'justrite', 'cat-food-groceries'),
  merchant('rule-hubmart', 'hubmart', 'cat-food-groceries'),
  merchant('rule-prince-ebeano', 'prince ebeano', 'cat-food-groceries'),

  merchant('rule-chicken-republic', 'chicken republic', 'cat-food-eating-out'),
  merchant('rule-kfc', 'kfc', 'cat-food-eating-out'),
  merchant('rule-dominos', 'dominos', 'cat-food-eating-out'),
  merchant('rule-pizza-hut', 'pizza hut', 'cat-food-eating-out'),
  merchant('rule-mr-biggs', "mr bigg's", 'cat-food-eating-out'),
  merchant('rule-tantalizers', 'tantalizers', 'cat-food-eating-out'),
  merchant('rule-sweet-sensation', 'sweet sensation', 'cat-food-eating-out'),
  merchant('rule-cold-stone', 'cold stone', 'cat-food-eating-out'),
  merchant('rule-burger-king', 'burger king', 'cat-food-eating-out'),

  merchant('rule-ikedc', 'ikedc', 'cat-bills-power'),
  merchant('rule-ekedc', 'ekedc', 'cat-bills-power'),
  merchant('rule-aedc', 'aedc', 'cat-bills-power'),
  merchant('rule-ibedc', 'ibedc', 'cat-bills-power'),
  merchant('rule-phedc', 'phedc', 'cat-bills-power'),
  merchant('rule-eedc', 'eedc', 'cat-bills-power'),
  merchant('rule-bedc', 'bedc', 'cat-bills-power'),
  merchant('rule-kaedco', 'kaedco', 'cat-bills-power'),
  merchant('rule-kedco', 'kedco', 'cat-bills-power'),
  merchant('rule-yedc', 'yedc', 'cat-bills-power'),

  merchant('rule-dstv', 'dstv', 'cat-bills-tv'),
  merchant('rule-gotv', 'gotv', 'cat-bills-tv'),
  merchant('rule-startimes', 'startimes', 'cat-bills-tv'),
  merchant('rule-showmax', 'showmax', 'cat-bills-tv'),
  merchant('rule-netflix', 'netflix', 'cat-bills-tv'),
  merchant('rule-amazon-prime', 'amazon prime', 'cat-bills-tv', 45),
  merchant('rule-youtube', 'youtube', 'cat-bills-tv'),

  merchant('rule-spotify', 'spotify', 'cat-entertainment'),
  merchant('rule-deezer', 'deezer', 'cat-entertainment'),
  merchant('rule-boomplay', 'boomplay', 'cat-entertainment'),

  merchant('rule-jumia', 'jumia', 'cat-shopping'),
  merchant('rule-konga', 'konga', 'cat-shopping'),
  merchant('rule-amazon', 'amazon', 'cat-shopping'),
  merchant('rule-shein', 'shein', 'cat-shopping'),
  merchant('rule-temu', 'temu', 'cat-shopping'),
  merchant('rule-aliexpress', 'aliexpress', 'cat-shopping'),
  merchant('rule-adidas', 'adidas', 'cat-shopping'),
  merchant('rule-nike', 'nike', 'cat-shopping'),
  merchant('rule-zara', 'zara', 'cat-shopping'),

  merchant('rule-healthplus', 'healthplus', 'cat-health'),
  merchant('rule-medplus', 'medplus', 'cat-health'),
  merchant('rule-famasi', 'famasi', 'cat-health'),
  merchant('rule-alpha-pharmacy', 'alpha pharmacy', 'cat-health'),
  merchant('rule-lagoon-hospital', 'lagoon hospital', 'cat-health'),
  merchant('rule-avon-hmo', 'avon hmo', 'cat-health'),
  merchant('rule-hygeia', 'hygeia', 'cat-health'),
];
