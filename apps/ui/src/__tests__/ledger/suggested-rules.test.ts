// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { SCHEMA } from '~/lib/db/schema';
import {
  findOrCreateAccount,
  findOrCreateCounterparty,
  insertTransactions,
  seedReferenceData,
  type LedgerInsert,
  type Queryable,
} from '~/lib/db';
import {
  applyRulesToUncategorized,
  approveSuggestedRule,
  collectUncategorizedCounterparties,
  persistSuggestedRules,
  rejectSuggestedRule,
  runSuggestionPass,
} from '~/lib/ledger/suggested-rules';
import { BankType, TransactionType, type ChatMode, type Rule } from '~/types';

describe('suggested rules', () => {
  let db: Queryable & { query: PGlite['query'] };
  let accountId: string;

  beforeEach(async () => {
    const pg = new PGlite();
    await pg.exec(SCHEMA);
    db = pg as unknown as typeof db;
    await seedReferenceData(db);

    const account = await findOrCreateAccount(db, {
      bank: BankType.GTB,
      currency: 'NGN',
      numberMasked: '****1234',
    });
    accountId = account.id;

    await db.query(
      `INSERT INTO imports (id, account_id, file_name, file_hash, parser_id, parser_version)
       VALUES ('imp-1', $1, 's.pdf', 'h', 'gtb', '2')`,
      [accountId]
    );
  });

  async function txWithCounterparty(
    counterparty: string,
    overrides: Partial<LedgerInsert> = {}
  ): Promise<LedgerInsert> {
    const cpId = await findOrCreateCounterparty(db, { name: counterparty });
    return makeRow({
      id: `tx-${counterparty.replace(/\s+/g, '-').toLowerCase()}`,
      accountId,
      counterpartyId: cpId,
      ...overrides,
    });
  }

  it('collects distinct uncategorised counterparties with their direction', async () => {
    await insertTransactions(db, [
      await txWithCounterparty('ADEBAYO JOHN', { amountMinor: -50_000, id: 'tx-a' }),
      await txWithCounterparty('ADEBAYO JOHN', { amountMinor: -10_000, id: 'tx-b' }),
      await txWithCounterparty('BOLA TINUBU', { amountMinor: 500_000, id: 'tx-c' }),
    ]);

    const names = await collectUncategorizedCounterparties(db);
    expect(names).toEqual([
      { name: 'ADEBAYO JOHN', direction: 'out' },
      { name: 'BOLA TINUBU', direction: 'in' },
    ]);
  });

  it('skips rows already categorised, internal transfers and own accounts', async () => {
    const selfCp = await findOrCreateCounterparty(db, { name: 'MY OTHER SELF', isSelf: true });
    const transferCp = await findOrCreateCounterparty(db, { name: 'ME ACCOUNT' });

    await insertTransactions(db, [
      await txWithCounterparty('DONE MERCHANT', { categoryId: 'cat-food', categorySource: 'rule' }),
      makeRow({ id: 'tx-self', accountId, counterpartyId: selfCp, amountMinor: -5_000 }),
      makeRow({
        id: 'tx-internal',
        accountId,
        counterpartyId: transferCp,
        amountMinor: -5_000,
      }),
    ]);

    await db.query(`UPDATE transactions SET transfer_group_id = 'grp-1' WHERE id = 'tx-internal'`);

    expect(await collectUncategorizedCounterparties(db)).toEqual([]);
  });

  it('persists assignments as suggested rules, deterministically', async () => {
    const assignments = [
      {
        name: 'ADEBAYO JOHN',
        categoryId: 'cat-transfer-out',
        confidence: 0.94,
        model: 'jev-1.13.0',
      },
      { name: 'NO SUCH CATEGORY', categoryId: 'cat-does-not-exist' },
    ];

    expect(await persistSuggestedRules(db, assignments)).toBe(1);

    const rules = await listSuggested(db);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      matchField: 'counterparty',
      matchType: 'contains',
      pattern: 'adebayo john',
      categoryId: 'cat-transfer-out',
      source: 'suggested',
      suggestionConfidence: 0.94,
      suggestionModel: 'jev-1.13.0',
    });

    expect(await persistSuggestedRules(db, assignments)).toBe(0);
    expect(await listSuggested(db)).toHaveLength(1);
  });

  it('does not supersede an existing rule with a different category', async () => {
    await persistSuggestedRules(db, [{ name: 'ADEBAYO JOHN', categoryId: 'cat-transfer-out' }]);
    const rules = await listSuggested(db);
    await approveSuggestedRule(db, rules[0].id);

    expect(await persistSuggestedRules(db, [{ name: 'ADEBAYO JOHN', categoryId: 'cat-transfer-in' }])).toBe(0);

    const all = await db.query<{ pattern: string; category_id: string; source: string }>(
      'SELECT pattern, category_id, source FROM rules WHERE pattern = $1',
      ['adebayo john']
    );
    expect(all.rows).toEqual([
      expect.objectContaining({
        pattern: 'adebayo john',
        category_id: 'cat-transfer-out',
        source: 'user',
      }),
    ]);
  });

  it('does not re-suggest a name the user rejected', async () => {
    await persistSuggestedRules(db, [{ name: 'ADEBAYO JOHN', categoryId: 'cat-transfer-out' }]);
    const rules = await listSuggested(db);
    await rejectSuggestedRule(db, rules[0].id);

    expect(await persistSuggestedRules(db, [{ name: 'ADEBAYO JOHN', categoryId: 'cat-transfer-out' }])).toBe(0);
    expect(await listSuggested(db)).toHaveLength(0);
  });

  it('categorises uncategorised rows and leaves user-set ones alone', async () => {
    await insertTransactions(db, [
      await txWithCounterparty('SHOPRITE LEKKI', { description: 'SHOPRITE PURCHASE', kind: TransactionType.CardPayment }),
      await txWithCounterparty('PEPPER ROOM', { description: 'PEPPER ROOM PURCHASE', kind: TransactionType.CardPayment }),
      await txWithCounterparty('JUMIA NG', {
        description: 'JUMIA PURCHASE',
        kind: TransactionType.CardPayment,
        categoryId: 'cat-transfer-out',
        categorySource: 'user',
      }),
    ]);

    await persistSuggestedRules(db, [{ name: 'SHOPRITE LEKKI', categoryId: 'cat-food-groceries' }]);
    const rows = await applyRulesToUncategorized(db);
    expect(rows).toBe(1);

    const result = await db.query<{ description: string; category_id: string | null; category_source: string | null }>(
      'SELECT description, category_id, category_source FROM transactions ORDER BY description'
    );
    const byDescription = Object.fromEntries(result.rows.map((r) => [r.description, r]));

    expect(byDescription['SHOPRITE PURCHASE'].category_id).toBe('cat-food-groceries');
    expect(byDescription['SHOPRITE PURCHASE'].category_source).toBe('rule');
    expect(byDescription['PEPPER ROOM PURCHASE'].category_id).toBeNull();

    expect(byDescription['JUMIA PURCHASE'].category_id).toBe('cat-transfer-out');
    expect(byDescription['JUMIA PURCHASE'].category_source).toBe('user');
  });

  it('keeps a rule the user approved, even against a re-suggestion', async () => {
    await insertTransactions(db, [await txWithCounterparty('ADEBAYO JOHN')]);
    await persistSuggestedRules(db, [{ name: 'ADEBAYO JOHN', categoryId: 'cat-transfer-out' }]);

    const rules = await listSuggested(db);
    await approveSuggestedRule(db, rules[0].id);
    await persistSuggestedRules(db, [{ name: 'ADEBAYO JOHN', categoryId: 'cat-transfer-out' }]);

    const after = await listSuggested(db);
    expect(after).toHaveLength(0);
    const all = await db.query<{ source: string }>('SELECT source FROM rules WHERE pattern = $1', ['adebayo john']);
    expect(all.rows[0].source).toBe('user');
  });

  it('uncategorises rows only the rejected rule had matched', async () => {
    await insertTransactions(db, [
      await txWithCounterparty('ADEBAYO JOHN', { description: 'NIP TRANSFER', kind: TransactionType.Transfer }),
      await txWithCounterparty('SHOPRITE LEKKI', { description: 'POS PURCHASE', kind: TransactionType.CardPayment }),
    ]);

    await persistSuggestedRules(db, [
      { name: 'ADEBAYO JOHN', categoryId: 'cat-transfer-out' },
      { name: 'SHOPRITE LEKKI', categoryId: 'cat-food-groceries' },
    ]);
    await applyRulesToUncategorized(db);

    const john = (await listSuggested(db)).find((r) => r.pattern.includes('adebayo'));
    await rejectSuggestedRule(db, john!.id);

    const result = await db.query<{ description: string; category_id: string | null }>(
      'SELECT description, category_id FROM transactions ORDER BY description'
    );
    const byDescription = Object.fromEntries(result.rows.map((r) => [r.description, r.category_id]));

    expect(byDescription['NIP TRANSFER']).toBeNull();
    expect(byDescription['POS PURCHASE']).toBe('cat-food-groceries');
  });

  it('does nothing when chat mode is off', async () => {
    await insertTransactions(db, [await txWithCounterparty('ADEBAYO JOHN')]);
    expect(await runSuggestionPass(db, { type: 'off' })).toBeNull();
    expect(await listSuggested(db)).toHaveLength(0);
  });

  it('returns null when there is nothing to suggest', async () => {
    const localMode: ChatMode = { type: 'local', status: 'connected', url: 'http://x', model: 'm', models: [], error: null };
    expect(await runSuggestionPass(db, localMode)).toBeNull();
  });
});

async function listSuggested(db: Queryable): Promise<Rule[]> {
  const result = await db.query<{ id: string; pattern: string; source: string; category_id: string; match_field: string; match_type: string; priority: number; suggestion_confidence: number | null; suggestion_model: string | null }>(
    `SELECT * FROM rules WHERE source = 'suggested'`
  );
  return result.rows.map((r) => ({
    id: r.id,
    matchField: r.match_field as Rule['matchField'],
    matchType: r.match_type as Rule['matchType'],
    pattern: r.pattern,
    categoryId: r.category_id,
    priority: r.priority,
    source: r.source as Rule['source'],
    suggestionConfidence: r.suggestion_confidence,
    suggestionModel: r.suggestion_model,
  }));
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
