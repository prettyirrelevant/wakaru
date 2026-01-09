import {
  type RawRow,
  type Transaction,
  type TransactionMeta,
  BankType,
  TransactionType,
} from '~/types';
import { BaseParser, type ParserLogger, consoleLogger } from './base';

const OWEALTH_PATTERNS = [
  'owealth withdrawal',
  'auto-save to owealth',
];

export class OPayParser extends BaseParser {
  readonly bankName = 'OPay';
  protected readonly bankType = BankType.OPay;
  protected readonly idPrefix = 'opay';

  constructor(logger: ParserLogger = consoleLogger) {
    super(logger);
  }

  parseTransaction(row: RawRow): Transaction | null {
    if (!row || row.length < 5) return null;

    // [DateTime, Date, Description, Debit, Credit, Balance, Channel, Reference]
    const dateTime = row[0]?.toString().trim() || '';
    const description = row[2]?.toString().trim() || '';
    const debit = row[3]?.toString().trim();
    const credit = row[4]?.toString().trim();
    const reference = row[7]?.toString().trim() || '';

    if (this.shouldSkipTransaction(description)) return null;

    const date = this.parseDateTime(dateTime);
    if (!date) return null;

    const amount = this.parseAmount(debit, credit);
    if (amount === null) return null;

    const txDescription = description || 'Transaction';
    const counterpartyInfo = this.extractCounterparty(description);

    const meta: TransactionMeta = {
      type: this.inferTransactionType(description),
      narration: description,
      ...counterpartyInfo,
    };

    return this.createTransaction({
      date,
      amount,
      description: txDescription,
      reference: reference || this.generateReference(date, description),
      meta,
    });
  }

  private shouldSkipTransaction(description: string): boolean {
    const lower = description.toLowerCase();
    return OWEALTH_PATTERNS.some((pattern) => lower.includes(pattern));
  }

  private parseDateTime(dateStr: string): Date | null {
    // "29 Nov 2025 08:12:51"
    const match = dateStr.match(
      /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/
    );
    if (!match) return null;

    const [, day, monthStr, year, hour, minute, second] = match;
    const month = this.parseMonthName(monthStr);
    if (month === undefined) return null;

    const date = new Date(
      parseInt(year, 10),
      month,
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      parseInt(second, 10)
    );

    return isNaN(date.getTime()) ? null : date;
  }

  private parseAmount(debit?: string, credit?: string): number | null {
    // Debit = outflow (negative), Credit = inflow (positive), "--" = no value
    const hasDebit = debit && debit !== '--' && debit.trim() !== '';
    const hasCredit = credit && credit !== '--' && credit.trim() !== '';

    if (hasDebit) {
      const amount = this.parseAmountValue(debit);
      return amount !== null ? -amount : null;
    }

    if (hasCredit) {
      return this.parseAmountValue(credit);
    }

    return null;
  }

  private extractCounterparty(description: string): Partial<TransactionMeta> {
    // "Transfer to/from NAME | BANK | ACCOUNT | NARRATION"
    const transferMatch = description.match(
      /Transfer\s+(?:to|from)\s+([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)(?:\s*\|\s*(.+))?/i
    );

    if (transferMatch) {
      const [, name, bank, account] = transferMatch;
      return {
        counterpartyName: name?.trim(),
        counterpartyBank: bank?.trim(),
        counterpartyAccount: account?.trim(),
      };
    }

    // "Third-Party Merchant Order | MERCHANT_NAME"
    const merchantMatch = description.match(/Third-Party Merchant Order\s*\|\s*(.+)/i);
    if (merchantMatch) {
      return { counterpartyName: merchantMatch[1]?.trim() };
    }

    // "Airtime | PHONE | CARRIER"
    const airtimeMatch = description.match(/Airtime\s*\|\s*([^|]+)\s*\|\s*(.+)/i);
    if (airtimeMatch) {
      const carrier = airtimeMatch[2]?.trim();
      return { counterpartyName: carrier };
    }

    return {};
  }

  private inferTransactionType(description: string): TransactionType {
    const lower = description.toLowerCase();

    if (lower.includes('transfer to') || lower.includes('transfer from')) {
      return TransactionType.Transfer;
    }
    if (lower.startsWith('airtime')) {
      return TransactionType.Airtime;
    }
    if (lower.includes('electronic money transfer levy') || lower.includes('levy') || lower.includes('charge') || lower.includes('fee')) {
      return TransactionType.BankCharge;
    }
    if (lower.includes('third-party merchant order')) {
      return TransactionType.BillPayment;
    }
    if (lower.includes('reversal') || lower.includes('refund')) {
      return TransactionType.Reversal;
    }

    return TransactionType.Other;
  }
}
