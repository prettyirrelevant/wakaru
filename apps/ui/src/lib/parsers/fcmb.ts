import {
  type RawRow,
  type Transaction,
  type TransactionMeta,
  BankType,
  TransactionType,
} from '~/types';
import { BaseParser, type ParserLogger, consoleLogger } from './base';

export class FcmbParser extends BaseParser {
  readonly bankName = 'FCMB';
  protected readonly bankType = BankType.FCMB;
  protected readonly idPrefix = 'fcmb';

  constructor(logger: ParserLogger = consoleLogger) {
    super(logger);
  }

  static extractRowsFromPdfText(text: string): RawRow[] {
    const rows: RawRow[] = [];

    const openingBalanceMatch = text.match(/OPENING BALANCE\s+([\d,]+\.\d{2})/i);
    let prevBalance = openingBalanceMatch
      ? parseFloat(openingBalanceMatch[1].replace(/,/g, ''))
      : 0;

    const datePattern = '\\d{2}-[A-Za-z]{3}-\\d{4}';
    const amountPattern = '\\d{1,3}(?:,\\d{3})*\\.\\d{2}';

    const txPattern = new RegExp(
      `(${datePattern})\\s+(${datePattern})\\s+(.+?)\\s+(${amountPattern})\\s+(${amountPattern})`,
      'g'
    );

    let match;
    while ((match = txPattern.exec(text)) !== null) {
      const [, txnDate, valDate, description, amountStr, balanceStr] = match;

      if (description.toLowerCase().includes('opening balance')) continue;

      const amount = parseFloat(amountStr.replace(/,/g, ''));
      const balance = parseFloat(balanceStr.replace(/,/g, ''));

      const expectedBalanceIfCredit = prevBalance + amount;
      const creditDiff = Math.abs(expectedBalanceIfCredit - balance);
      const debitDiff = Math.abs(prevBalance - amount - balance);
      const isCredit = creditDiff < debitDiff;

      rows.push([
        txnDate,
        valDate,
        description.trim(),
        isCredit ? '' : amountStr,
        isCredit ? amountStr : '',
        balanceStr,
      ]);

      prevBalance = balance;
    }

    return rows;
  }

  parseTransaction(row: RawRow, _rowIndex: number): Transaction | null {
    if (!row || row.length < 6) return null;

    const txnDateStr = row[0]?.toString().trim() || '';
    const valDateStr = row[1]?.toString().trim() || '';
    const description = row[2]?.toString().trim() || '';
    const debitStr = row[3]?.toString().trim() || '';
    const creditStr = row[4]?.toString().trim() || '';
    const balanceStr = row[5]?.toString().trim() || '';

    const date = this.parseDDMMMYYYY(txnDateStr);
    if (!date) return null;

    const amount = this.parseDebitCredit(debitStr, creditStr);
    if (amount === null) return null;

    const meta: TransactionMeta = {
      type: this.inferTransactionType(description),
      narration: description,
      ...this.extractCounterparty(description),
    };

    if (balanceStr) {
      const balance = this.parseAmountValue(balanceStr);
      if (balance !== null) {
        meta.balanceAfter = balance;
      }
    }

    if (valDateStr) {
      meta.sessionId = valDateStr;
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
    const appToMatch = description.match(/App(?:\s*:?\s*\w*)?\s+To\s+([^\d]+)/i);
    if (appToMatch) {
      const parts = appToMatch[1].trim().split(/\s+/);
      const bankKeywords = ['Opay', 'Palmpay', 'Kuda', 'MONIEPOINT', 'GTB', 'Wema', 'VFD', 'POCKETAPP'];
      const bankMatch = bankKeywords.find(b => appToMatch[1].toLowerCase().includes(b.toLowerCase()));

      if (bankMatch) {
        const nameStart = appToMatch[1].toLowerCase().indexOf(bankMatch.toLowerCase()) + bankMatch.length;
        const counterpartyName = appToMatch[1].slice(nameStart).trim();
        return {
          counterpartyBank: bankMatch,
          counterpartyName: counterpartyName || parts.slice(-2).join(' '),
        };
      }

      return { counterpartyName: parts.slice(-2).join(' ') };
    }

    const nipMatch = description.match(/NIP FRM\s+([^-]+)/i);
    if (nipMatch) {
      return { counterpartyName: nipMatch[1].trim() };
    }

    const trfFromMatch = description.match(/TRF From\s+(?:App:\s*)?To\s+(\w+)\s+([^/]+)/i);
    if (trfFromMatch) {
      return {
        counterpartyBank: trfFromMatch[1],
        counterpartyName: trfFromMatch[2].trim(),
      };
    }

    const trfToMatch = description.match(/TRF to\s+(?:App:\s*)?To\s+(\w+)\s+([^/]+)/i);
    if (trfToMatch) {
      return {
        counterpartyBank: trfToMatch[1],
        counterpartyName: trfToMatch[2].trim(),
      };
    }

    const copMatch = description.match(/COP FRM\s+(.+)/i);
    if (copMatch) {
      return { counterpartyName: copMatch[1].trim() };
    }

    return {};
  }

  private inferTransactionType(description: string): TransactionType {
    const lower = description.toLowerCase();

    if (lower.includes('app to') || lower.includes('app:') ||
        lower.includes('nip frm') || lower.includes('trf from') ||
        lower.includes('trf to') || lower.includes('cop frm')) {
      return TransactionType.Transfer;
    }

    if (lower.includes('pos purchase') || lower.includes('pos pymnt') ||
        lower.includes('/t ')) {
      return TransactionType.CardPayment;
    }

    if (lower.includes('airtime') || lower.includes('/airtime/')) {
      return TransactionType.Airtime;
    }

    if (lower.includes('emt levy') || lower.includes('sms alert') ||
        lower.includes('transaction charge')) {
      return TransactionType.BankCharge;
    }

    if (lower.includes('reversal') || lower.includes('refund')) {
      return TransactionType.Reversal;
    }

    return TransactionType.Other;
  }
}
