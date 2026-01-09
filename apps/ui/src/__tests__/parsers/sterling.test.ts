import { describe, it, expect } from 'vitest';
import { SterlingParser } from '~/lib/parsers/sterling';
import { BankType, TransactionCategory, TransactionType } from '~/types';

describe('SterlingParser', () => {
  const parser = new SterlingParser();

  describe('parseTransaction', () => {
    it('returns null for empty row', () => {
      expect(parser.parseTransaction([])).toBeNull();
    });

    it('returns null for row with less than 6 columns', () => {
      expect(parser.parseTransaction(['01-01-2025', 'REF123', 'Test'])).toBeNull();
    });

    it('parses a valid credit transaction', () => {
      // [date, reference, narration, moneyIn, moneyOut, balance]
      const row = [
        '15-11-2025',
        '1234567890',
        'OneBank Transfer from John to Jane',
        '50,000.00',
        '-',
        '150,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.bankSource).toBe(BankType.Sterling);
      expect(result!.amount).toBe(5000000);
      expect(result!.category).toBe(TransactionCategory.Inflow);
    });

    it('parses a valid debit transaction', () => {
      const row = [
        '20-12-2025',
        '0987654321',
        'Transfer to external account',
        '-',
        '25,000.00',
        '125,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.amount).toBe(-2500000);
      expect(result!.category).toBe(TransactionCategory.Outflow);
    });

    it('parses OneBank transfer and extracts counterparty', () => {
      const row = [
        '15-11-2025',
        'REF123',
        'OneBank Transfer from John Doe to Jane Smith',
        '10,000.00',
        '-',
        '110,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
      expect(result!.meta?.counterpartyName).toBe('Jane Smith');
      expect(result!.meta?.counterpartyBank).toBe('Sterling Bank');
    });

    it('parses BANKNIP transfer', () => {
      const row = [
        '15-11-2025',
        'REF123',
        'BANKNIP From Account SENDER: JOHN DOE REMARK: Payment',
        '10,000.00',
        '-',
        '120,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
      expect(result!.meta?.counterpartyName).toBe('JOHN DOE');
    });

    it('parses NIP transfer', () => {
      const row = [
        '15-11-2025',
        'REF123',
        'NIP transfer to Account',
        '-',
        '5,000.00',
        '115,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
    });

    it('parses airtime transaction', () => {
      const row = [
        '10-01-2025',
        'AIR001',
        'USSDAirtime Purchase to Mobile 08012345678',
        '-',
        '1,000.00',
        '114,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Airtime);
    });

    it('parses data purchase', () => {
      const row = [
        '15-01-2025',
        'DATA001',
        'Data purchase for 08012345678',
        '-',
        '2,000.00',
        '112,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Airtime);
    });

    it('parses POS purchase', () => {
      const row = [
        '20-01-2025',
        'POS001',
        'POS Purchase from SHOPRITE',
        '-',
        '15,000.00',
        '97,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.CardPayment);
    });

    it('parses web purchase', () => {
      const row = [
        '25-01-2025',
        'WEB001',
        'Web Purchase Online Store',
        '-',
        '5,000.00',
        '92,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.CardPayment);
    });

    it('parses bill payment', () => {
      const row = [
        '28-01-2025',
        'BILL001',
        'Bill Payment DSTV Subscription',
        '-',
        '8,000.00',
        '84,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BillPayment);
    });

    it('parses SMS notification charge', () => {
      const row = [
        '01-02-2025',
        'SMS001',
        'SMS Notification Charge',
        '-',
        '100.00',
        '83,900.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses government levy', () => {
      const row = [
        '01-02-2025',
        'LEV001',
        'GOVT Levy',
        '-',
        '50.00',
        '83,850.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses EMT charge', () => {
      const row = [
        '05-02-2025',
        'EMT001',
        'EMT Charge',
        '-',
        '50.00',
        '83,800.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses Remita transaction', () => {
      const row = [
        '10-02-2025',
        'REM001',
        'REMITASTP Payment',
        '-',
        '10,000.00',
        '73,800.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
    });

    it('parses reversal transaction', () => {
      const row = [
        '15-02-2025',
        'REV001',
        'Reversal of failed payment',
        '5,000.00',
        '-',
        '78,800.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Reversal);
    });

    it('parses interest transaction', () => {
      const row = [
        '28-02-2025',
        'INT001',
        'Monthly Interest Credit',
        '150.00',
        '-',
        '78,950.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Interest);
    });

    it('returns null for invalid date', () => {
      const row = [
        'Invalid',
        'REF123',
        'Test',
        '1,000.00',
        '-',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row);
      expect(result).toBeNull();
    });

    it('returns null when no valid amount', () => {
      const row = [
        '01-01-2025',
        'REF123',
        'Test',
        '-',
        '-',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row);
      expect(result).toBeNull();
    });

    it('stores balance after in meta', () => {
      const row = [
        '01-01-2025',
        'REF123',
        'Test',
        '1,000.00',
        '-',
        '101,000.00',
      ];

      const result = parser.parseTransaction(row);
      expect(result!.meta?.balanceAfter).toBe(10100000);
    });

    it('stores reference as sessionId', () => {
      const row = [
        '01-01-2025',
        '1234567890',
        'Test',
        '1,000.00',
        '-',
        '101,000.00',
      ];

      const result = parser.parseTransaction(row);
      expect(result!.meta?.sessionId).toBe('1234567890');
    });

    it('generates unique IDs', () => {
      const row1 = ['01-01-2025', 'REF001', 'Transaction 1', '1,000.00', '-', '100,000.00'];
      const row2 = ['01-01-2025', 'REF002', 'Transaction 2', '2,000.00', '-', '102,000.00'];

      const result1 = parser.parseTransaction(row1);
      const result2 = parser.parseTransaction(row2);

      expect(result1!.id).not.toBe(result2!.id);
      expect(result1!.id).toMatch(/^sterling-/);
    });
  });

  describe('bankName', () => {
    it('returns Sterling', () => {
      expect(parser.bankName).toBe('Sterling');
    });
  });
});
