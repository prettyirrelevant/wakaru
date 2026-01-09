import {
  type RawRow,
  type Transaction,
  type TransactionMeta,
  BankType,
  TransactionType,
} from '~/types';
import { getMatchIndex } from '~/lib/utils';
import { BaseParser, type ParserLogger, consoleLogger } from './base';

export class UbaParser extends BaseParser {
  readonly bankName = 'UBA';
  protected readonly bankType = BankType.UBA;
  protected readonly idPrefix = 'uba';

  constructor(logger: ParserLogger = consoleLogger) {
    super(logger);
  }

  static extractRowsFromPdfText(text: string): RawRow[] {
    const rows: RawRow[] = [];

    const cleaned = text
      .replace(/Bank Statement [A-Z\s]+ \d+[A-Za-z\s,]+Address Line2 [A-Za-z]+ \d{2}, \d{4} to [A-Za-z]+ \d{2}, \d{4}/g, ' ')
      .replace(/Download App \| Chat with Leo \| Our Website/g, ' ')
      .replace(/Head Office: 57 Marina.*?cfc@ubagroup\.com \| Privacy Policy/g, ' ')
      .replace(/Africa's global bank/g, ' ')
      .replace(/\d{2}-[A-Za-z]{3}-\d{4} to \d{2}-[A-Za-z]{3}-\d{4} Bank Statement \d+/g, ' ')
      .replace(/TRANS DATE VALUE DATE NARRATION CHQ\.? NO DEBIT CREDIT BALANCE/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const openingBalanceMatch = cleaned.match(/Opening Balance[:\s]*([\d,]+\.\d{2})/i);
    let prevBalance = openingBalanceMatch
      ? parseFloat(openingBalanceMatch[1].replace(/,/g, ''))
      : 0;

    const datePattern = /(\d{2}-[A-Za-z]{3}-\d{4})\s+(\d{2}-[A-Za-z]{3}-\d{4})/g;
    const dateMatches = [...cleaned.matchAll(datePattern)];

    for (let i = 0; i < dateMatches.length; i++) {
      const currentMatch = dateMatches[i];
      const nextMatch = dateMatches[i + 1];

      const startIdx = getMatchIndex(currentMatch) + currentMatch[0].length;
      const endIdx = nextMatch ? getMatchIndex(nextMatch) : cleaned.length;

      const transDate = currentMatch[1];
      const valueDate = currentMatch[2];
      const content = cleaned.slice(startIdx, endIdx).trim();

      if (content.toLowerCase().startsWith('opening balance')) {
        continue;
      }

      const amountPattern = /(\d{1,3}(?:,\d{3})*\.\d{2})/g;
      const amounts = [...content.matchAll(amountPattern)].map((m) => ({
        value: m[0],
        numeric: parseFloat(m[0].replace(/,/g, '')),
        index: getMatchIndex(m),
      }));

      if (amounts.length < 2) continue;

      const balance = amounts[amounts.length - 1];
      const txAmount = amounts[amounts.length - 2];

      const isCredit = balance.numeric > prevBalance;

      let narration = content.slice(0, txAmount.index).trim();
      narration = narration.replace(/\s+\d{12,}\s*$/, '').trim();

      rows.push([
        transDate,
        valueDate,
        narration,
        isCredit ? '' : txAmount.value,
        isCredit ? txAmount.value : '',
        balance.value,
      ]);

      prevBalance = balance.numeric;
    }

    return rows;
  }

  parseTransaction(row: RawRow, _rowIndex: number): Transaction | null {
    if (!row || row.length < 6) return null;

    const transDateStr = row[0]?.toString().trim() || '';
    const valueDateStr = row[1]?.toString().trim() || '';
    const narration = row[2]?.toString().trim() || '';
    const debitStr = row[3]?.toString().trim() || '';
    const creditStr = row[4]?.toString().trim() || '';
    const balanceStr = row[5]?.toString().trim() || '';

    const date = this.parseDDMMMYYYY(transDateStr);
    if (!date) return null;

    const amount = this.parseDebitCredit(debitStr, creditStr);
    if (amount === null) return null;

    const counterpartyInfo = this.extractCounterparty(narration);

    const meta: TransactionMeta = {
      type: this.inferTransactionType(narration),
      narration,
      ...counterpartyInfo,
    };

    if (balanceStr) {
      const balance = this.parseAmountValue(balanceStr);
      if (balance !== null) {
        meta.balanceAfter = balance;
      }
    }

    if (valueDateStr) {
      meta.sessionId = valueDateStr;
    }

    return this.createTransaction({
      date,
      amount,
      description: narration || 'Transaction',
      reference: this.generateReference(date, narration, 15),
      meta,
    });
  }

  private extractCounterparty(narration: string): Partial<TransactionMeta> {
    const mobUtoMatch = narration.match(/MOB\/UTO\/([^/]+)\/([^/]+)\/\d+/);
    if (mobUtoMatch) {
      return {
        counterpartyName: mobUtoMatch[1].trim(),
        narration: mobUtoMatch[2].trim(),
      };
    }

    const mobSatuMatch = narration.match(/MOB\/SATU\/(\d+)\/(.+)/);
    if (mobSatuMatch) {
      return {
        counterpartyAccount: mobSatuMatch[1].trim(),
      };
    }

    const tnfMatch = narration.match(/TNF-([^/]+)\/(.+)/);
    if (tnfMatch) {
      return {
        counterpartyName: tnfMatch[1].trim(),
        narration: tnfMatch[2].trim(),
      };
    }

    const transferFromMatch = narration.match(/\.\/Transfer from ([^\d]+)/i);
    if (transferFromMatch) {
      return {
        counterpartyName: transferFromMatch[1].trim(),
      };
    }

    const posPurMatch = narration.match(/POS Pur @ ([^\s]+)\s+(.+?)(?:\s+\d{6,}|$)/);
    if (posPurMatch) {
      return {
        counterpartyName: posPurMatch[2].trim(),
      };
    }

    const posTrfMatch = narration.match(/POS Trf @ ([^\s]+)\s+(.+?)(?:\s+\d{6,}|$)/);
    if (posTrfMatch) {
      return {
        counterpartyName: posTrfMatch[2].trim(),
      };
    }

    const atmMatch = narration.match(/ATM WD @ ([^\s]+)-(.+)/);
    if (atmMatch) {
      return {
        counterpartyName: atmMatch[2].trim(),
      };
    }

    const topupMatch = narration.match(/(?:USSD|MOB) TOPUP (\d+)/);
    if (topupMatch) {
      return {
        narration: `Airtime for ${topupMatch[1]}`,
      };
    }

    return {};
  }

  private inferTransactionType(narration: string): TransactionType {
    const lower = narration.toLowerCase();

    if (lower.startsWith('rev/') || lower.includes('reversal')) {
      return TransactionType.Reversal;
    }

    if (lower.includes('int. pd') || lower.includes('interest')) {
      return TransactionType.Interest;
    }

    if (lower.includes('mob/uto') || lower.includes('mob/satu') ||
        lower.includes('tnf-') || lower.includes('transfer from')) {
      return TransactionType.Transfer;
    }

    if (lower.includes('pos pur') || lower.includes('pos trf')) {
      return TransactionType.CardPayment;
    }

    if (lower.includes('atm wd')) {
      return TransactionType.AtmWithdrawal;
    }

    if (lower.includes('ussd topup') || lower.includes('mob topup')) {
      return TransactionType.Airtime;
    }

    if (lower.includes('stamp duty') || lower.includes('sms') ||
        lower.includes('card maint') || lower.includes('glo charge') ||
        lower.includes('wtax') || lower.includes('charge')) {
      return TransactionType.BankCharge;
    }

    if (lower.includes('pstkdirectdebit') || lower.includes('directdebit')) {
      return TransactionType.BillPayment;
    }

    return TransactionType.Other;
  }
}
