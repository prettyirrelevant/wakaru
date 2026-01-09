import {
  type RawRow,
  type Transaction,
  type TransactionMeta,
  BankType,
  TransactionType,
} from '~/types';
import { getMatchIndex } from '~/lib/utils';
import { BaseParser, type ParserLogger, consoleLogger } from './base';

interface ExtractedRow {
  date: string;
  description: string;
  amount: string;
  balance: string;
  isCredit: boolean;
}

export class StandardCharteredParser extends BaseParser {
  readonly bankName = 'Standard Chartered';
  protected readonly bankType = BankType.StandardChartered;
  protected readonly idPrefix = 'sc';

  constructor(logger: ParserLogger = consoleLogger) {
    super(logger);
  }

  static extractRowsFromPdfText(text: string): RawRow[] {
    const extractedRows: ExtractedRow[] = [];

    let cleanText = text.replace(/Page of\d+ \d+/g, '');
    cleanText = cleanText.replace(/Date Description Deposit Withdrawal Balance/g, '');

    const datePattern = /(\d{2} [A-Z][a-z]{2} \d{4})/g;
    const parts = cleanText.split(datePattern).filter((s) => s.trim());

    let prevBalance: number | null = null;

    let startIdx = 0;
    for (let i = 0; i < parts.length; i++) {
      if (/^\d{2} [A-Z][a-z]{2} \d{4}$/.test(parts[i].trim())) {
        startIdx = i;
        break;
      }
    }

    for (let i = startIdx; i < parts.length - 1; i += 2) {
      const dateStr = parts[i].trim();
      const content = parts[i + 1]?.trim() || '';

      if (!/^\d{2} [A-Z][a-z]{2} \d{4}$/.test(dateStr)) {
        continue;
      }

      if (content.includes('BALANCE FROM PREVIOUS STATEMENT')) {
        const balanceMatch = content.match(/([\d,]+\.\d{2})\s*$/);
        if (balanceMatch) {
          prevBalance = parseFloat(balanceMatch[1].replace(/,/g, ''));
        }
        continue;
      }

      if (content.includes('CLOSING BALANCE')) {
        continue;
      }

      if (content.length < 10) continue;

      const amountPattern = /([\d,]+\.\d{2})/g;
      const amounts = [...content.matchAll(amountPattern)].map((m) => ({
        value: m[1],
        index: getMatchIndex(m),
        numericValue: parseFloat(m[1].replace(/,/g, '')),
      }));

      if (amounts.length < 2) continue;

      const balanceInfo = amounts[amounts.length - 1];
      const balance = balanceInfo.numericValue;

      const txAmountInfo = amounts[amounts.length - 2];
      const txAmount = txAmountInfo.numericValue;

      const description = content.substring(0, txAmountInfo.index).trim();

      let isCredit = false;
      if (prevBalance !== null) {
        const expectedCreditBalance = prevBalance + txAmount;
        const expectedDebitBalance = prevBalance - txAmount;

        const creditDiff = Math.abs(expectedCreditBalance - balance);
        const debitDiff = Math.abs(expectedDebitBalance - balance);

        isCredit = creditDiff < debitDiff;
      }

      prevBalance = balance;

      extractedRows.push({
        date: dateStr,
        description: description,
        amount: txAmountInfo.value,
        balance: balanceInfo.value,
        isCredit: isCredit,
      });
    }

    return extractedRows.map((row) => [
      row.date,
      row.description,
      row.amount,
      row.balance,
      row.isCredit ? 'credit' : 'debit',
    ]);
  }

  parseTransaction(row: RawRow): Transaction | null {
    if (!row || row.length < 5) return null;

    const dateStr = row[0]?.toString().trim() || '';
    const description = row[1]?.toString().trim() || '';
    const amountStr = row[2]?.toString().trim() || '';
    const balanceStr = row[3]?.toString().trim() || '';
    const isCredit = row[4]?.toString() === 'credit';

    const date = this.parseDate(dateStr);
    if (!date) return null;

    const amount = this.parseAmount(amountStr, isCredit);
    if (amount === null) return null;

    const meta: TransactionMeta = {
      type: this.inferTransactionType(description),
      narration: description,
      ...this.extractCounterparty(description),
    };

    const balanceAfter = this.parseAmountValue(balanceStr);
    if (balanceAfter !== null) {
      meta.balanceAfter = balanceAfter;
    }

    return this.createTransaction({
      date,
      amount,
      description: description || 'Transaction',
      reference: this.generateReference(date, description, 15),
      meta,
    });
  }

  private parseDate(dateStr: string): Date | null {
    const match = dateStr.match(/(\d{2}) ([A-Za-z]{3}) (\d{4})/);
    if (!match) return null;

    const [, day, monthStr, year] = match;
    const month = this.parseMonthName(monthStr);
    if (month === undefined) return null;

    const date = new Date(Date.UTC(parseInt(year, 10), month, parseInt(day, 10), 0, 0, 0, 0));
    return isNaN(date.getTime()) ? null : date;
  }

  private parseAmount(amountStr: string, isCredit: boolean): number | null {
    const value = this.parseAmountValue(amountStr);
    if (value === null) return null;
    return isCredit ? value : -value;
  }

  private extractCounterparty(description: string): Partial<TransactionMeta> {
    if (!description) return {};

    const nipMatch = description.match(
      /^([A-Z][A-Z\s,\-.]+?)(?:\s+(?:V\.\d+|\d{5,}|IL\d+|NG-|NIP|IBK|POS|CASH|100\d{3}))/i
    );
    if (nipMatch) {
      return { counterpartyName: nipMatch[1].trim() };
    }

    const posMatch = description.match(
      /(?:POS|CASH ADV)[^A-Z]*T?\s*([A-Z][A-Z\s]+?)(?:\s+\d)/i
    );
    if (posMatch) {
      return { counterpartyName: posMatch[1].trim() };
    }

    const ibkgMatch = description.match(/^IBKG\s+([A-Z]+\s+[A-Z]+)/i);
    if (ibkgMatch) {
      return { counterpartyName: ibkgMatch[1].trim() };
    }

    return {};
  }

  private inferTransactionType(description: string): TransactionType {
    if (!description) return TransactionType.Other;
    const lower = description.toLowerCase();

    if (lower.includes('nip') || lower.includes('transfer')) {
      return TransactionType.Transfer;
    }
    if (lower.includes('pos') || lower.includes('cash adv')) {
      return TransactionType.CardPayment;
    }
    if (lower.includes('airtime') || lower.includes('top-up') || lower.includes('mtn') || lower.includes('airtel')) {
      return TransactionType.Airtime;
    }
    if (lower.includes('stampdutycharg') || lower.includes('levy')) {
      return TransactionType.BankCharge;
    }
    if (lower.includes('debit card txn') || lower.includes('remita')) {
      return TransactionType.CardPayment;
    }
    if (lower.includes('cash back') || lower.includes('reward')) {
      return TransactionType.Interest;
    }
    if (lower.includes('ibk') || lower.includes('ibanking')) {
      return TransactionType.Transfer;
    }

    return TransactionType.Other;
  }
}
