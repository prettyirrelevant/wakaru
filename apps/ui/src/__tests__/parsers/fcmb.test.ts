import { describe, it, expect } from 'vitest';
import { FcmbParser } from '~/lib/parsers/fcmb';
import { BankType, TransactionCategory, TransactionType } from '~/types';

describe('FcmbParser', () => {
  const parser = new FcmbParser();

  describe('parseTransaction', () => {
    it('returns null for empty row', () => {
      expect(parser.parseTransaction([], 0)).toBeNull();
    });

    it('returns null for row with less than 6 columns', () => {
      expect(parser.parseTransaction(['01-Jan-2025', '01-Jan-2025', 'Test'], 0)).toBeNull();
    });

    it('parses a valid credit transaction', () => {
      // [txnDate, valDate, description, debit, credit, balance]
      const row = [
        '15-Nov-2025',
        '15-Nov-2025',
        'NIP FRM John Doe',
        '',
        '50,000.00',
        '150,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.bankSource).toBe(BankType.FCMB);
      expect(result!.amount).toBe(5000000);
      expect(result!.category).toBe(TransactionCategory.Inflow);
      expect(result!.meta?.counterpartyName).toBe('John Doe');
    });

    it('parses a valid debit transaction', () => {
      const row = [
        '20-Dec-2025',
        '20-Dec-2025',
        'App To Opay Jane Smith',
        '25,000.00',
        '',
        '125,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.amount).toBe(-2500000);
      expect(result!.category).toBe(TransactionCategory.Outflow);
    });

    it('parses App To transfer with bank', () => {
      const row = [
        '15-Nov-2025',
        '15-Nov-2025',
        'App To Opay John Doe',
        '10,000.00',
        '',
        '90,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
      expect(result!.meta?.counterpartyBank).toBe('Opay');
    });

    it('parses NIP FRM transfer', () => {
      const row = [
        '15-Nov-2025',
        '15-Nov-2025',
        'NIP FRM Jane Smith',
        '',
        '10,000.00',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
      expect(result!.meta?.counterpartyName).toBe('Jane Smith');
    });

    it('parses COP FRM transfer', () => {
      const row = [
        '15-Nov-2025',
        '15-Nov-2025',
        'COP FRM Internal Account',
        '',
        '5,000.00',
        '105,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
      expect(result!.meta?.counterpartyName).toBe('Internal Account');
    });

    it('parses POS purchase', () => {
      const row = [
        '10-Jan-2025',
        '10-Jan-2025',
        'POS Purchase at Terminal',
        '5,000.00',
        '',
        '95,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.CardPayment);
    });

    it('parses airtime purchase', () => {
      const row = [
        '15-Jan-2025',
        '15-Jan-2025',
        '/Airtime/ MTN 08012345678',
        '1,000.00',
        '',
        '94,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Airtime);
    });

    it('parses EMT levy', () => {
      const row = [
        '01-Feb-2025',
        '01-Feb-2025',
        'EMT Levy',
        '50.00',
        '',
        '93,950.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses SMS alert charge', () => {
      const row = [
        '01-Feb-2025',
        '01-Feb-2025',
        'SMS Alert Charge',
        '100.00',
        '',
        '93,850.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses transaction charge', () => {
      const row = [
        '05-Feb-2025',
        '05-Feb-2025',
        'Transaction Charge',
        '25.00',
        '',
        '93,825.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses reversal transaction', () => {
      const row = [
        '10-Feb-2025',
        '10-Feb-2025',
        'Reversal for failed transfer',
        '',
        '5,000.00',
        '98,825.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Reversal);
    });

    it('returns null for invalid date', () => {
      const row = [
        'Invalid',
        '01-Jan-2025',
        'Test',
        '',
        '1,000.00',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row, 0);
      expect(result).toBeNull();
    });

    it('returns null when no valid amount', () => {
      const row = [
        '01-Jan-2025',
        '01-Jan-2025',
        'Test',
        '',
        '',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row, 0);
      expect(result).toBeNull();
    });

    it('stores balance after in meta', () => {
      const row = [
        '01-Jan-2025',
        '01-Jan-2025',
        'Test',
        '',
        '1,000.00',
        '101,000.00',
      ];

      const result = parser.parseTransaction(row, 0);
      expect(result!.meta?.balanceAfter).toBe(10100000);
    });

    it('stores value date as sessionId', () => {
      const row = [
        '01-Jan-2025',
        '02-Jan-2025',
        'Test',
        '',
        '1,000.00',
        '101,000.00',
      ];

      const result = parser.parseTransaction(row, 0);
      expect(result!.meta?.sessionId).toBe('02-Jan-2025');
    });

    it('handles all month abbreviations', () => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      months.forEach((month, index) => {
        const row = [
          `15-${month}-2025`,
          `15-${month}-2025`,
          'Test',
          '',
          '1,000.00',
          '100,000.00',
        ];

        const result = parser.parseTransaction(row, 0);
        expect(result).not.toBeNull();

        const date = new Date(result!.date);
        expect(date.getUTCMonth()).toBe(index);
      });
    });

    it('generates unique IDs', () => {
      const row1 = ['01-Jan-2025', '01-Jan-2025', 'Transaction 1', '', '1,000.00', '100,000.00'];
      const row2 = ['01-Jan-2025', '01-Jan-2025', 'Transaction 2', '', '2,000.00', '102,000.00'];

      const result1 = parser.parseTransaction(row1, 0);
      const result2 = parser.parseTransaction(row2, 1);

      expect(result1!.id).not.toBe(result2!.id);
      expect(result1!.id).toMatch(/^fcmb-/);
    });
  });

  describe('bankName', () => {
    it('returns FCMB', () => {
      expect(parser.bankName).toBe('FCMB');
    });
  });
});
