import { describe, it, expect } from 'vitest';
import { applyRules, sortRules } from '~/lib/ledger/rules';
import type { Rule } from '~/types';

function rule(partial: Partial<Rule> & Pick<Rule, 'id' | 'pattern' | 'categoryId'>): Rule {
  return {
    matchField: 'description',
    matchType: 'contains',
    priority: 100,
    ...partial,
  };
}

describe('applyRules', () => {
  const tx = { description: 'UBER BV TRIP 12345', counterpartyName: null, kind: 'card_payment' };

  it('returns null when nothing matches', () => {
    const rules = [rule({ id: 'r1', pattern: 'netflix', categoryId: 'cat-tv' })];
    expect(applyRules(rules, tx)).toBeNull();
  });

  it('matches case-insensitively on a substring, but equals means equals', () => {
    const contains = [rule({ id: 'r1', pattern: 'uber', categoryId: 'cat-ride' })];
    expect(applyRules(contains, tx)).toEqual({ categoryId: 'cat-ride', source: 'rule' });

    const equals = [rule({ id: 'r1', matchType: 'equals', pattern: 'uber', categoryId: 'cat-ride' })];
    expect(applyRules(equals, tx)).toBeNull();
  });

  it('matches on the transaction kind', () => {
    const rules = [
      rule({ id: 'r1', matchField: 'kind', matchType: 'equals', pattern: 'card_payment', categoryId: 'cat-card' }),
    ];
    expect(applyRules(rules, tx)?.categoryId).toBe('cat-card');
  });

  it('matches on the counterparty name', () => {
    const rules = [rule({ id: 'r1', matchField: 'counterparty', pattern: 'shoprite', categoryId: 'cat-groceries' })];
    const result = applyRules(rules, {
      description: 'POS PURCHASE',
      counterpartyName: 'SHOPRITE LEKKI',
      kind: 'card_payment',
    });
    expect(result?.categoryId).toBe('cat-groceries');
  });

  it('matches on either field with any', () => {
    const rules = [rule({ id: 'r1', matchField: 'any', pattern: 'shoprite', categoryId: 'cat-groceries' })];

    const fromCounterparty = applyRules(rules, {
      description: 'POS PURCHASE',
      counterpartyName: 'SHOPRITE LEKKI',
      kind: 'card_payment',
    });
    expect(fromCounterparty?.categoryId).toBe('cat-groceries');

    const fromDescription = applyRules(rules, {
      description: 'POS/WEB PURCHASE 4567**1234 SHOPRITE LEKKI',
      counterpartyName: null,
      kind: 'card_payment',
    });
    expect(fromDescription?.categoryId).toBe('cat-groceries');
  });

  it('ignores a completely empty any field', () => {
    const rules = [rule({ id: 'r1', matchField: 'any', pattern: 'shoprite', categoryId: 'cat-groceries' })];
    expect(
      applyRules(rules, { description: '', counterpartyName: null, kind: 'card_payment' })
    ).toBeNull();
  });

  it('takes the first match in the order given', () => {
    const rules = sortRules([
      rule({ id: 'general', pattern: 'uber', categoryId: 'cat-transport', priority: 90 }),
      rule({ id: 'specific', pattern: 'uber bv', categoryId: 'cat-ride', priority: 10 }),
    ]);
    expect(applyRules(rules, tx)?.categoryId).toBe('cat-ride');
  });

  it('ignores an empty field rather than matching everything', () => {
    const rules = [rule({ id: 'r1', matchField: 'counterparty', pattern: 'a', categoryId: 'cat-x' })];
    expect(applyRules(rules, tx)).toBeNull();
  });

  it('supports regex rules', () => {
    const rules = [
      rule({ id: 'r1', matchType: 'regex', pattern: '^UBER\\s+BV', categoryId: 'cat-ride' }),
    ];
    expect(applyRules(rules, tx)?.categoryId).toBe('cat-ride');
  });

  it('skips a malformed regex instead of breaking the whole import', () => {
    const rules = [
      rule({ id: 'bad', matchType: 'regex', pattern: '([unclosed', categoryId: 'cat-x' }),
      rule({ id: 'good', pattern: 'uber', categoryId: 'cat-ride' }),
    ];
    expect(applyRules(rules, tx)?.categoryId).toBe('cat-ride');
  });
});

describe('sortRules', () => {
  it('orders by priority, then id for stability', () => {
    const sorted = sortRules([
      rule({ id: 'b', pattern: 'x', categoryId: 'c', priority: 50 }),
      rule({ id: 'a', pattern: 'x', categoryId: 'c', priority: 50 }),
      rule({ id: 'c', pattern: 'x', categoryId: 'c', priority: 10 }),
    ]);

    expect(sorted.map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('does not mutate its input', () => {
    const rules = [
      rule({ id: 'b', pattern: 'x', categoryId: 'c', priority: 50 }),
      rule({ id: 'a', pattern: 'x', categoryId: 'c', priority: 10 }),
    ];
    sortRules(rules);
    expect(rules.map((r) => r.id)).toEqual(['b', 'a']);
  });
});
