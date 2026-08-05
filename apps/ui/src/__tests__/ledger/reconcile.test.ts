import { describe, it, expect } from 'vitest';
import { reconcileBalances, type ReconcilableRow } from '~/lib/ledger/reconcile';

function row(
  id: string,
  amountMinor: number,
  balanceAfterMinor: number | null,
  bookedAt = '2025-01-01T00:00:00.000Z'
): ReconcilableRow {
  return { id, bookedAt, amountMinor, balanceAfterMinor };
}

describe('reconcileBalances', () => {
  it('reports no verdict without at least two balances to compare', () => {
    expect(reconcileBalances([row('a', -1000, null), row('b', -2000, null)]).ok).toBeNull();
    expect(reconcileBalances([row('a', -1000, 50000)]).ok).toBeNull();
  });

  it('passes a statement whose balances add up', () => {
    const result = reconcileBalances([
      row('a', -1000, 99000),
      row('b', -2000, 97000),
      row('c', 5000, 102000),
    ]);

    expect(result.ok).toBe(true);
    expect(result.checked).toBe(2);
    expect(result.breaks).toEqual([]);
  });

  it('catches a dropped row', () => {
    // 99000 - 2000 should be 97000; the statement says 95000, so a 2000 debit
    // between them never made it into the ledger.
    const result = reconcileBalances([row('a', -1000, 99000), row('b', -2000, 95000)]);

    expect(result.ok).toBe(false);
    expect(result.breaks).toHaveLength(1);
    expect(result.breaks[0]).toMatchObject({
      transactionId: 'b',
      expectedMinor: 97000,
      actualMinor: 95000,
      deltaMinor: -2000,
    });
  });

  it('catches a duplicated row', () => {
    const result = reconcileBalances([
      row('a', -1000, 99000),
      row('b', -2000, 97000),
      row('b-dup', -2000, 97000),
    ]);

    expect(result.ok).toBe(false);
    expect(result.breaks).toHaveLength(1);
    expect(result.breaks[0].transactionId).toBe('b-dup');
  });

  it('restarts the chain across a gap rather than comparing over it', () => {
    const result = reconcileBalances([
      row('a', -1000, 99000),
      row('b', -2000, null),
      row('c', -3000, 94000),
      row('d', -1000, 93000),
    ]);

    // Only c -> d is checkable; a -> c would wrongly flag the missing balance.
    expect(result.checked).toBe(1);
    expect(result.ok).toBe(true);
  });

  it('handles a zero balance as a real value', () => {
    const result = reconcileBalances([row('a', -1000, 1000), row('b', -1000, 0)]);

    expect(result.ok).toBe(true);
    expect(result.checked).toBe(1);
  });

  it('reports every break, not just the first', () => {
    const result = reconcileBalances([
      row('a', -1000, 99000),
      row('b', -1000, 90000),
      row('c', -1000, 80000),
    ]);

    expect(result.breaks).toHaveLength(2);
  });
});
