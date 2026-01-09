import { describe, it, expect } from 'vitest';
import { GtbParser } from '~/lib/parsers/gtb';
import { BankType, TransactionCategory, TransactionType } from '~/types';

describe('GtbParser', () => {
  const parser = new GtbParser();

  describe('parseTransaction', () => {
    it('returns null for empty row', () => {
      expect(parser.parseTransaction([])).toBeNull();
    });

    it('returns null for row with less than 7 columns', () => {
      expect(parser.parseTransaction(['01-Jan-2025', '01-Jan-2025', 'REF123'])).toBeNull();
    });

    it('parses a valid credit transaction', () => {
      // [transDate, valueDate, reference, debit, credit, balance, remarks]
      const row = [
        '15-Nov-2025',
        '15-Nov-2025',
        'REF123456',
        '',
        '50,000.00',
        '150,000.00',
        'NIP TRANSFER TO OPAY - JOHN DOE',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.bankSource).toBe(BankType.GTB);
      expect(result!.amount).toBe(5000000); // 50,000 * 100 kobo
      expect(result!.category).toBe(TransactionCategory.Inflow);
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
    });

    it('parses a valid debit transaction', () => {
      const row = [
        '20-Dec-2025',
        '20-Dec-2025',
        'REF789012',
        '25,000.00',
        '',
        '125,000.00',
        'NIP TRANSFER TO KUDA - JANE SMITH',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.amount).toBe(-2500000); // -25,000 * 100 kobo
      expect(result!.category).toBe(TransactionCategory.Outflow);
    });

    it('parses airtime transaction', () => {
      const row = [
        '10-Jan-2025',
        '10-Jan-2025',
        'AIR001',
        '1,000.00',
        '',
        '124,000.00',
        'Airtime purchase-08012345678',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Airtime);
    });

    it('parses bank charge transaction', () => {
      const row = [
        '01-Feb-2025',
        '01-Feb-2025',
        'CHG001',
        '50.00',
        '',
        '123,950.00',
        'Electronic Money Transfer Levy',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses SMS alert charge', () => {
      const row = [
        '01-Feb-2025',
        '01-Feb-2025',
        'SMS001',
        '100.00',
        '',
        '123,850.00',
        'SMS ALERT CHARGES',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses POS transaction', () => {
      const row = [
        '05-Mar-2025',
        '05-Mar-2025',
        'POS001',
        '15,000.00',
        '',
        '108,850.00',
        'POSWEB PURCHASE-12345-SHOP-CHICKEN REPUBLIC',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.CardPayment);
    });

    it('parses ATM withdrawal', () => {
      const row = [
        '10-Mar-2025',
        '10-Mar-2025',
        'ATM001',
        '20,000.00',
        '',
        '88,850.00',
        'ATM CASH WITHDRAWAL',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.AtmWithdrawal);
    });

    it('parses reversal transaction', () => {
      const row = [
        '15-Mar-2025',
        '15-Mar-2025',
        'REV001',
        '',
        '5,000.00',
        '93,850.00',
        'Reversal of failed transaction',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Reversal);
    });

    it('parses interest credit', () => {
      const row = [
        '31-Mar-2025',
        '31-Mar-2025',
        'INT001',
        '',
        '150.00',
        '94,000.00',
        'INTEREST CREDIT',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Interest);
    });

    it('extracts counterparty from NIP transfer', () => {
      const row = [
        '15-Nov-2025',
        '15-Nov-2025',
        'REF123',
        '10,000.00',
        '',
        '84,000.00',
        'NIP TRANSFER TO OPAY - JOHN DOE',
      ];

      const result = parser.parseTransaction(row);

      expect(result!.meta?.counterpartyBank).toBe('OPay');
      expect(result!.meta?.counterpartyName).toBe('JOHN DOE');
    });

    it('extracts counterparty from transfer with bank code', () => {
      const row = [
        '15-Nov-2025',
        '15-Nov-2025',
        'REF123',
        '',
        '10,000.00',
        '94,000.00',
        'TRANSFER FROM PALMPAY - JANE SMITH',
      ];

      const result = parser.parseTransaction(row);

      expect(result!.meta?.counterpartyBank).toBe('PalmPay');
      expect(result!.meta?.counterpartyName).toBe('JANE SMITH');
    });

    it('returns null for invalid date format', () => {
      const row = [
        'Invalid Date',
        'Invalid',
        'REF123',
        '',
        '1,000.00',
        '100,000.00',
        'Some remarks',
      ];

      const result = parser.parseTransaction(row);
      expect(result).toBeNull();
    });

    it('returns null when no valid amount', () => {
      const row = [
        '15-Nov-2025',
        '15-Nov-2025',
        'REF123',
        '',
        '',
        '100,000.00',
        'Some remarks',
      ];

      const result = parser.parseTransaction(row);
      expect(result).toBeNull();
    });

    it('handles all month abbreviations', () => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      months.forEach((month, index) => {
        const row = [
          `15-${month}-2025`,
          `15-${month}-2025`,
          'REF001',
          '',
          '1,000.00',
          '100,000.00',
          'Test transaction',
        ];

        const result = parser.parseTransaction(row);
        expect(result).not.toBeNull();

        const date = new Date(result!.date);
        expect(date.getUTCMonth()).toBe(index);
      });
    });

    it('stores balance after in meta', () => {
      const row = [
        '15-Nov-2025',
        '15-Nov-2025',
        'REF123',
        '',
        '1,000.00',
        '101,000.00',
        'Test',
      ];

      const result = parser.parseTransaction(row);
      expect(result!.meta?.balanceAfter).toBe(10100000); // 101,000 * 100
    });

    it('stores value date as sessionId', () => {
      const row = [
        '15-Nov-2025',
        '16-Nov-2025',
        'REF123',
        '',
        '1,000.00',
        '101,000.00',
        'Test',
      ];

      const result = parser.parseTransaction(row);
      expect(result!.meta?.sessionId).toBe('16-Nov-2025');
    });

    it('generates unique IDs for different transactions', () => {
      const row1 = [
        '15-Nov-2025',
        '15-Nov-2025',
        'REF001',
        '',
        '1,000.00',
        '100,000.00',
        'Transaction 1',
      ];
      const row2 = [
        '15-Nov-2025',
        '15-Nov-2025',
        'REF002',
        '',
        '2,000.00',
        '102,000.00',
        'Transaction 2',
      ];

      const result1 = parser.parseTransaction(row1);
      const result2 = parser.parseTransaction(row2);

      expect(result1!.id).not.toBe(result2!.id);
      expect(result1!.id).toMatch(/^gtb-/);
      expect(result2!.id).toMatch(/^gtb-/);
    });
  });

  describe('extractRowsFromPdfText', () => {
    it('extracts rows from PDF text with transactions', () => {
      const pdfText = `
        Opening Balance 100,000.00
        15-Nov-2025 15-Nov-2025 REF123 1,000.00 101,000.00 E-CHANNELS NIP TRANSFER TO OPAY
        16-Nov-2025 16-Nov-2025 REF124 500.00 100,500.00 E-CHANNELS SMS ALERT
      `;

      const rows = GtbParser.extractRowsFromPdfText(pdfText);

      expect(rows.length).toBeGreaterThan(0);
    });

    it('returns empty array for text without transactions', () => {
      const pdfText = 'No transaction data here';
      const rows = GtbParser.extractRowsFromPdfText(pdfText);
      expect(rows).toEqual([]);
    });

    it('removes computer generated footer text', () => {
      const pdfText = `
        Opening Balance 100,000.00
        This is a computer generated Email. Please contact your local branch.123.
        15-Nov-2025 15-Nov-2025 REF123 1,000.00 101,000.00 E-CHANNELS Test
      `;

      const rows = GtbParser.extractRowsFromPdfText(pdfText);
      // Should still parse the transaction
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe('bankName', () => {
    it('returns GTB', () => {
      expect(parser.bankName).toBe('GTB');
    });
  });
});
