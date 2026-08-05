import { describe, it, expect } from 'vitest';
import { linkFees, type FeeLinkable } from '~/lib/ledger/fees';
import { TransactionType } from '~/types';

function row(
  id: string,
  amountMinor: number,
  kind: TransactionType,
  day = '2025-01-01'
): FeeLinkable {
  return { id, amountMinor, kind, bookedAt: `${day}T10:00:00.000Z` };
}

describe('linkFees', () => {
  it('attaches an EMT levy and its VAT to the transfer above them', () => {
    const links = linkFees([
      row('transfer', -5_000_000, TransactionType.Transfer),
      row('levy', -5_000, TransactionType.BankCharge),
      row('vat', -375, TransactionType.BankCharge),
    ]);

    expect(links.get('levy')).toBe('transfer');
    expect(links.get('vat')).toBe('transfer');
  });

  it('leaves a standalone charge unattached', () => {
    const links = linkFees([row('maintenance', -10_000, TransactionType.BankCharge)]);

    expect(links.size).toBe(0);
  });

  it('does not attach a charge to a transaction on a different day', () => {
    const links = linkFees([
      row('transfer', -5_000_000, TransactionType.Transfer, '2025-01-01'),
      row('levy', -5_000, TransactionType.BankCharge, '2025-01-02'),
    ]);

    expect(links.size).toBe(0);
  });

  it('does not attach a charge to an inflow', () => {
    const links = linkFees([
      row('salary', 40_000_000, TransactionType.Transfer),
      row('levy', -5_000, TransactionType.BankCharge),
    ]);

    expect(links.size).toBe(0);
  });

  it('ignores a refunded charge, which has no parent', () => {
    const links = linkFees([
      row('transfer', -5_000_000, TransactionType.Transfer),
      row('refund', 5_000, TransactionType.BankCharge),
    ]);

    expect(links.size).toBe(0);
  });

  it('picks the nearest preceding outflow when several are on the same day', () => {
    const links = linkFees([
      row('first', -1_000_000, TransactionType.Transfer),
      row('second', -2_000_000, TransactionType.CardPayment),
      row('levy', -5_000, TransactionType.BankCharge),
    ]);

    expect(links.get('levy')).toBe('second');
  });

  it('gives up rather than reaching back past the lookback window', () => {
    const links = linkFees([
      row('transfer', -5_000_000, TransactionType.Transfer),
      row('a', -100, TransactionType.BankCharge),
      row('b', -100, TransactionType.BankCharge),
      row('c', -100, TransactionType.BankCharge),
      row('d', -100, TransactionType.BankCharge),
      row('e', -100, TransactionType.BankCharge),
      row('f', -100, TransactionType.BankCharge),
    ]);

    expect(links.get('a')).toBe('transfer');
    expect(links.has('f')).toBe(false);
  });
});
