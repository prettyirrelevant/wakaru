import { describe, it, expect } from 'vitest';
import { maskAccountNumber, toStatementOrder } from '~/lib/ledger/ingest';
import { normalizeCounterpartyName } from '~/lib/db';
import { hash64, hashParts } from '~/lib/utils/hash';
import { TransactionCategory, BankType, type ParsedTransaction } from '~/types';

function tx(
  date: string,
  amount: number,
  balanceAfter: number | null,
  description = 'test'
): ParsedTransaction {
  return {
    id: `${date}-${amount}`,
    date: `${date}T00:00:00.000Z`,
    createdAt: 0,
    description,
    amount,
    category: amount > 0 ? TransactionCategory.Inflow : TransactionCategory.Outflow,
    bankSource: BankType.GTB,
    reference: 'REF',
    meta: balanceAfter === null ? {} : { balanceAfter },
  };
}

describe('toStatementOrder', () => {
  it('keeps an oldest-first statement as it is', () => {
    const rows = [
      tx('2025-01-01', -1000, 99000),
      tx('2025-01-02', -2000, 97000),
      tx('2025-01-03', 5000, 102000),
    ];

    expect(toStatementOrder(rows)).toBe(rows);
  });

  it('flips a newest-first statement so the balance reconciles', () => {
    const rows = [
      tx('2025-01-03', 5000, 102000),
      tx('2025-01-02', -2000, 97000),
      tx('2025-01-01', -1000, 99000),
    ];

    const ordered = toStatementOrder(rows);
    expect(ordered.map((r) => r.date.slice(0, 10))).toEqual([
      '2025-01-01',
      '2025-01-02',
      '2025-01-03',
    ]);
  });

  it('leaves the order alone when neither direction reconciles', () => {
    const rows = [
      tx('2025-01-01', -1000, 50000),
      tx('2025-01-02', -2000, 12345),
      tx('2025-01-03', -3000, 99999),
    ];

    expect(toStatementOrder(rows)).toBe(rows);
  });

  it('leaves a statement without balances alone', () => {
    const rows = [
      tx('2025-01-03', 5000, null),
      tx('2025-01-02', -2000, null),
      tx('2025-01-01', -1000, null),
    ];

    expect(toStatementOrder(rows)).toBe(rows);
  });

  it('does not try to reorder a very short statement', () => {
    const rows = [tx('2025-01-02', -2000, 97000), tx('2025-01-01', -1000, 99000)];
    expect(toStatementOrder(rows)).toBe(rows);
  });
});

describe('maskAccountNumber', () => {
  it('keeps only the last four digits, ignoring separators', () => {
    expect(maskAccountNumber('0123456789')).toBe('****6789');
    expect(maskAccountNumber('0123-4567-89')).toBe('****6789');
    expect(maskAccountNumber(undefined)).toBe('');
    expect(maskAccountNumber('12')).toBe('');
  });
});

describe('normalizeCounterpartyName', () => {
  it('collapses the spellings banks use for one person', () => {
    const canonical = normalizeCounterpartyName('JOHN ADEBAYO');

    expect(normalizeCounterpartyName('ADEBAYO JOHN')).toBe(canonical);
    expect(normalizeCounterpartyName('Mr. John Adebayo')).toBe(canonical);
  });

  it('keeps different people apart, and yields nothing from a nameless string', () => {
    expect(normalizeCounterpartyName('JANE ADEBAYO')).not.toBe(
      normalizeCounterpartyName('JOHN ADEBAYO')
    );
    expect(normalizeCounterpartyName('   ---   ')).toBe('');
  });
});

describe('hash64', () => {
  it('is deterministic', () => {
    expect(hash64('wakaru')).toBe(hash64('wakaru'));
  });

  it('separates parts so they cannot run together', () => {
    // Without a separator, ['ab','c'] and ['a','bc'] would collide.
    expect(hashParts('ab', 'c')).not.toBe(hashParts('a', 'bc'));
  });

  it('distinguishes the occurrence index that keeps duplicate rows apart', () => {
    const identity = hashParts('acc-1', '2025-01-01', -50000, 'REF', 'Transfer');
    expect(hashParts(identity, 0)).not.toBe(hashParts(identity, 1));
  });
});
