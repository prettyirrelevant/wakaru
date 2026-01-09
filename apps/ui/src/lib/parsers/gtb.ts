import {
  type RawRow,
  type Transaction,
  type TransactionMeta,
  BankType,
  TransactionType,
} from '~/types';
import { getMatchIndex } from '~/lib/utils';
import { BaseParser, type ParserLogger, consoleLogger } from './base';

const DESCRIPTION_STARTERS = [
  'NIBSS',
  'NIP',
  'NEFT',
  'POSWEB',
  'POS/WEB',
  'Airtime',
  'Electronic',
  'TRANSFER',
  'COMMISSION',
  'VALUE ADDED TAX',
  'SMS ALERT',
  'INTEREST',
  'CASH WITHDRAWAL',
];

export class GtbParser extends BaseParser {
  readonly bankName = 'GTB';
  protected readonly bankType = BankType.GTB;
  protected readonly idPrefix = 'gtb';

  constructor(logger: ParserLogger = consoleLogger) {
    super(logger);
  }

  static extractRowsFromPdfText(text: string): RawRow[] {
    const rows: RawRow[] = [];

    const openingBalanceMatch = text.match(/Opening Balance\s+([\d,]+\.\d{2})/i);
    let prevBalance = openingBalanceMatch
      ? parseFloat(openingBalanceMatch[1].replace(/,/g, ''))
      : 0;

    const cleanText = text
      .replace(
        /This is a computer generated Email\..*?local branch\.\d+\./gs,
        ' '
      )
      .replace(
        /Trans\.\s*Date\s+Value\.?\s*Date\s+Reference\s+Debits\s+Credits\s+Balance\s+Originating\s*Branch\s+Remarks/gi,
        ' '
      );

    const datePattern = /(\d{2}-[A-Za-z]{3}-\d{4})\s+(\d{2}-[A-Za-z]{3}-\d{4})/g;
    const dateMatches = [...cleanText.matchAll(datePattern)];

    for (let i = 0; i < dateMatches.length; i++) {
      const currentMatch = dateMatches[i];
      const nextMatch = dateMatches[i + 1];

      const startIdx = getMatchIndex(currentMatch) + currentMatch[0].length;
      const endIdx = nextMatch ? getMatchIndex(nextMatch) : cleanText.length;

      const transDate = currentMatch[1];
      const valueDate = currentMatch[2];
      const content = cleanText.slice(startIdx, endIdx).trim();

      const refMatch = content.match(/^'?([^\s]*(?:\s+\d{2}[A-Z]{3})?)\s+/);
      if (!refMatch) continue;

      const reference = refMatch[1] || '';
      const remaining = content.slice(refMatch[0].length);

      const amountPattern = /[\d,]+\.\d{2}/g;
      const amounts = [...remaining.matchAll(amountPattern)].map((m) => ({
        value: m[0],
        numeric: parseFloat(m[0].replace(/,/g, '')),
        index: getMatchIndex(m),
      }));

      if (amounts.length < 2) continue;

      let txAmount: (typeof amounts)[0];
      let balance: (typeof amounts)[0];

      if (amounts.length === 2) {
        txAmount = amounts[0];
        balance = amounts[1];
      } else {
        balance = amounts[amounts.length - 1];
        txAmount = amounts[amounts.length - 2];
      }

      const isCredit = balance.numeric > prevBalance;

      const afterBalance = remaining.slice(balance.index + balance.value.length).trim();
      const { remarks } = GtbParser.extractBranchAndRemarks(afterBalance);

      rows.push([
        transDate,
        valueDate,
        reference,
        isCredit ? '' : txAmount.value,
        isCredit ? txAmount.value : '',
        balance.value,
        remarks,
      ]);

      prevBalance = balance.numeric;
    }

    return rows;
  }

  private static extractBranchAndRemarks(text: string): {
    branchCode: string;
    branchName: string;
    remarks: string;
  } {
    const eChannelsMatch = text.match(/^(E-\s*CHANNELS)\s+(.+)/is);
    if (eChannelsMatch) {
      return {
        branchCode: '',
        branchName: 'E-CHANNELS',
        remarks: eChannelsMatch[2].trim(),
      };
    }

    const branchCodeMatch = text.match(/^(\d{3})\s+/);
    if (!branchCodeMatch) {
      return { branchCode: '', branchName: '', remarks: text };
    }

    const branchCode = branchCodeMatch[1];
    const afterCode = text.slice(branchCodeMatch[0].length);

    const starterPattern = new RegExp(`(${DESCRIPTION_STARTERS.join('|')}|\\d{12,})`, 'i');
    const starterMatch = afterCode.match(starterPattern);

    if (starterMatch && getMatchIndex(starterMatch) > 0) {
      const branchName = afterCode.slice(0, starterMatch.index).trim();
      const remarks = afterCode.slice(starterMatch.index).trim();
      return { branchCode, branchName, remarks };
    }

    const fallbackMatch = afterCode.match(/^([A-Z][A-Z0-9\s-]+?)(?=\s+[a-z]|\s+\d{6,})/);
    if (fallbackMatch) {
      return {
        branchCode,
        branchName: fallbackMatch[1].trim(),
        remarks: afterCode.slice(fallbackMatch[0].length).trim(),
      };
    }

    return { branchCode, branchName: '', remarks: afterCode };
  }

  parseTransaction(row: RawRow): Transaction | null {
    if (!row || row.length < 7) return null;

    const transDateStr = row[0]?.toString().trim() || '';
    const valueDateStr = row[1]?.toString().trim() || '';
    const debitStr = row[3]?.toString().trim() || '';
    const creditStr = row[4]?.toString().trim() || '';
    const balanceStr = row[5]?.toString().trim() || '';
    const remarks = row[6]?.toString().trim() || '';

    const date = this.parseDDMMMYYYY(transDateStr);
    if (!date) return null;

    const amount = this.parseDebitCredit(debitStr, creditStr);
    if (amount === null) return null;

    const counterpartyInfo = this.extractCounterparty(remarks);

    const meta: TransactionMeta = {
      type: this.inferTransactionType(remarks),
      narration: remarks,
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
      description: remarks || 'Transaction',
      reference: this.generateReference(date, remarks, 15),
      meta,
    });
  }

  private extractCounterparty(remarks: string): Partial<TransactionMeta> {
    const nipTransferToMatch = remarks.match(/NIP TRANSFER TO\s+(\w+)\s+-\s+(.+?)(?:\s*$)/i);
    if (nipTransferToMatch) {
      return {
        counterpartyBank: this.resolveBankName(nipTransferToMatch[1]),
        counterpartyName: this.cleanCounterpartyName(nipTransferToMatch[2]),
      };
    }

    const toBankMatch = remarks.match(
      /(?:TO|FROM)\s+(OPAY|MONIEMFB|PALMPAY|WEMA|UBA|GTB|ACCESS|ZENITH|KUDA|FIRSTBANK|MONIEPOINT)\s+-\s+(.+?)(?:\s*$)/i
    );
    if (toBankMatch) {
      return {
        counterpartyBank: this.resolveBankName(toBankMatch[1]),
        counterpartyName: this.cleanCounterpartyName(toBankMatch[2]),
      };
    }

    const trfToMatch = remarks.match(/Trf to\s+\d+\|(\d+)\/\d+\|(\w+)\|([A-Z\s]+)\s+REF:/i);
    if (trfToMatch) {
      return {
        counterpartyBank: this.resolveBankName(trfToMatch[2]),
        counterpartyName: this.cleanCounterpartyName(trfToMatch[3]),
      };
    }

    const transferFromMatch = remarks.match(/TRANSFER FROM\s+([A-Z][A-Z\s]+?)[-–]([A-Z]+)[-–]/i);
    if (transferFromMatch) {
      return {
        counterpartyName: this.cleanCounterpartyName(transferFromMatch[1]),
        counterpartyBank: this.resolveBankName(transferFromMatch[2]),
      };
    }

    const neftMatch = remarks.match(/NEFT TRANSFER.+?\/([^/]+?)\/Being/i);
    if (neftMatch) {
      return {
        counterpartyName: this.cleanCounterpartyName(neftMatch[1]),
      };
    }

    const airtimeMatch = remarks.match(/Airtime.+?-(\d{11,13})/i);
    if (airtimeMatch) {
      return {
        narration: `Airtime for ${airtimeMatch[1]}`,
      };
    }

    const posMatch = remarks.match(/(?:POS|WEB)[^-]*-\d+-[^-]+-([A-Z][A-Z\s]+)/i);
    if (posMatch) {
      return {
        counterpartyName: this.cleanCounterpartyName(posMatch[1]),
      };
    }

    return {};
  }

  private cleanCounterpartyName(name: string): string {
    if (!name) return '';
    return name
      .replace(/\s*\d{6,}.*$/, '')
      .replace(/\/+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private resolveBankName(code: string): string {
    const bankNames: Record<string, string> = {
      OPAY: 'OPay',
      MONIEMFB: 'Moniepoint',
      MONIEPOINT: 'Moniepoint',
      PALMPAY: 'PalmPay',
      WEMA: 'Wema Bank',
      UBA: 'UBA',
      GTB: 'GTB',
      ACCESS: 'Access Bank',
      ZENITH: 'Zenith Bank',
      KUDA: 'Kuda',
      FIRSTBANK: 'First Bank',
      PIGGYVEST: 'PiggyVest',
    };
    return bankNames[code.toUpperCase()] || code;
  }

  private inferTransactionType(remarks: string): TransactionType {
    const lower = remarks.toLowerCase();

    if (lower.includes('nibss instant payment') || lower.includes('nip transfer')) {
      return TransactionType.Transfer;
    }
    if (lower.includes('transfer between customers') || lower.includes('transfer from')) {
      return TransactionType.Transfer;
    }
    if (lower.includes('neft transfer')) {
      return TransactionType.Transfer;
    }

    if (lower.includes('airtime purchase') || lower.includes('airtime')) {
      return TransactionType.Airtime;
    }

    if (lower.includes('electronic money transfer levy') || lower.includes('emt levy')) {
      return TransactionType.BankCharge;
    }
    if (
      lower.includes('stamp duty') ||
      lower.includes('sms alert') ||
      lower.includes('commission') ||
      lower.includes('value added tax') ||
      lower.includes('maintenance fee')
    ) {
      return TransactionType.BankCharge;
    }

    if (
      lower.includes('posweb purchase') ||
      lower.includes('pos/web purchase') ||
      lower.includes('pos pur') ||
      lower.includes('web pur')
    ) {
      return TransactionType.CardPayment;
    }

    if (lower.includes('atm') || lower.includes('cash withdrawal')) {
      return TransactionType.AtmWithdrawal;
    }

    if (lower.includes('reversal') || lower.includes('refund')) {
      return TransactionType.Reversal;
    }

    if (lower.includes('interest')) {
      return TransactionType.Interest;
    }

    return TransactionType.Other;
  }
}
