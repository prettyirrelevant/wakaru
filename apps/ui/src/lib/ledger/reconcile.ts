import type { ReconcileBreak, ReconcileResult } from '~/types';

export interface ReconcilableRow {
  id: string;
  bookedAt: string;
  amountMinor: number;
  balanceAfterMinor: number | null;
}

/**
 * Verify a statement against its own running balance.
 *
 * For consecutive rows that both carry a balance,
 * `balance[n-1] + amount[n]` must equal `balance[n]`. A mismatch means we
 * dropped a row, duplicated one, or misread an amount — the exact failures
 * that otherwise show up as quietly wrong totals weeks later.
 *
 * Rows must arrive in statement order.
 *
 * @returns `ok: null` when the statement carries too few balances to check.
 */
export function reconcileBalances(rows: ReconcilableRow[]): ReconcileResult {
  const breaks: ReconcileBreak[] = [];
  let checked = 0;
  let previous: ReconcilableRow | null = null;

  for (const row of rows) {
    if (row.balanceAfterMinor === null) {
      // A gap in the balance column breaks the chain; restart from the next
      // row that has one rather than comparing across the hole.
      previous = null;
      continue;
    }

    if (previous !== null) {
      const expected = previous.balanceAfterMinor! + row.amountMinor;
      checked++;

      if (expected !== row.balanceAfterMinor) {
        breaks.push({
          transactionId: row.id,
          bookedAt: row.bookedAt,
          expectedMinor: expected,
          actualMinor: row.balanceAfterMinor,
          deltaMinor: row.balanceAfterMinor - expected,
        });
      }
    }

    previous = row;
  }

  if (checked === 0) {
    return { ok: null, checked: 0, breaks: [] };
  }

  return { ok: breaks.length === 0, checked, breaks };
}
