import { TransactionType } from '~/types';

export interface FeeLinkable {
  id: string;
  bookedAt: string;
  amountMinor: number;
  kind: TransactionType;
}

/** How many rows back a fee may sit from the transaction that caused it. */
const LOOKBACK_ROWS = 4;

function sameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

/**
 * Attach bank charges to the transaction that caused them.
 *
 * Nigerian banks post the EMT levy, VAT and stamp duty as their own lines
 * immediately after the transfer they belong to. Stored flat, a ₦50,000
 * transfer looks like three unrelated debits and there is no way to show what
 * the transfer actually cost.
 *
 * Rows must arrive in statement order.
 *
 * @returns fee transaction id to parent transaction id
 */
export function linkFees(rows: FeeLinkable[]): Map<string, string> {
  const links = new Map<string, string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.kind !== TransactionType.BankCharge) continue;
    if (row.amountMinor >= 0) continue; // a refunded charge has no parent

    // Walk back to the nearest non-fee outflow on the same day.
    for (let j = i - 1; j >= 0 && i - j <= LOOKBACK_ROWS; j--) {
      const candidate = rows[j];
      if (candidate.kind === TransactionType.BankCharge) continue;
      if (candidate.amountMinor >= 0) break; // an inflow does not incur these
      if (!sameDay(candidate.bookedAt, row.bookedAt)) break;

      links.set(row.id, candidate.id);
      break;
    }
  }

  return links;
}
