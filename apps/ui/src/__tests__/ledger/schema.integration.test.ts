// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { SCHEMA } from '~/lib/db/schema';
import {
  findOrCreateAccount,
  findOrCreateCounterparty,
  deleteImport,
  insertTransactions,
  listRules,
  markSelfCounterparties,
  seedReferenceData,
  executeModelQuery,
  type LedgerInsert,
  type Queryable,
} from '~/lib/db';
import { ingestParsedStatement } from '~/lib/ledger/ingest';
import { linkInternalTransfers } from '~/lib/ledger/transfers';
import {
  categorySpendQuery,
  dailyBalanceQuery,
  internalTransferQuery,
  monthlyFlowQuery,
  recurringQuery,
  summaryQuery,
  topCounterpartiesQuery,
  transactionCountQuery,
  transactionPageQuery,
} from '~/lib/queries/analytics';
import { emptyFilterState, type FilterState } from '~/lib/filters';
import {
  BankType,
  TransactionCategory,
  TransactionType,
  type ParseOutput,
  type ParsedTransaction,
} from '~/types';

/**
 * Runs the real schema and the real queries against a real Postgres.
 *
 * Everything else in the suite tests pure functions; this is the only place
 * the hand-written SQL actually executes, so it is what catches a typo in a
 * column name or a clause that only Postgres will reject.
 */
describe('ledger schema (integration)', () => {
  let db: Queryable & { query: PGlite['query'] };

  beforeEach(async () => {
    const pg = new PGlite();
    await pg.exec(SCHEMA);
    db = pg as unknown as typeof db;
    await seedReferenceData(db);
  });

  it('creates the schema and seeds reference data', async () => {
    const categories = await db.query<{ count: string }>('SELECT COUNT(*) AS count FROM categories');
    expect(Number(categories.rows[0].count)).toBeGreaterThan(10);

    const rules = await listRules(db);
    expect(rules.length).toBeGreaterThan(5);
    // Rules must come back in evaluation order.
    expect(rules[0].priority).toBeLessThanOrEqual(rules[rules.length - 1].priority);
  });

  it('stores an amount that would have overflowed the old INTEGER column', async () => {
    const account = await findOrCreateAccount(db, {
      bank: BankType.GTB,
      currency: 'NGN',
      numberMasked: '****1234',
    });

    await db.query(
      `INSERT INTO imports (id, account_id, file_name, file_hash, parser_id, parser_version)
       VALUES ('imp-1', $1, 'x.pdf', 'hash', 'gtb', '2')`,
      [account.id]
    );

    // ₦21,474,836.47 was the old ceiling. This is an order of magnitude past it.
    const huge = 25_000_000_000;

    await insertTransactions(db, [
      makeRow({ id: 'tx-big', accountId: account.id, amountMinor: huge, balanceAfterMinor: huge }),
    ]);

    const result = await db.query<{ amount_minor: string }>(
      'SELECT amount_minor FROM transactions WHERE id = $1',
      ['tx-big']
    );
    expect(Number(result.rows[0].amount_minor)).toBe(huge);
  });

  it('treats two identical same-day transactions as two transactions', async () => {
    const summary = await ingest(db, [
      parsed('2025-01-10', -50_000, 'Transfer to John', 950_000),
      parsed('2025-01-10', -50_000, 'Transfer to John', 900_000),
    ]);

    expect(summary.inserted).toBe(2);
  });

  it('is idempotent when the same file is imported twice', async () => {
    const rows = [parsed('2025-01-10', -50_000, 'Transfer', 950_000)];

    const first = await ingest(db, rows, 'hash-a');
    const second = await ingest(db, rows, 'hash-a');

    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(1);
  });

  it('records a reconciliation verdict from the statement balance', async () => {
    const clean = await ingest(
      db,
      [
        parsed('2025-01-01', -1_000, 'a', 99_000),
        parsed('2025-01-02', -2_000, 'b', 97_000),
        parsed('2025-01-03', -3_000, 'c', 94_000),
      ],
      'hash-clean'
    );
    expect(clean.reconcile.ok).toBe(true);

    const broken = await ingest(
      db,
      [
        parsed('2025-02-01', -1_000, 'a', 99_000),
        parsed('2025-02-02', -2_000, 'b', 50_000),
        parsed('2025-02-03', -3_000, 'c', 47_000),
      ],
      'hash-broken'
    );
    expect(broken.reconcile.ok).toBe(false);
    expect(broken.reconcile.breaks).toHaveLength(1);
  });

  it('attaches a levy to the transfer that caused it', async () => {
    await ingest(
      db,
      [
        parsed('2025-01-10', -5_000_000, 'NIP TRANSFER TO OPAY', 5_000_000, TransactionType.Transfer),
        parsed('2025-01-10', -5_000, 'EMT LEVY', 4_995_000, TransactionType.BankCharge),
      ],
      'hash-fees'
    );

    const result = await db.query<{ description: string; parent_transaction_id: string | null }>(
      'SELECT description, parent_transaction_id FROM transactions ORDER BY seq'
    );

    const levy = result.rows.find((r) => r.description === 'EMT LEVY');
    expect(levy?.parent_transaction_id).not.toBeNull();
  });

  it('links both legs of a transfer between the user’s own accounts', async () => {
    const gtb = await findOrCreateAccount(db, {
      bank: BankType.GTB,
      currency: 'NGN',
      numberMasked: '****1111',
    });
    const kuda = await findOrCreateAccount(db, {
      bank: BankType.Kuda,
      currency: 'NGN',
      numberMasked: '****2222',
    });

    await db.query(
      `INSERT INTO imports (id, account_id, file_name, file_hash, parser_id, parser_version)
       VALUES ('imp-gtb', $1, 'a.pdf', 'h1', 'gtb', '2'), ('imp-kuda', $2, 'b.xlsx', 'h2', 'kuda', '2')`,
      [gtb.id, kuda.id]
    );

    // Each statement names the other bank as the counterparty, which is the
    // corroboration the matcher requires before it will link a pair.
    const outCp = await findOrCreateCounterparty(db, { name: 'ADEBAYO JOHN', bank: 'Kuda' });
    const inCp = await findOrCreateCounterparty(db, { name: 'JOHN ADEBAYO', bank: 'GTB' });

    await insertTransactions(db, [
      makeRow({
        id: 'tx-out',
        accountId: gtb.id,
        importId: 'imp-gtb',
        amountMinor: -10_000_000,
        counterpartyId: outCp,
      }),
      makeRow({
        id: 'tx-in',
        accountId: kuda.id,
        importId: 'imp-kuda',
        amountMinor: 10_000_000,
        counterpartyId: inCp,
      }),
    ]);

    await markSelfCounterparties(db);
    const linked = await linkInternalTransfers(db);
    expect(linked).toBe(1);

    const result = await db.query<{ id: string; transfer_group_id: string | null }>(
      'SELECT id, transfer_group_id FROM transactions ORDER BY id'
    );
    const groups = result.rows.map((r) => r.transfer_group_id);
    expect(groups[0]).not.toBeNull();
    expect(groups[0]).toBe(groups[1]);
  });

  it('does not link two unrelated payments that share an amount', async () => {
    const gtb = await findOrCreateAccount(db, {
      bank: BankType.GTB,
      currency: 'NGN',
      numberMasked: '****1111',
    });
    const kuda = await findOrCreateAccount(db, {
      bank: BankType.Kuda,
      currency: 'NGN',
      numberMasked: '****2222',
    });

    await db.query(
      `INSERT INTO imports (id, account_id, file_name, file_hash, parser_id, parser_version)
       VALUES ('imp-gtb', $1, 'a.pdf', 'h1', 'gtb', '2'), ('imp-kuda', $2, 'b.xlsx', 'h2', 'kuda', '2')`,
      [gtb.id, kuda.id]
    );

    await insertTransactions(db, [
      makeRow({ id: 'tx-out', accountId: gtb.id, importId: 'imp-gtb', amountMinor: -10_000_000 }),
      makeRow({ id: 'tx-in', accountId: kuda.id, importId: 'imp-kuda', amountMinor: 10_000_000 }),
    ]);

    expect(await linkInternalTransfers(db)).toBe(0);
  });

  it('runs every analytics query against the real schema', async () => {
    await ingest(
      db,
      [
        parsed('2025-01-10', -5_000_000, 'UBER TRIP', 5_000_000, TransactionType.CardPayment),
        parsed('2025-02-10', -5_100_000, 'UBER TRIP', 4_000_000, TransactionType.CardPayment),
        parsed('2025-03-10', -5_050_000, 'UBER TRIP', 3_000_000, TransactionType.CardPayment),
        parsed('2025-03-11', 20_000_000, 'SALARY', 23_000_000, TransactionType.Transfer),
      ],
      'hash-analytics'
    );

    const filters: FilterState = { ...emptyFilterState, currency: 'NGN' as const };
    const queries = [
      summaryQuery(filters, ''),
      internalTransferQuery(filters, ''),
      monthlyFlowQuery(filters, ''),
      categorySpendQuery(filters, ''),
      topCounterpartiesQuery(filters, '', 'out'),
      topCounterpartiesQuery(filters, '', 'in'),
      dailyBalanceQuery(filters),
      recurringQuery(filters, ''),
      transactionCountQuery(filters, ''),
      transactionPageQuery(filters, '', {
        sortField: 'date',
        sortOrder: 'desc',
        limit: 25,
        offset: 0,
      }),
      transactionPageQuery(filters, 'uber', {
        sortField: 'amount',
        sortOrder: 'asc',
        limit: 25,
        offset: 0,
      }),
    ];

    for (const query of queries) {
      await expect(db.query(query.sql, query.params)).resolves.toBeDefined();
    }
  });

  it('reports the right headline figures', async () => {
    await ingest(
      db,
      [
        parsed('2025-01-10', -5_000_000, 'RENT', 5_000_000),
        parsed('2025-01-11', -5_000, 'EMT LEVY', 4_995_000, TransactionType.BankCharge),
        parsed('2025-01-12', 20_000_000, 'SALARY', 24_995_000),
      ],
      'hash-summary'
    );

    const q = summaryQuery({ ...emptyFilterState, currency: 'NGN' as const }, '');
    const result = await db.query<{
      inflow: string;
      outflow: string;
      fees: string;
      count: string;
    }>(q.sql, q.params);

    expect(Number(result.rows[0].inflow)).toBe(20_000_000);
    expect(Number(result.rows[0].outflow)).toBe(5_005_000);
    expect(Number(result.rows[0].fees)).toBe(5_000);
    expect(Number(result.rows[0].count)).toBe(3);
  });

  it('includes transactions booked on the end date of a range', async () => {
    await ingest(
      db,
      [
        parsed('2025-01-15', -1_000, 'on the boundary', 99_000),
        parsed('2025-01-16', -1_000, 'past the boundary', 98_000),
      ],
      'hash-dates'
    );

    const q = transactionCountQuery(
      { ...emptyFilterState, currency: 'NGN', dateFrom: '2025-01-01', dateTo: '2025-01-15' },
      ''
    );
    const result = await db.query<{ count: string }>(q.sql, q.params);

    expect(Number(result.rows[0].count)).toBe(1);
  });

  it('keeps the balance series out of reach of category and amount filters', async () => {
    await ingest(
      db,
      [
        parsed('2025-01-01', -1_000, 'RENT', 99_000),
        parsed('2025-01-02', -500_000, 'BIG SPEND', 98_500),
        parsed('2025-01-03', -2_000, 'SNACKS', 96_500),
      ],
      'hash-balance'
    );

    const scoped: FilterState = {
      ...emptyFilterState,
      currency: 'NGN' as const,
      // A narrow amount filter must not change what the account was worth.
      amountMin: 1_000_000,
      categories: ['cat-food'],
      flow: 'out',
    };

    const q = dailyBalanceQuery(scoped);
    const result = await db.query<{ day: Date; closing: string }>(q.sql, q.params);

    // All three days still report, and the last balance is the real one.
    expect(result.rows).toHaveLength(3);
    expect(Number(result.rows[2].closing)).toBe(96_500);
  });

  it('reports fees even when the list is set to roll them up', async () => {
    await ingest(
      db,
      [
        parsed('2025-01-10', -5_000_000, 'TRANSFER', 5_000_000, TransactionType.Transfer),
        parsed('2025-01-10', -5_000, 'EMT LEVY', 4_995_000, TransactionType.BankCharge),
      ],
      'hash-fees-toggle'
    );

    const rolled: FilterState = {
      ...emptyFilterState,
      currency: 'NGN' as const,
      hideChildFees: true,
    };

    const summary = summaryQuery(rolled, '');
    const summaryRows = await db.query<{ fees: string; outflow: string }>(
      summary.sql,
      summary.params
    );
    expect(Number(summaryRows.rows[0].fees)).toBe(5_000);
    expect(Number(summaryRows.rows[0].outflow)).toBe(5_005_000);

    // The list, however, does hide the linked fee row.
    const count = transactionCountQuery(rolled, '');
    const countRows = await db.query<{ count: string }>(count.sql, count.params);
    expect(Number(countRows.rows[0].count)).toBe(1);
  });

  it('does not call a counterparty self on four matching digits alone', async () => {
    await findOrCreateAccount(db, {
      bank: BankType.GTB,
      currency: 'NGN',
      numberMasked: '****1234',
    });

    // Same last four, different bank — a stranger, not the user.
    await findOrCreateCounterparty(db, {
      name: 'STRANGER',
      accountNumber: '9999991234',
      bank: 'Zenith Bank',
    });
    await findOrCreateCounterparty(db, {
      name: 'MY OTHER SELF',
      accountNumber: '0000001234',
      bank: 'GTB',
    });

    await markSelfCounterparties(db);

    const result = await db.query<{ canonical_name: string; is_self: boolean }>(
      'SELECT canonical_name, is_self FROM counterparties ORDER BY canonical_name'
    );
    const byName = Object.fromEntries(result.rows.map((r) => [r.canonical_name, r.is_self]));

    expect(byName['STRANGER']).toBe(false);
    expect(byName['MY OTHER SELF']).toBe(true);
  });

  it('removes an account once its last statement is deleted', async () => {
    const summary = await ingest(db, [parsed('2025-01-10', -1_000, 'a', 99_000)], 'hash-orphan');

    await deleteImport(db, summary.importId);

    const accounts = await db.query<{ count: string }>('SELECT COUNT(*) AS count FROM accounts');
    expect(Number(accounts.rows[0].count)).toBe(0);
  });

  it('refuses a destructive query from the chat model', async () => {
    await expect(executeModelQuery(db, 'DELETE FROM transactions')).rejects.toThrow();

    const output = await executeModelQuery(db, 'SELECT 1 AS n');
    expect(output.columns).toEqual(['n']);
    expect(output.rows).toEqual([[1]]);
  });
});

// ---------------------------------------------------------------------------

function parsed(
  day: string,
  amount: number,
  description: string,
  balanceAfter: number | null,
  type: TransactionType = TransactionType.Transfer
): ParsedTransaction {
  return {
    id: `${day}-${amount}-${description}`,
    date: `${day}T00:00:00.000Z`,
    createdAt: 0,
    description,
    amount,
    category: amount > 0 ? TransactionCategory.Inflow : TransactionCategory.Outflow,
    bankSource: BankType.GTB,
    reference: `REF-${description}`,
    meta: { type, balanceAfter: balanceAfter ?? undefined },
  };
}

function ingest(db: Queryable, transactions: ParsedTransaction[], fileHash = 'hash-default') {
  const output: ParseOutput = { transactions, rowsSeen: transactions.length, failures: [] };

  return ingestParsedStatement(db, {
    parsed: output,
    fileName: 'statement.pdf',
    fileHash,
    bank: BankType.GTB,
    currency: 'NGN',
    parserVersion: '2',
    accountNumber: '0123456789',
  });
}

function makeRow(overrides: Partial<LedgerInsert> & Pick<LedgerInsert, 'id' | 'accountId'>): LedgerInsert {
  return {
    importId: 'imp-1',
    bookedAt: '2025-01-10T00:00:00.000Z',
    valueAt: null,
    seq: Math.floor(Math.random() * 100000),
    amountMinor: -1000,
    currency: 'NGN',
    balanceAfterMinor: null,
    description: 'test',
    narration: null,
    reference: 'REF',
    counterpartyId: null,
    kind: TransactionType.Transfer,
    categoryId: null,
    categorySource: null,
    searchText: 'test',
    ...overrides,
  };
}
