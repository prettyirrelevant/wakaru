import { describe, it, expect } from 'vitest';
import { AccessParser } from '~/lib/parsers/access';
import { BankType, TransactionCategory, TransactionType } from '~/types';

describe('AccessParser', () => {
  const parser = new AccessParser();

  describe('parseTransaction', () => {
    it('returns null for empty row', () => {
      expect(parser.parseTransaction([])).toBeNull();
    });

    it('returns null for row with less than 6 columns', () => {
      expect(parser.parseTransaction(['01-JAN-25', '01-JAN-25', 'Test'])).toBeNull();
    });

    it('parses a valid credit transaction', () => {
      // [postedDate, valueDate, description, debit, credit, balance]
      const row = [
        '15-NOV-25',
        '15-NOV-25',
        'NIP TFR FROM John Doe',
        '-',
        '50,000.00',
        '150,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.bankSource).toBe(BankType.Access);
      expect(result!.amount).toBe(5000000); // 50,000 * 100 kobo
      expect(result!.category).toBe(TransactionCategory.Inflow);
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
      expect(result!.meta?.counterpartyName).toBe('John Doe');
    });

    it('parses a valid debit transaction', () => {
      const row = [
        '20-DEC-25',
        '20-DEC-25',
        'MOBILE TRF TO GTB/ 1234567890/ Jane Smith',
        '25,000.00',
        '-',
        '125,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.amount).toBe(-2500000);
      expect(result!.category).toBe(TransactionCategory.Outflow);
      expect(result!.meta?.counterpartyBank).toBe('GTB');
      expect(result!.meta?.counterpartyName).toBe('Jane Smith');
    });

    it('parses mobile transfer to OPay', () => {
      const row = [
        '10-JAN-25',
        '10-JAN-25',
        'MOBILE TRF TO PAY/ Account/ John Doe',
        '10,000.00',
        '-',
        '115,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.counterpartyBank).toBe('OPay');
    });

    it('parses web payment', () => {
      const row = [
        '15-JAN-25',
        '15-JAN-25',
        'WEB PYMT to JUMIA',
        '5,000.00',
        '-',
        '110,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.CardPayment);
    });

    it('parses POS payment', () => {
      const row = [
        '20-JAN-25',
        '20-JAN-25',
        'POS PYMT at SHOPRITE',
        '15,000.00',
        '-',
        '95,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.CardPayment);
    });

    it('parses ATM withdrawal', () => {
      const row = [
        '25-JAN-25',
        '25-JAN-25',
        'ATM CASH WDL at ACCESS BANK ATM',
        '20,000.00',
        '-',
        '75,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.AtmWithdrawal);
    });

    it('parses bill payment', () => {
      const row = [
        '28-JAN-25',
        '28-JAN-25',
        'BILLS PYMT DSTV Subscription',
        '8,000.00',
        '-',
        '67,000.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BillPayment);
    });

    it('parses bank charge (commission)', () => {
      const row = [
        '01-FEB-25',
        '01-FEB-25',
        'Commission on Transfer',
        '50.00',
        '-',
        '66,950.00',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses VAT charge', () => {
      const row = [
        '01-FEB-25',
        '01-FEB-25',
        'VAT on Commission',
        '3.75',
        '-',
        '66,946.25',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses SMS alert fee', () => {
      const row = [
        '05-FEB-25',
        '05-FEB-25',
        'SMS Alert Fee',
        '100.00',
        '-',
        '66,846.25',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses reversal', () => {
      const row = [
        '10-FEB-25',
        '10-FEB-25',
        'Reversal of failed transfer',
        '-',
        '5,000.00',
        '71,846.25',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Reversal);
    });

    it('parses TRF//FRM transfer', () => {
      const row = [
        '15-FEB-25',
        '15-FEB-25',
        'TRF//FRM John Doe TO Jane Smith',
        '-',
        '10,000.00',
        '81,846.25',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
      expect(result!.meta?.counterpartyName).toBe('Jane Smith');
    });

    it('returns null for invalid date', () => {
      const row = [
        'Invalid',
        '01-JAN-25',
        'Test',
        '-',
        '1,000.00',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row);
      expect(result).toBeNull();
    });

    it('returns null when no valid amount', () => {
      const row = [
        '01-JAN-25',
        '01-JAN-25',
        'Test',
        '-',
        '-',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row);
      expect(result).toBeNull();
    });

    it('handles all month abbreviations', () => {
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

      months.forEach((month, index) => {
        const row = [
          `15-${month}-25`,
          `15-${month}-25`,
          'Test',
          '-',
          '1,000.00',
          '100,000.00',
        ];

        const result = parser.parseTransaction(row);
        expect(result).not.toBeNull();

        const date = new Date(result!.date);
        expect(date.getUTCMonth()).toBe(index);
      });
    });

    it('stores balance after in meta', () => {
      const row = [
        '01-JAN-25',
        '01-JAN-25',
        'Test',
        '-',
        '1,000.00',
        '101,000.00',
      ];

      const result = parser.parseTransaction(row);
      expect(result!.meta?.balanceAfter).toBe(10100000);
    });

    it('stores value date as sessionId', () => {
      const row = [
        '01-JAN-25',
        '02-JAN-25',
        'Test',
        '-',
        '1,000.00',
        '101,000.00',
      ];

      const result = parser.parseTransaction(row);
      expect(result!.meta?.sessionId).toBe('02-JAN-25');
    });

    it('generates unique IDs', () => {
      const row1 = ['01-JAN-25', '01-JAN-25', 'Transaction 1', '-', '1,000.00', '100,000.00'];
      const row2 = ['01-JAN-25', '01-JAN-25', 'Transaction 2', '-', '2,000.00', '102,000.00'];

      const result1 = parser.parseTransaction(row1);
      const result2 = parser.parseTransaction(row2);

      expect(result1!.id).not.toBe(result2!.id);
      expect(result1!.id).toMatch(/^access-/);
    });

    it('resolves bank codes correctly', () => {
      const testCases = [
        { code: 'GTB', expected: 'GTB' },
        { code: 'PAY', expected: 'OPay' },
        { code: 'FBN', expected: 'First Bank' },
        { code: 'MMF', expected: 'Moniepoint' },
        { code: 'WBP', expected: 'Wema Bank' },
        { code: 'PPL', expected: 'PalmPay' },
        { code: 'KMF', expected: 'Kuda' },
      ];

      testCases.forEach(({ code, expected }) => {
        const row = [
          '01-JAN-25',
          '01-JAN-25',
          `MOBILE TRF TO ${code}/ Account/ Name`,
          '1,000.00',
          '-',
          '99,000.00',
        ];

        const result = parser.parseTransaction(row);
        expect(result!.meta?.counterpartyBank).toBe(expected);
      });
    });
  });

  describe('extractRowsFromPdfText', () => {
    it('extracts rows from PDF text', () => {
      const pdfText = `
        01-JAN-25 01-JAN-25 Test transaction 1,000.00 - 100,000.00
        02-JAN-25 02-JAN-25 Another transaction - 500.00 100,500.00
      `;

      const rows = AccessParser.extractRowsFromPdfText(pdfText);
      expect(rows.length).toBe(2);
    });

    it('skips header rows', () => {
      const pdfText = `
        01-JAN-25 01-JAN-25 Posted Date Value Date Description 0.00 0.00 0.00
        01-JAN-25 01-JAN-25 Test transaction 1,000.00 - 100,000.00
      `;

      const rows = AccessParser.extractRowsFromPdfText(pdfText);
      expect(rows.length).toBe(1);
    });

    it('skips opening balance row', () => {
      const pdfText = `
        01-JAN-25 01-JAN-25 Opening Balance - - 100,000.00
        02-JAN-25 02-JAN-25 Test transaction 1,000.00 - 99,000.00
      `;

      const rows = AccessParser.extractRowsFromPdfText(pdfText);
      expect(rows.length).toBe(1);
    });
  });

  describe('bankName', () => {
    it('returns Access', () => {
      expect(parser.bankName).toBe('Access');
    });
  });
});
