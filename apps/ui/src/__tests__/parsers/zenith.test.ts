import { describe, it, expect } from 'vitest';
import { ZenithParser } from '~/lib/parsers/zenith';
import { BankType, TransactionCategory, TransactionType } from '~/types';

describe('ZenithParser', () => {
  const parser = new ZenithParser();

  describe('parseTransaction', () => {
    it('returns null for empty row', () => {
      expect(parser.parseTransaction([], 0)).toBeNull();
    });

    it('returns null for row with less than 4 columns', () => {
      expect(parser.parseTransaction(['01/01/2025', 'Test', '1000'], 0)).toBeNull();
    });

    it('parses a valid credit transaction', () => {
      // [date, description, debit, credit, valueDate, balance]
      const row = [
        '15/11/2025',
        'NIP/ACCESS/John Doe/Payment for services',
        '0.00',
        '50,000.00',
        '15/11/2025',
        '150,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.bankSource).toBe(BankType.Zenith);
      expect(result!.amount).toBe(5000000); // 50,000 * 100 kobo
      expect(result!.category).toBe(TransactionCategory.Inflow);
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
      expect(result!.meta?.counterpartyBank).toBe('ACCESS');
      expect(result!.meta?.counterpartyName).toBe('John Doe');
    });

    it('parses a valid debit transaction', () => {
      const row = [
        '20/12/2025',
        'NIP CR/MOB/Jane Smith/OPay/Transfer',
        '25,000.00',
        '0.00',
        '20/12/2025',
        '125,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.amount).toBe(-2500000);
      expect(result!.category).toBe(TransactionCategory.Outflow);
      expect(result!.meta?.counterpartyName).toBe('Jane Smith');
      expect(result!.meta?.counterpartyBank).toBe('OPay');
    });

    it('parses POS transaction', () => {
      const row = [
        '10/01/2025',
        'POS PRCH at CHICKEN REPUBLIC',
        '5,000.00',
        '0.00',
        '10/01/2025',
        '120,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.CardPayment);
    });

    it('parses ATM withdrawal', () => {
      const row = [
        '15/01/2025',
        'ATM WDL at ZENITH BANK ATM',
        '20,000.00',
        '0.00',
        '15/01/2025',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.AtmWithdrawal);
    });

    it('parses agency cashout', () => {
      const row = [
        '16/01/2025',
        'Agency Cashout',
        '10,000.00',
        '0.00',
        '16/01/2025',
        '90,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.AtmWithdrawal);
    });

    it('parses airtime purchase', () => {
      const row = [
        '20/01/2025',
        'Airtime//08012345678//MTN',
        '1,000.00',
        '0.00',
        '20/01/2025',
        '89,000.00',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Airtime);
      expect(result!.meta?.counterpartyName).toBe('MTN');
    });

    it('parses bank charge', () => {
      const row = [
        '25/01/2025',
        'NIP Charge + VAT',
        '52.50',
        '0.00',
        '25/01/2025',
        '88,947.50',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses SMS charge', () => {
      const row = [
        '01/02/2025',
        'SMS Charge for January',
        '100.00',
        '0.00',
        '01/02/2025',
        '88,847.50',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses reversal', () => {
      const row = [
        '05/02/2025',
        'RVSL for failed transaction',
        '0.00',
        '5,000.00',
        '05/02/2025',
        '93,847.50',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Reversal);
    });

    it('parses ETZ inflow', () => {
      const row = [
        '10/02/2025',
        ':ETZ INFLOW John Doe:Salary payment',
        '0.00',
        '100,000.00',
        '10/02/2025',
        '193,847.50',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
    });

    it('parses CIP transfer', () => {
      const row = [
        '15/02/2025',
        'CIP/CR//Transfer from Jane Smith',
        '0.00',
        '10,000.00',
        '15/02/2025',
        '203,847.50',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
      expect(result!.meta?.counterpartyName).toBe('Jane Smith');
    });

    it('parses Paystack transfer', () => {
      const row = [
        '20/02/2025',
        'NIP//Paystack/ACME Corp/Order 12345',
        '0.00',
        '15,000.00',
        '20/02/2025',
        '218,847.50',
      ];

      const result = parser.parseTransaction(row, 0);

      expect(result).not.toBeNull();
      expect(result!.meta?.counterpartyName).toBe('ACME Corp');
    });

    it('returns null for invalid date', () => {
      const row = [
        'Invalid',
        'Test transaction',
        '0.00',
        '1,000.00',
        '01/01/2025',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row, 0);
      expect(result).toBeNull();
    });

    it('returns null when no valid amount', () => {
      const row = [
        '01/01/2025',
        'Test transaction',
        '0.00',
        '0.00',
        '01/01/2025',
        '100,000.00',
      ];

      const result = parser.parseTransaction(row, 0);
      expect(result).toBeNull();
    });

    it('stores balance after in meta', () => {
      const row = [
        '01/01/2025',
        'Test',
        '0.00',
        '1,000.00',
        '01/01/2025',
        '101,000.00',
      ];

      const result = parser.parseTransaction(row, 0);
      expect(result!.meta?.balanceAfter).toBe(10100000);
    });

    it('generates unique IDs', () => {
      const row1 = ['01/01/2025', 'Transaction 1', '0.00', '1,000.00', '01/01/2025', '100,000.00'];
      const row2 = ['01/01/2025', 'Transaction 2', '0.00', '2,000.00', '01/01/2025', '102,000.00'];

      const result1 = parser.parseTransaction(row1, 0);
      const result2 = parser.parseTransaction(row2, 1);

      expect(result1!.id).not.toBe(result2!.id);
      expect(result1!.id).toMatch(/^zenith-/);
    });
  });

  describe('extractRowsFromPdfText', () => {
    it('extracts rows from PDF text', () => {
      const pdfText = `
        01/01/2025 Test transaction 1,000.00 0.00 01/01/2025 100,000.00
        02/01/2025 Another transaction 0.00 500.00 02/01/2025 100,500.00
      `;

      const rows = ZenithParser.extractRowsFromPdfText(pdfText);
      expect(rows.length).toBe(2);
    });

    it('skips header rows', () => {
      const pdfText = `
        01/01/2025 CURRENCY NGN 0.00 0.00 01/01/2025 0.00
        01/01/2025 Test transaction 1,000.00 0.00 01/01/2025 100,000.00
      `;

      const rows = ZenithParser.extractRowsFromPdfText(pdfText);
      expect(rows.length).toBe(1);
    });

    it('removes period header', () => {
      const pdfText = `
        Period: 01/01/2025 TO 31/01/2025
        01/01/2025 Test transaction 1,000.00 0.00 01/01/2025 100,000.00
      `;

      const rows = ZenithParser.extractRowsFromPdfText(pdfText);
      expect(rows.length).toBe(1);
    });
  });

  describe('bankName', () => {
    it('returns Zenith', () => {
      expect(parser.bankName).toBe('Zenith');
    });
  });
});
