import { describe, it, expect } from 'vitest';
import { OPayParser } from '~/lib/parsers/opay';
import { BankType, TransactionCategory, TransactionType } from '~/types';

describe('OPayParser', () => {
  const parser = new OPayParser();

  describe('parseTransaction', () => {
    it('returns null for empty row', () => {
      expect(parser.parseTransaction([])).toBeNull();
    });

    it('returns null for row with less than 5 columns', () => {
      expect(parser.parseTransaction(['29 Nov 2025 08:12:51', '29 Nov 2025', 'Test'])).toBeNull();
    });

    it('parses a valid credit transaction', () => {
      // [DateTime, Date, Description, Debit, Credit, Balance, Channel, Reference]
      const row = [
        '29 Nov 2025 08:12:51',
        '29 Nov 2025',
        'Transfer from John Doe | Access Bank | 1234567890 | Payment',
        '--',
        '50,000.00',
        '100,000.00',
        'Mobile',
        'REF123456',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.bankSource).toBe(BankType.OPay);
      expect(result!.amount).toBe(5000000); // 50,000 * 100 kobo
      expect(result!.category).toBe(TransactionCategory.Inflow);
      expect(result!.reference).toBe('REF123456');
      expect(result!.meta?.counterpartyName).toBe('John Doe');
      expect(result!.meta?.counterpartyBank).toBe('Access Bank');
      expect(result!.meta?.counterpartyAccount).toBe('1234567890');
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
    });

    it('parses a valid debit transaction', () => {
      const row = [
        '15 Dec 2025 14:30:00',
        '15 Dec 2025',
        'Transfer to Jane Smith | GTB | 0987654321',
        '25,000.00',
        '--',
        '75,000.00',
        'Mobile',
        'REF789012',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.amount).toBe(-2500000); // -25,000 * 100 kobo (negative for debit)
      expect(result!.category).toBe(TransactionCategory.Outflow);
      expect(result!.meta?.type).toBe(TransactionType.Transfer);
    });

    it('parses airtime purchase transaction', () => {
      const row = [
        '10 Jan 2025 09:00:00',
        '10 Jan 2025',
        'Airtime | 08012345678 | MTN',
        '1,000.00',
        '--',
        '99,000.00',
        'Mobile',
        'AIR123',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.amount).toBe(-100000); // -1,000 * 100 kobo
      expect(result!.meta?.type).toBe(TransactionType.Airtime);
      expect(result!.meta?.counterpartyName).toBe('MTN');
    });

    it('parses merchant order transaction', () => {
      const row = [
        '05 Feb 2025 12:00:00',
        '05 Feb 2025',
        'Third-Party Merchant Order | Uber Technologies',
        '5,500.00',
        '--',
        '94,500.00',
        'Mobile',
        'MER456',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BillPayment);
      expect(result!.meta?.counterpartyName).toBe('Uber Technologies');
    });

    it('parses bank charge transaction', () => {
      const row = [
        '01 Mar 2025 00:00:00',
        '01 Mar 2025',
        'Electronic Money Transfer Levy',
        '50.00',
        '--',
        '94,450.00',
        'System',
        'LEVY001',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.BankCharge);
    });

    it('parses reversal transaction', () => {
      const row = [
        '20 Mar 2025 10:00:00',
        '20 Mar 2025',
        'Reversal for failed transaction',
        '--',
        '5,000.00',
        '99,450.00',
        'System',
        'REV001',
      ];

      const result = parser.parseTransaction(row);

      expect(result).not.toBeNull();
      expect(result!.meta?.type).toBe(TransactionType.Reversal);
    });

    it('skips OWealth withdrawal transactions', () => {
      const row = [
        '25 Mar 2025 08:00:00',
        '25 Mar 2025',
        'OWealth Withdrawal',
        '--',
        '10,000.00',
        '109,450.00',
        'Mobile',
        'OW001',
      ];

      const result = parser.parseTransaction(row);
      expect(result).toBeNull();
    });

    it('skips auto-save to OWealth transactions', () => {
      const row = [
        '26 Mar 2025 00:00:00',
        '26 Mar 2025',
        'Auto-save to OWealth',
        '5,000.00',
        '--',
        '104,450.00',
        'System',
        'AS001',
      ];

      const result = parser.parseTransaction(row);
      expect(result).toBeNull();
    });

    it('returns null for invalid date format', () => {
      const row = [
        'Invalid Date',
        'Invalid',
        'Transfer from Someone',
        '--',
        '1,000.00',
        '100,000.00',
        'Mobile',
        'REF001',
      ];

      const result = parser.parseTransaction(row);
      expect(result).toBeNull();
    });

    it('returns null when both debit and credit are empty', () => {
      const row = [
        '29 Nov 2025 08:12:51',
        '29 Nov 2025',
        'Some transaction',
        '--',
        '--',
        '100,000.00',
        'Mobile',
        'REF001',
      ];

      const result = parser.parseTransaction(row);
      expect(result).toBeNull();
    });

    it('handles transactions with currency symbols', () => {
      const row = [
        '29 Nov 2025 08:12:51',
        '29 Nov 2025',
        'Transfer from Someone',
        '--',
        '₦10,000.00',
        '₦110,000.00',
        'Mobile',
        'REF001',
      ];

      const result = parser.parseTransaction(row);
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(1000000); // 10,000 * 100 kobo
    });

    it('generates unique IDs for different transactions', () => {
      const row1 = [
        '29 Nov 2025 08:12:51',
        '29 Nov 2025',
        'Transfer 1',
        '--',
        '1,000.00',
        '100,000.00',
        'Mobile',
        'REF001',
      ];
      const row2 = [
        '29 Nov 2025 08:12:52',
        '29 Nov 2025',
        'Transfer 2',
        '--',
        '2,000.00',
        '102,000.00',
        'Mobile',
        'REF002',
      ];

      const result1 = parser.parseTransaction(row1);
      const result2 = parser.parseTransaction(row2);

      expect(result1!.id).not.toBe(result2!.id);
    });

    it('generates reference when not provided', () => {
      const row = [
        '29 Nov 2025 08:12:51',
        '29 Nov 2025',
        'Transfer from Someone',
        '--',
        '1,000.00',
        '100,000.00',
        'Mobile',
        '', // Empty reference
      ];

      const result = parser.parseTransaction(row);
      expect(result).not.toBeNull();
      expect(result!.reference).toBeTruthy();
      expect(result!.reference.length).toBeGreaterThan(0);
    });

    it('handles all month abbreviations', () => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      months.forEach((month, index) => {
        const row = [
          `15 ${month} 2025 12:00:00`,
          `15 ${month} 2025`,
          'Test transaction',
          '--',
          '1,000.00',
          '100,000.00',
          'Mobile',
          'REF001',
        ];

        const result = parser.parseTransaction(row);
        expect(result).not.toBeNull();

        const date = new Date(result!.date);
        expect(date.getMonth()).toBe(index);
      });
    });

    it('sets correct category based on amount sign', () => {
      const creditRow = [
        '29 Nov 2025 08:12:51',
        '29 Nov 2025',
        'Credit',
        '--',
        '1,000.00',
        '101,000.00',
        'Mobile',
        'REF001',
      ];
      const debitRow = [
        '29 Nov 2025 08:12:51',
        '29 Nov 2025',
        'Debit',
        '1,000.00',
        '--',
        '99,000.00',
        'Mobile',
        'REF002',
      ];

      const creditResult = parser.parseTransaction(creditRow);
      const debitResult = parser.parseTransaction(debitRow);

      expect(creditResult!.category).toBe(TransactionCategory.Inflow);
      expect(debitResult!.category).toBe(TransactionCategory.Outflow);
    });
  });

  describe('bankName', () => {
    it('returns OPay', () => {
      expect(parser.bankName).toBe('OPay');
    });
  });
});
