import {
  type RawRow,
  type Transaction,
  type TransactionMeta,
  BankType,
  TransactionType,
} from '~/types';
import { BaseParser, type ParserLogger, consoleLogger } from './base';

export class ZenithParser extends BaseParser {
  readonly bankName = 'Zenith';
  protected readonly bankType = BankType.Zenith;
  protected readonly idPrefix = 'zenith';

  constructor(logger: ParserLogger = consoleLogger) {
    super(logger);
  }

  static extractRowsFromPdfText(text: string): RawRow[] {
    const rows: RawRow[] = [];

    const cleanText = text.replace(
      /Period:\s*\d{2}\/\d{2}\/\d{4}\s+TO\s+\d{2}\/\d{2}\/\d{4}/gi,
      ''
    );

    const txPattern =
      /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(\d{1,3}(?:,\d{3})*\.\d{2})\s+(\d{1,3}(?:,\d{3})*\.\d{2})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{1,3}(?:,\d{3})*\.\d{2})/g;

    let match;
    while ((match = txPattern.exec(cleanText)) !== null) {
      const [, date, description, debit, credit, valueDate, balance] = match;

      if (
        description.includes('CURRENCY') ||
        description.includes('ACCOUNT No') ||
        description.includes('VALUE DATE')
      ) {
        continue;
      }

      rows.push([date, description.trim(), debit, credit, valueDate, balance]);
    }

    return rows;
  }

  parseTransaction(row: RawRow, _rowIndex: number): Transaction | null {
    if (!row || row.length < 4) return null;

    const dateStr = row[0]?.toString().trim() || '';
    const description = row[1]?.toString().trim() || '';
    const debitStr = row[2]?.toString().trim() || '';
    const creditStr = row[3]?.toString().trim() || '';
    const valueDate = row[4]?.toString().trim() || '';
    const balanceStr = row[5]?.toString().trim() || '';

    const date = this.parseDDMMYYYY(dateStr);
    if (!date) return null;

    const amount = this.parseDebitCredit(debitStr, creditStr);
    if (amount === null) return null;

    const counterpartyInfo = this.extractCounterparty(description);

    const meta: TransactionMeta = {
      type: this.inferTransactionType(description),
      narration: description,
      ...counterpartyInfo,
    };

    if (balanceStr) {
      const balance = this.parseAmountValue(balanceStr);
      if (balance !== null) {
        meta.balanceAfter = balance;
      }
    }

    return this.createTransaction({
      date,
      amount,
      description: description || 'Transaction',
      reference: this.generateReference(date, description, 15),
      meta,
    });
  }

  private extractCounterparty(description: string): Partial<TransactionMeta> {
    const nipOutMatch = description.match(
      /NIP\s+CR\/MOB\/([^/]+)\/([^/]+)\s*\/?\s*(.*)/i
    );
    if (nipOutMatch) {
      return {
        counterpartyName: nipOutMatch[1]?.trim(),
        counterpartyBank: nipOutMatch[2]?.trim(),
        narration: nipOutMatch[3]?.trim() || undefined,
      };
    }

    const nipInMatch = description.match(/NIP\/([^/]+)\/([^/]+)\/?(.*)$/i);
    if (nipInMatch) {
      return {
        counterpartyBank: nipInMatch[1]?.trim(),
        counterpartyName: nipInMatch[2]?.trim(),
        narration: nipInMatch[3]?.trim() || undefined,
      };
    }

    const paystackMatch = description.match(
      /NIP\/\/Paystack\/([^/]+)\/(.*)$/i
    );
    if (paystackMatch) {
      return {
        counterpartyName: paystackMatch[1]?.trim(),
        narration: paystackMatch[2]?.trim() || undefined,
      };
    }

    const etzMatch = description.match(/:ETZ INFLOW\s+([^:]+):(.+)/i);
    if (etzMatch) {
      return {
        narration: etzMatch[2]?.trim(),
      };
    }

    const cipMatch = description.match(/CIP\/CR\/\/Transfer from\s+(.+)/i);
    if (cipMatch) {
      return {
        counterpartyName: cipMatch[1]?.trim(),
      };
    }

    const airtimeMatch = description.match(/Airtime\/\/(\d+)\/\/(.+)/i);
    if (airtimeMatch) {
      return {
        counterpartyName: airtimeMatch[2]?.trim(),
        narration: `Airtime for ${airtimeMatch[1]}`,
      };
    }

    return {};
  }

  private inferTransactionType(description: string): TransactionType {
    const lower = description.toLowerCase();

    if (lower.startsWith('nip cr/mob') || lower.startsWith('nip/')) {
      return TransactionType.Transfer;
    }
    if (lower.includes('etz inflow')) {
      return TransactionType.Transfer;
    }
    if (lower.startsWith('cip/')) {
      return TransactionType.Transfer;
    }
    if (lower.startsWith('trf to') || lower.startsWith('trf from')) {
      return TransactionType.Transfer;
    }

    if (lower.includes('pos prch') || lower.includes('pos pyt')) {
      return TransactionType.CardPayment;
    }

    if (lower.includes('atm wdl') || lower.includes('agency cashout')) {
      return TransactionType.AtmWithdrawal;
    }

    if (lower.startsWith('airtime')) {
      return TransactionType.Airtime;
    }

    if (
      lower.includes('nip charge') ||
      lower.includes('+ vat') ||
      lower.includes('sms charge') ||
      lower.includes('maintenance fee') ||
      lower.includes('fgn electronic money transfer levy')
    ) {
      return TransactionType.BankCharge;
    }

    if (lower.startsWith('rvsl')) {
      return TransactionType.Reversal;
    }

    return TransactionType.Other;
  }
}
