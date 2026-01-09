import { describe, it, expect } from 'vitest';
import { PalmPayParser } from '~/lib/parsers/palmpay';
import { BankType, TransactionCategory, TransactionType } from '~/types';

describe('PalmPayParser', () => {
  const parser = new PalmPayParser();

  describe('parseTransaction', () => {
    it('returns null for empty row', () => {
      expect(parser.parseTransaction([])).toBeNull();
    });

    it('returns null for row with less than 3 columns', () => {
      expect(parser.parseTransaction(['12/29/2025 06:19:00 AM Test', '+1000'])).toBeNull();
    });

    it('parses a valid credit transaction', () => {
      // Format: [dateTimeAndDescription, amount, transactionId]
      const row = [
        '12/29/2025 06:19:00 AM Received from John Doe',
        '+50,000.00',
        'TX123456',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.bankSource).toBe(BankType.PalmPay);
      expect(result!.amount).toBe(5000000); // 50,000 * 100 kobo
      expect(result!.category).toBe(TransactionCategory.Inflow);
      expect(result!.reference).toBe('TX123456');
    });

    it('parses a valid debit transaction', () => {
      const row = [
        '12/30/2025 02:30:00 PM Send to Jane Smith',
        '-25,000.00',
        'TX789012',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.amount).toBe(-2500000);
      expect(result!.category).toBe(TransactionCategory.Outflow);
    });

    it('parses received from and extracts counterparty', () => {
      const row = [
        '12/29/2025 10:00:00 AM Received from John Doe',
        '+10,000.00',
        'TX001',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
      expect(result!.meta?.counterpartyName).toBe('John Doe');
    });

    it('parses send to and extracts counterparty', () => {
      const row = [
        '12/29/2025 11:00:00 AM Send to Jane Smith',
        '-5,000.00',
        'TX002',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
      expect(result!.meta?.counterpartyName).toBe('Jane Smith');
    });

    it('parses CashBox Interest transaction', () => {
      const row = [
        '12/29/2025 06:19:00 AM CashBox Interest',
        '+100.00',
        'INT001',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Interest);
    });

    it('parses airtime transaction', () => {
      const row = [
        '12/29/2025 12:00:00 PM Airtime Purchase MTN',
        '-1,000.00',
        'AIR001',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Airtime);
    });

    it('parses bill payment', () => {
      const row = [
        '12/29/2025 01:00:00 PM Bill Payment DSTV',
        '-8,000.00',
        'BILL001',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BillPayment);
    });

    it('parses bank charge', () => {
      const row = [
        '12/29/2025 00:00:00 AM Transfer Fee Charge',
        '-50.00',
        'CHG001',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses levy', () => {
      const row = [
        '12/29/2025 00:00:00 AM EMT Levy',
        '-50.00',
        'LEV001',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses reversal transaction', () => {
      const row = [
        '12/29/2025 03:00:00 PM Reversal for failed transfer',
        '+5,000.00',
        'REV001',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Reversal);
    });

    it('parses POS transaction', () => {
      const row = [
        '12/29/2025 04:00:00 PM POS Purchase at Shoprite',
        '-15,000.00',
        'POS001',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.CardPayment);
    });

    it('parses withdrawal transaction', () => {
      const row = [
        '12/29/2025 05:00:00 PM Cash Withdrawal',
        '-20,000.00',
        'WD001',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.AtmWithdrawal);
    });

    it('returns null for invalid date', () => {
      const row = [
        'Invalid Date Format',
        '+1,000.00',
        'TX001',
      ];

      const result = parser.parseTransaction(row);
      expect(result).toBeNull();
    });

    it('handles AM/PM correctly', () => {
      const rowAM = ['12/29/2025 11:30:00 AM Test', '+1,000.00', 'TX001'];
      const rowPM = ['12/29/2025 11:30:00 PM Test', '+1,000.00', 'TX002'];
      const row12AM = ['12/29/2025 12:30:00 AM Test', '+1,000.00', 'TX003'];
      const row12PM = ['12/29/2025 12:30:00 PM Test', '+1,000.00', 'TX004'];

      const resultAM = parser.parseTransaction(rowAM);
      const resultPM = parser.parseTransaction(rowPM);
      const result12AM = parser.parseTransaction(row12AM);
      const result12PM = parser.parseTransaction(row12PM);

      expect(resultAM).not.toBeNull();
      expect(resultPM).not.toBeNull();
      expect(result12AM).not.toBeNull();
      expect(result12PM).not.toBeNull();

      const dateAM = new Date(resultAM!.date);
      const datePM = new Date(resultPM!.date);
      const date12AM = new Date(result12AM!.date);
      const date12PM = new Date(result12PM!.date);

      expect(dateAM.getHours()).toBe(11);
      expect(datePM.getHours()).toBe(23);
      expect(date12AM.getHours()).toBe(0);
      expect(date12PM.getHours()).toBe(12);
    });

    it('generates unique IDs', () => {
      const row1 = ['12/29/2025 06:19:00 AM Transaction 1', '+1,000.00', 'TX001'];
      const row2 = ['12/29/2025 06:19:01 AM Transaction 2', '+2,000.00', 'TX002'];

      const result1 = parser.parseTransaction(row1);
      const result2 = parser.parseTransaction(row2);

      expect(result1!.id).not.toBe(result2!.id);
      expect(result1!.id).toMatch(/^palmpay-/);
    });

    it('generates reference when not provided', () => {
      const row = ['12/29/2025 06:19:00 AM Test', '+1,000.00', ''];

      const result = parser.parseTransaction(row);
      expect(result).not.toBeNull();
      expect(result!.reference).toBeTruthy();
    });

    it('parses row with 4+ columns (Excel format)', () => {
      // [date, description, moneyIn, moneyOut, transactionId]
      const row = [
        '12/29/2025 06:19:00 AM',
        'Received from John',
        '50,000.00',
        '',
        'TX123',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.amount).toBe(5000000);
    });
  });

  describe('bankName', () => {
    it('returns PalmPay', () => {
      expect(parser.bankName).toBe('PalmPay');
    });
  });
});
