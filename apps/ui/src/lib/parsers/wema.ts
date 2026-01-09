import {
  type RawRow,
  type Transaction,
  type TransactionMeta,
  BankType,
  TransactionType,
} from '~/types';
import { BaseParser, type ParserLogger, consoleLogger } from './base';

export class WemaParser extends BaseParser {
  readonly bankName = 'Wema';
  protected readonly bankType = BankType.Wema;
  protected readonly idPrefix = 'wema';

  constructor(logger: ParserLogger = consoleLogger) {
    super(logger);
  }

  static extractRowsFromPdfText(text: string): RawRow[] {
    const rows: RawRow[] = [];

    const openingBalanceMatch = text.match(/Opening Balance\s*₦?([\d,]+\.?\d*)/i);
    let prevBalance = openingBalanceMatch
      ? parseFloat(openingBalanceMatch[1].replace(/,/g, ''))
      : null;

    const datePattern = /(\d{2}-[A-Za-z]{3}-?\s*\d{4})/g;
    const chunks = text.split(datePattern).filter(Boolean);

    for (let i = 1; i < chunks.length - 1; i += 2) {
      const dateStr = chunks[i].trim().replace(/\s+/g, '');
      const rest = chunks[i + 1]?.trim() || '';

      if (!dateStr || !rest) continue;
      if (rest.includes('R e f e r e n c e') || rest.includes('Transaction Details')) continue;

      const refMatch = rest.match(/^([A-Z]\d+|M\d+)\s+/i);
      if (!refMatch) continue;

      const reference = refMatch[1];
      const afterRef = rest.slice(refMatch[0].length);

      const amountPattern = /(\d{1,3}(?:,\d{3})*\.\d{2})\s+(\d{1,3}(?:,\d{3})*\.\d{2})\s*$/;
      const amountMatch = afterRef.match(amountPattern);

      if (!amountMatch) continue;

      const [, amountStr, balanceStr] = amountMatch;
      const description = afterRef.slice(0, afterRef.lastIndexOf(amountStr)).trim();

      const amount = parseFloat(amountStr.replace(/,/g, ''));
      const balance = parseFloat(balanceStr.replace(/,/g, ''));

      let isCredit = false;
      if (prevBalance !== null) {
        const expectedCreditBalance = prevBalance + amount;
        const expectedDebitBalance = prevBalance - amount;
        isCredit = Math.abs(expectedCreditBalance - balance) < Math.abs(expectedDebitBalance - balance);
      }

      prevBalance = balance;
      rows.push([dateStr, reference, description, amountStr, isCredit ? 'credit' : 'debit']);
    }

    return rows;
  }

  parseTransaction(row: RawRow): Transaction | null {
    if (!row || row.length < 4) return null;

    const date = this.parseDate(row[0]?.toString() || '');
    if (!date) return null;

    const reference = row[1]?.toString().trim() || '';
    const description = row[2]?.toString().trim() || '';
    const amountStr = row[3]?.toString().trim() || '';
    const isCredit = row[4]?.toString() === 'credit';

    const amount = this.parseAmount(amountStr, isCredit);
    if (amount === null) return null;

    const meta: TransactionMeta = {
      type: this.inferTransactionType(description),
      narration: description,
      ...this.extractCounterparty(description),
    };

    return this.createTransaction({
      date,
      amount,
      description: description || 'Transaction',
      reference: reference || this.generateReference(date, description),
      meta,
    });
  }

  private parseDate(dateStr: string): Date | null {
    const match = dateStr.match(/(\d{2})-([A-Za-z]{3})-?\s*(\d{4})/);
    if (!match) return null;

    const [, day, monthStr, year] = match;
    const month = this.parseMonthName(monthStr);
    if (month === undefined) return null;

    const date = new Date(parseInt(year, 10), month, parseInt(day, 10));
    return isNaN(date.getTime()) ? null : date;
  }

  private parseAmount(amountStr: string, isCredit: boolean): number | null {
    const cleaned = amountStr.replace(/[₦,\s]/g, '').trim();
    const amount = parseFloat(cleaned);
    if (isNaN(amount)) return null;

    const amountInKobo = Math.round(amount * 100);
    return isCredit ? amountInKobo : -amountInKobo;
  }

  private extractCounterparty(description: string): Partial<TransactionMeta> {
    const nipMatch = description.match(/NIP:([^-]+)-(.+)/i);
    if (nipMatch) {
      return { counterpartyName: nipMatch[1].trim() };
    }

    const transferMatch = description.match(/TRANSFER TO\s+(.+?)(?:\s+FROM|\s*$)/i);
    if (transferMatch) {
      return { counterpartyName: transferMatch[1].trim() };
    }

    return {};
  }

  private inferTransactionType(description: string): TransactionType {
    const lower = description.toLowerCase();

    if (lower.includes('vat ') || lower.includes('comm ') || lower.includes('sms alert')) {
      return TransactionType.BankCharge;
    }
    if (lower.includes('levy')) {
      return TransactionType.BankCharge;
    }
    if (lower.includes('pos buy') || lower.includes('web buy')) {
      return TransactionType.CardPayment;
    }
    if (lower.includes('nip:') || lower.includes('nip transfer') || lower.includes('alat nip')) {
      return TransactionType.Transfer;
    }
    if (lower.includes('airtime') || lower.includes('recharge')) {
      return TransactionType.Airtime;
    }
    if (lower.includes('reversal') || lower.includes('refund')) {
      return TransactionType.Reversal;
    }

    return TransactionType.Other;
  }
}
