import { describe, it, expect } from 'vitest';
import { KudaParser } from '~/lib/parsers/kuda';
import { BankType, TransactionCategory, TransactionType } from '~/types';

describe('KudaParser', () => {
  const parser = new KudaParser();

  describe('parseTransaction', () => {
    it('returns null for empty row', () => {
      expect(parser.parseTransaction([], 0)).toBeNull();
    });

    it('returns null for row with less than 6 columns', () => {
      expect(parser.parseTransaction(['22/01/23 12:46:35', '', '1000'], 0)).toBeNull();
    });

    it('parses a valid credit transaction (money in)', () => {
      // [Date/Time, empty, Money In, empty, Money out, empty, Category, empty, To/From, empty, Description, empty, Balance]
      const row = [
        '22/01/23 12:46:35', // 0: dateTime
        '',                  // 1: empty
        '50,000.00',         // 2: moneyIn
        '',                  // 3: empty
        '',                  // 4: moneyOut
        '',                  // 5: empty
        'Transfer',          // 6: category
        '',                  // 7: empty
        'John Doe/1234567890/Access Bank', // 8: toFrom
        '',                  // 9: empty
        'Salary payment',    // 10: description
        '',                  // 11: empty
        '150,000.00',        // 12: balance
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.bankSource).toBe(BankType.Kuda);
      expect(result!.amount).toBe(5000000); // 50,000 * 100 kobo
      expect(result!.category).toBe(TransactionCategory.Inflow);
      expect(result!.meta?.counterpartyName).toBe('John Doe');
      expect(result!.meta?.counterpartyAccount).toBe('1234567890');
      expect(result!.meta?.counterpartyBank).toBe('Access Bank');
    });

    it('parses a valid debit transaction (money out)', () => {
      const row = [
        '23/01/23 14:30:00',
        '',
        '',                  // no money in
        '',
        '25,000.00',         // money out
        '',
        'Transfer',
        '',
        'Jane Smith/0987654321/GTB',
        '',
        'Rent payment',
        '',
        '125,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.amount).toBe(-2500000); // -25,000 * 100 kobo (negative for debit)
      expect(result!.category).toBe(TransactionCategory.Outflow);
    });

    it('parses airtime transaction', () => {
      const row = [
        '24/01/23 09:00:00',
        '',
        '',
        '',
        '1,000.00',
        '',
        'Airtime',
        '',
        'MTN/08012345678',
        '',
        'Airtime recharge',
        '',
        '124,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Airtime);
    });

    it('parses bill payment transaction', () => {
      const row = [
        '25/01/23 10:00:00',
        '',
        '',
        '',
        '15,000.00',
        '',
        'Bill Payment',
        '',
        'DSTV/Subscription',
        '',
        'DSTV subscription',
        '',
        '109,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BillPayment);
    });

    it('parses card payment transaction', () => {
      const row = [
        '26/01/23 15:00:00',
        '',
        '',
        '',
        '5,000.00',
        '',
        'Card',
        '',
        'POS Terminal',
        '',
        'POS purchase',
        '',
        '104,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.CardPayment);
    });

    it('parses ATM withdrawal transaction', () => {
      const row = [
        '27/01/23 16:00:00',
        '',
        '',
        '',
        '20,000.00',
        '',
        'ATM',
        '',
        'ATM Withdrawal',
        '',
        'Cash withdrawal',
        '',
        '84,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.AtmWithdrawal);
    });

    it('parses bank charge transaction', () => {
      const row = [
        '28/01/23 00:00:00',
        '',
        '',
        '',
        '50.00',
        '',
        'Charge',
        '',
        'Kuda',
        '',
        'Transfer fee',
        '',
        '83,950.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses reversal transaction', () => {
      const row = [
        '29/01/23 12:00:00',
        '',
        '5,000.00',
        '',
        '',
        '',
        'Reversal',
        '',
        'System',
        '',
        'Transaction reversal',
        '',
        '88,950.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Reversal);
    });

    it('parses interest transaction', () => {
      const row = [
        '31/01/23 00:00:00',
        '',
        '100.00',
        '',
        '',
        '',
        'Interest',
        '',
        'Kuda',
        '',
        'Monthly interest',
        '',
        '89,050.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Interest);
    });

    it('parses transfer transaction', () => {
      const row = [
        '01/02/23 10:00:00',
        '',
        '',
        '',
        '10,000.00',
        '',
        'Transfer',
        '',
        'Someone/1234567890/OPay',
        '',
        'Money sent',
        '',
        '79,050.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
    });

    it('returns null for invalid date format', () => {
      const row = [
        'Invalid Date',
        '',
        '1,000.00',
        '',
        '',
        '',
        'Transfer',
        '',
        'Someone',
        '',
        'Test',
        '',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row, 0);
      expect(result).toBeNull();
    });

    it('returns null when no valid amount', () => {
      const row = [
        '22/01/23 12:46:35',
        '',
        '',  // no money in
        '',
        '',  // no money out
        '',
        'Transfer',
        '',
        'Someone',
        '',
        'Test',
        '',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row, 0);
      expect(result).toBeNull();
    });

    it('returns null for empty dateTime', () => {
      const row = [
        '',  // empty dateTime
        '',
        '1,000.00',
        '',
        '',
        '',
        'Transfer',
        '',
        'Someone',
        '',
        'Test',
        '',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row, 0);
      expect(result).toBeNull();
    });

    it('extracts counterparty info from toFrom field', () => {
      const row = [
        '22/01/23 12:46:35',
        '',
        '1,000.00',
        '',
        '',
        '',
        'Transfer',
        '',
        'Olayinka Jubril Ganiyu/2211391117/Zenith Bank Plc',
        '',
        'Test',
        '',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result!.meta?.counterpartyName).toBe('Olayinka Jubril Ganiyu');
      expect(result!.meta?.counterpartyAccount).toBe('2211391117');
      expect(result!.meta?.counterpartyBank).toBe('Zenith Bank Plc');
    });

    it('handles partial counterparty info', () => {
      const row = [
        '22/01/23 12:46:35',
        '',
        '1,000.00',
        '',
        '',
        '',
        'Transfer',
        '',
        'John Doe',  // only name, no account or bank
        '',
        'Test',
        '',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result!.meta?.counterpartyName).toBe('John Doe');
      expect(result!.meta?.counterpartyAccount).toBeUndefined();
      expect(result!.meta?.counterpartyBank).toBeUndefined();
    });

    it('stores raw category in meta', () => {
      const row = [
        '22/01/23 12:46:35',
        '',
        '1,000.00',
        '',
        '',
        '',
        'Custom Category',
        '',
        'Someone',
        '',
        'Description',
        '',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row, 0);
      expect(result!.meta?.rawCategory).toBe('Custom Category');
    });

    it('uses category as description when description is empty', () => {
      const row = [
        '22/01/23 12:46:35',
        '',
        '1,000.00',
        '',
        '',
        '',
        'Airtime Purchase',
        '',
        'MTN',
        '',
        '',  // empty description
        '',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row, 0);
      expect(result!.description).toBe('Airtime Purchase');
    });

    it('generates unique IDs for different transactions', () => {
      const row1 = [
        '22/01/23 12:46:35',
        '',
        '1,000.00',
        '',
        '',
        '',
        'Transfer',
        '',
        'Person A',
        '',
        'Transaction 1',
        '',
        '100,000.00',
      ];
      const row2 = [
        '22/01/23 12:46:36',
        '',
        '2,000.00',
        '',
        '',
        '',
        'Transfer',
        '',
        'Person B',
        '',
        'Transaction 2',
        '',
        '102,000.00',
      ];

      const result1 = parser.parseTransaction(row1, 0);
      const result2 = parser.parseTransaction(row2, 1);

      expect(result1!.id).not.toBe(result2!.id);
      expect(result1!.id).toMatch(/^kuda-/);
      expect(result2!.id).toMatch(/^kuda-/);
    });

    it('handles currency symbols in amounts', () => {
      const row = [
        '22/01/23 12:46:35',
        '',
        '₦10,000.00',
        '',
        '',
        '',
        'Transfer',
        '',
        'Someone',
        '',
        'Test',
        '',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row, 0);
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(1000000); // 10,000 * 100 kobo
    });

    it('parses 2-digit year correctly (assumes 2000s)', () => {
      const row = [
        '15/06/25 10:30:00',  // 15 June 2025
        '',
        '1,000.00',
        '',
        '',
        '',
        'Transfer',
        '',
        'Someone',
        '',
        'Test',
        '',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row, 0);
      expect(result).not.toBeNull();

      const date = new Date(result!.date);
      expect(date.getFullYear()).toBe(2025);
      expect(date.getMonth()).toBe(5); // June (0-indexed)
      expect(date.getDate()).toBe(15);
    });
  });

  describe('bankName', () => {
    it('returns Kuda', () => {
      expect(parser.bankName).toBe('Kuda');
    });
  });
});
