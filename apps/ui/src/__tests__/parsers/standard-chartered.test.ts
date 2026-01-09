import { describe, it, expect } from 'vitest';
import { StandardCharteredParser } from '~/lib/parsers/standard-chartered';
import { BankType, TransactionCategory, TransactionType } from '~/types';

describe('StandardCharteredParser', () => {
  const parser = new StandardCharteredParser();

  describe('parseTransaction', () => {
    it('returns null for empty row', () => {
      expect(parser.parseTransaction([], 0)).toBeNull();
    });

    it('returns null for row with less than 5 columns', () => {
      expect(parser.parseTransaction(['15 Nov 2025', 'Test', '1000', '50000'], 0)).toBeNull();
    });

    it('parses a valid credit transaction', () => {
      // [date, description, amount, balance, isCredit]
      const row = [
        '15 Nov 2025',
        'JOHN DOE NIP Transfer',
        '50,000.00',
        '150,000.00',
        'credit',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.bankSource).toBe(BankType.StandardChartered);
      expect(result!.amount).toBe(5000000);
      expect(result!.category).toBe(TransactionCategory.Inflow);
    });

    it('parses a valid debit transaction', () => {
      const row = [
        '20 Dec 2025',
        'JANE SMITH Transfer',
        '25,000.00',
        '125,000.00',
        'debit',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.amount).toBe(-2500000);
      expect(result!.category).toBe(TransactionCategory.Outflow);
    });

    it('parses NIP transfer', () => {
      const row = [
        '15 Nov 2025',
        'JOHN DOE NIP V.12345',
        '10,000.00',
        '110,000.00',
        'credit',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
      expect(result!.meta?.counterpartyName).toBe('JOHN DOE');
    });

    it('parses POS transaction', () => {
      const row = [
        '10 Jan 2025',
        'POS T CHICKEN REPUBLIC 123456',
        '5,000.00',
        '105,000.00',
        'debit',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.CardPayment);
    });

    it('parses cash advance', () => {
      const row = [
        '15 Jan 2025',
        'CASH ADV T SHOPRITE 123456',
        '20,000.00',
        '85,000.00',
        'debit',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.CardPayment);
    });

    it('parses airtime transaction', () => {
      const row = [
        '20 Jan 2025',
        'MTN Airtime Top-up',
        '1,000.00',
        '84,000.00',
        'debit',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Airtime);
    });

    it('parses stamp duty charge', () => {
      const row = [
        '01 Feb 2025',
        'STAMPDUTYCHARG',
        '50.00',
        '83,950.00',
        'debit',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses levy charge', () => {
      const row = [
        '01 Feb 2025',
        'EMT Levy',
        '50.00',
        '83,900.00',
        'debit',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses debit card transaction', () => {
      const row = [
        '05 Feb 2025',
        'DEBIT CARD TXN',
        '15,000.00',
        '68,900.00',
        'debit',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.CardPayment);
    });

    it('parses Remita transaction', () => {
      const row = [
        '10 Feb 2025',
        'REMITA Payment',
        '10,000.00',
        '58,900.00',
        'debit',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.CardPayment);
    });

    it('parses cash back/reward', () => {
      const row = [
        '15 Feb 2025',
        'Cash Back Reward',
        '500.00',
        '59,400.00',
        'credit',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Interest);
    });

    it('parses IBK transaction', () => {
      const row = [
        '20 Feb 2025',
        'IBKG JOHN DOE',
        '5,000.00',
        '54,400.00',
        'debit',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
    });

    it('returns null for invalid date', () => {
      const row = [
        'Invalid Date',
        'Test',
        '1,000.00',
        '100,000.00',
        'credit',
      ];

      const result = parser.parseTransaction(row, 0);
      expect(result).toBeNull();
    });

    it('stores balance after in meta', () => {
      const row = [
        '01 Jan 2025',
        'Test',
        '1,000.00',
        '101,000.00',
        'credit',
      ];

      const result = parser.parseTransaction(row, 0);
      expect(result!.meta?.balanceAfter).toBe(10100000);
    });

    it('handles all month abbreviations', () => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      months.forEach((month, index) => {
        const row = [
          `15 ${month} 2025`,
          'Test',
          '1,000.00',
          '100,000.00',
          'credit',
        ];

        const result = parser.parseTransaction(row, 0);
        expect(result).not.toBeNull();

        const date = new Date(result!.date);
        expect(date.getUTCMonth()).toBe(index);
      });
    });

    it('generates unique IDs', () => {
      const row1 = ['01 Jan 2025', 'Transaction 1', '1,000.00', '100,000.00', 'credit'];
      const row2 = ['01 Jan 2025', 'Transaction 2', '2,000.00', '102,000.00', 'credit'];

      const result1 = parser.parseTransaction(row1, 0);
      const result2 = parser.parseTransaction(row2, 1);

      expect(result1!.id).not.toBe(result2!.id);
      expect(result1!.id).toMatch(/^sc-/);
    });
  });

  describe('bankName', () => {
    it('returns Standard Chartered', () => {
      expect(parser.bankName).toBe('Standard Chartered');
    });
  });
});
