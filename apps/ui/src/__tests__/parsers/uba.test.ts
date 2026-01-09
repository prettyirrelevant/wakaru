import { describe, it, expect } from 'vitest';
import { UbaParser } from '~/lib/parsers/uba';
import { BankType, TransactionCategory, TransactionType } from '~/types';

describe('UbaParser', () => {
  const parser = new UbaParser();

  describe('parseTransaction', () => {
    it('returns null for empty row', () => {
      expect(parser.parseTransaction([])).toBeNull();
    });

    it('returns null for row with less than 6 columns', () => {
      expect(parser.parseTransaction(['01-Jan-2025', '01-Jan-2025', 'Test'])).toBeNull();
    });

    it('parses a valid credit transaction', () => {
      // [transDate, valueDate, narration, debit, credit, balance]
      const row = [
        '15-Nov-2025',
        '15-Nov-2025',
        'MOB/UTO/John Doe/Payment/123456',
        '',
        '50,000.00',
        '150,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.bankSource).toBe(BankType.UBA);
      expect(result!.amount).toBe(5000000);
      expect(result!.category).toBe(TransactionCategory.Inflow);
    });

    it('parses a valid debit transaction', () => {
      const row = [
        '20-Dec-2025',
        '20-Dec-2025',
        'TNF-Jane Smith/Transfer',
        '25,000.00',
        '',
        '125,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.amount).toBe(-2500000);
      expect(result!.category).toBe(TransactionCategory.Outflow);
    });

    it('parses MOB/UTO transfer and extracts counterparty', () => {
      const row = [
        '15-Nov-2025',
        '15-Nov-2025',
        'MOB/UTO/John Doe/Salary Payment/123456',
        '',
        '10,000.00',
        '110,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
      expect(result!.meta?.counterpartyName).toBe('John Doe');
      expect(result!.meta?.narration).toBe('Salary Payment');
    });

    it('parses MOB/SATU transfer', () => {
      const row = [
        '15-Nov-2025',
        '15-Nov-2025',
        'MOB/SATU/1234567890/Payment',
        '',
        '5,000.00',
        '115,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
      expect(result!.meta?.counterpartyAccount).toBe('1234567890');
    });

    it('parses TNF transfer', () => {
      const row = [
        '15-Nov-2025',
        '15-Nov-2025',
        'TNF-Jane Smith/Monthly Payment',
        '10,000.00',
        '',
        '105,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
      expect(result!.meta?.counterpartyName).toBe('Jane Smith');
      expect(result!.meta?.narration).toBe('Monthly Payment');
    });

    it('parses Transfer from', () => {
      const row = [
        '15-Nov-2025',
        '15-Nov-2025',
        './Transfer from John Doe',
        '',
        '10,000.00',
        '115,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
      expect(result!.meta?.counterpartyName).toBe('John Doe');
    });

    it('parses POS purchase', () => {
      const row = [
        '10-Jan-2025',
        '10-Jan-2025',
        'POS Pur @ T123 SHOPRITE 456789',
        '5,000.00',
        '',
        '110,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.CardPayment);
      expect(result!.meta?.counterpartyName).toBe('SHOPRITE');
    });

    it('parses POS transfer', () => {
      const row = [
        '15-Jan-2025',
        '15-Jan-2025',
        'POS Trf @ T123 MERCHANT 789012',
        '10,000.00',
        '',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.CardPayment);
    });

    it('parses ATM withdrawal', () => {
      const row = [
        '20-Jan-2025',
        '20-Jan-2025',
        'ATM WD @ LAGOS-UBA ATM',
        '20,000.00',
        '',
        '80,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.AtmWithdrawal);
    });

    it('parses USSD airtime topup', () => {
      const row = [
        '25-Jan-2025',
        '25-Jan-2025',
        'USSD TOPUP 08012345678',
        '1,000.00',
        '',
        '79,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Airtime);
    });

    it('parses MOB airtime topup', () => {
      const row = [
        '26-Jan-2025',
        '26-Jan-2025',
        'MOB TOPUP 08087654321',
        '500.00',
        '',
        '78,500.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Airtime);
    });

    it('parses stamp duty charge', () => {
      const row = [
        '01-Feb-2025',
        '01-Feb-2025',
        'Stamp Duty Charge',
        '50.00',
        '',
        '78,450.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses SMS charge', () => {
      const row = [
        '01-Feb-2025',
        '01-Feb-2025',
        'SMS Notification Fee',
        '100.00',
        '',
        '78,350.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses card maintenance charge', () => {
      const row = [
        '05-Feb-2025',
        '05-Feb-2025',
        'Card Maint Fee',
        '500.00',
        '',
        '77,850.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses interest payment', () => {
      const row = [
        '28-Feb-2025',
        '28-Feb-2025',
        'INT. PD on Savings',
        '',
        '150.00',
        '78,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Interest);
    });

    it('parses reversal', () => {
      const row = [
        '10-Feb-2025',
        '10-Feb-2025',
        'REV/Failed Transfer Reversal',
        '',
        '5,000.00',
        '83,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Reversal);
    });

    it('parses direct debit', () => {
      const row = [
        '15-Feb-2025',
        '15-Feb-2025',
        'PSTKDIRECTDEBIT Insurance',
        '10,000.00',
        '',
        '73,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BillPayment);
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

      const result = parser.parseTransaction(row);
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

      const result = parser.parseTransaction(row);
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

      const result = parser.parseTransaction(row);
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

      const result = parser.parseTransaction(row);
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

        const result = parser.parseTransaction(row);
        expect(result).not.toBeNull();

        const date = new Date(result!.date);
        expect(date.getUTCMonth()).toBe(index);
      });
    });

    it('generates unique IDs', () => {
      const row1 = ['01-Jan-2025', '01-Jan-2025', 'Transaction 1', '', '1,000.00', '100,000.00'];
      const row2 = ['01-Jan-2025', '01-Jan-2025', 'Transaction 2', '', '2,000.00', '102,000.00'];

      const result1 = parser.parseTransaction(row1);
      const result2 = parser.parseTransaction(row2);

      expect(result1!.id).not.toBe(result2!.id);
      expect(result1!.id).toMatch(/^uba-/);
    });
  });

  describe('bankName', () => {
    it('returns UBA', () => {
      expect(parser.bankName).toBe('UBA');
    });
  });
});
