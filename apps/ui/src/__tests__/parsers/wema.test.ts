import { describe, it, expect } from 'vitest';
import { WemaParser } from '~/lib/parsers/wema';
import { BankType, TransactionCategory, TransactionType } from '~/types';

describe('WemaParser', () => {
  const parser = new WemaParser();

  describe('parseTransaction', () => {
    it('returns null for empty row', () => {
      expect(parser.parseTransaction([], 0)).toBeNull();
    });

    it('returns null for row with less than 4 columns', () => {
      expect(parser.parseTransaction(['15-Nov-2025', 'REF123', 'Test'], 0)).toBeNull();
    });

    it('parses a valid credit transaction', () => {
      // [date, reference, description, amount, isCredit]
      const row = ['15-Nov-2025', 'M123456', 'NIP:John Doe-Payment', '50,000.00', 'credit'];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.bankSource).toBe(BankType.Wema);
      expect(result!.amount).toBe(5000000); // 50,000 * 100 kobo
      expect(result!.category).toBe(TransactionCategory.Inflow);
      expect(result!.reference).toBe('M123456');
    });

    it('parses a valid debit transaction', () => {
      const row = ['20-Dec-2025', 'A789012', 'NIP Transfer to Jane', '25,000.00', 'debit'];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.amount).toBe(-2500000);
      expect(result!.category).toBe(TransactionCategory.Outflow);
    });

    it('parses NIP transfer and extracts counterparty', () => {
      const row = ['15-Nov-2025', 'REF123', 'NIP:John Doe-Transfer', '10,000.00', 'credit'];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
      expect(result!.meta?.counterpartyName).toBe('John Doe');
    });

    it('parses ALAT NIP transfer', () => {
      const row = ['15-Nov-2025', 'REF123', 'ALAT NIP to John Doe', '10,000.00', 'debit'];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
    });

    it('parses transfer to and extracts counterparty', () => {
      const row = ['15-Nov-2025', 'REF123', 'TRANSFER TO Jane Smith FROM Account', '5,000.00', 'debit'];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.counterpartyName).toBe('Jane Smith');
    });

    it('parses bank charge (VAT)', () => {
      const row = ['01-Jan-2025', 'VAT001', 'VAT on Transfer', '50.00', 'debit'];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses bank charge (Commission)', () => {
      const row = ['01-Jan-2025', 'COMM01', 'COMM on Transaction', '100.00', 'debit'];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses SMS alert charge', () => {
      const row = ['01-Jan-2025', 'SMS001', 'SMS Alert Charge', '25.00', 'debit'];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses levy charge', () => {
      const row = ['01-Jan-2025', 'LEV001', 'Electronic Money Transfer Levy', '50.00', 'debit'];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses POS transaction', () => {
      const row = ['05-Feb-2025', 'POS001', 'POS BUY at SHOPRITE', '15,000.00', 'debit'];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.CardPayment);
    });

    it('parses WEB transaction', () => {
      const row = ['05-Feb-2025', 'WEB001', 'WEB BUY at AMAZON', '5,000.00', 'debit'];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.CardPayment);
    });

    it('parses airtime transaction', () => {
      const row = ['10-Feb-2025', 'AIR001', 'Airtime Purchase MTN', '1,000.00', 'debit'];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Airtime);
    });

    it('parses reversal transaction', () => {
      const row = ['15-Feb-2025', 'REV001', 'Reversal of failed transfer', '5,000.00', 'credit'];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Reversal);
    });

    it('returns null for invalid date', () => {
      const row = ['Invalid', 'REF123', 'Test', '1,000.00', 'credit'];

      const result = parser.parseTransaction(row, 0);
      expect(result).toBeNull();
    });

    it('handles all month abbreviations', () => {
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

      months.forEach((month, index) => {
        const row = [`15-${month}-2025`, 'REF001', 'Test', '1,000.00', 'credit'];

        const result = parser.parseTransaction(row, 0);
        expect(result).not.toBeNull();

        const date = new Date(result!.date);
        expect(date.getMonth()).toBe(index);
      });
    });

    it('generates unique IDs', () => {
      const row1 = ['01-Jan-2025', 'REF001', 'Transaction 1', '1,000.00', 'credit'];
      const row2 = ['01-Jan-2025', 'REF002', 'Transaction 2', '2,000.00', 'credit'];

      const result1 = parser.parseTransaction(row1, 0);
      const result2 = parser.parseTransaction(row2, 1);

      expect(result1!.id).not.toBe(result2!.id);
      expect(result1!.id).toMatch(/^wema-/);
    });

    it('generates reference when not provided', () => {
      const row = ['01-Jan-2025', '', 'Test transaction', '1,000.00', 'credit'];

      const result = parser.parseTransaction(row, 0);
      expect(result).not.toBeNull();
      expect(result!.reference).toBeTruthy();
    });
  });

  describe('bankName', () => {
    it('returns Wema', () => {
      expect(parser.bankName).toBe('Wema');
    });
  });
});
