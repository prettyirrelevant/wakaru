import {
  type BankParser,
  type RawRow,
  type Transaction,
  type TransactionMeta,
  BankType,
  TransactionCategory,
  TransactionType,
} from '~/types';
import { getMatchIndex } from '~/lib/utils';

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

export class GtbParser implements BankParser {
  readonly bankName = 'GTB';

  static extractRowsFromPdfText(text: string): RawRow[] {
    const rows: RawRow[] = [];

    const openingBalanceMatch = text.match(/Opening Balance\s+([\d,]+\.\d{2})/i);
    let prevBalance = openingBalanceMatch
      ? parseFloat(openingBalanceMatch[1].replace(/,/g, ''))
      : 0;

    let cleanText = text
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

  parseTransaction(row: RawRow, _rowIndex: number): Transaction | null {
    if (!row || row.length < 7) return null;

    try {
      const transDateStr = row[0]?.toString().trim() || '';
      const valueDateStr = row[1]?.toString().trim() || '';
      const debitStr = row[3]?.toString().trim() || '';
      const creditStr = row[4]?.toString().trim() || '';
      const balanceStr = row[5]?.toString().trim() || '';
      const remarks = row[6]?.toString().trim() || '';

      const date = this.parseDate(transDateStr);
      if (!date) return null;

      const amount = this.parseAmount(debitStr, creditStr);
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

      return {
        id: this.generateId(date, amount, remarks),
        date: date.toISOString(),
        createdAt: Math.floor(Date.now() / 1000),
        description: remarks || 'Transaction',
        amount,
        category: amount > 0 ? TransactionCategory.Inflow : TransactionCategory.Outflow,
        bankSource: BankType.GTB,
        reference: this.generateReference(date, remarks),
        meta,
      };
    } catch {
      return null;
    }
  }

  private parseDate(dateStr: string): Date | null {
    const months: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };

    const match = dateStr.match(/(\d{2})-([A-Za-z]{3})-(\d{4})/);
    if (!match) return null;

    const [, day, monthStr, year] = match;
    const month = months[monthStr];
    if (month === undefined) return null;

    const date = new Date(Date.UTC(parseInt(year, 10), month, parseInt(day, 10), 0, 0, 0, 0));
    return isNaN(date.getTime()) ? null : date;
  }

  private parseAmount(debitStr: string, creditStr: string): number | null {
    const credit = this.parseAmountValue(creditStr);
    const debit = this.parseAmountValue(debitStr);

    if (credit && credit > 0) return credit;
    if (debit && debit > 0) return -debit;
    return null;
  }

  private parseAmountValue(amountStr: string): number | null {
    if (!amountStr || amountStr === '-') return null;
    const cleaned = amountStr.replace(/[₦,\s]/g, '').trim();
    const amount = parseFloat(cleaned);
    if (isNaN(amount) || amount === 0) return null;
    return Math.round(amount * 100);
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

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private generateId(date: Date, amount: number, description: string): string {
    const hash = this.simpleHash(`${date.toISOString()}-${amount}-${description}`);
    return `gtb-${hash}`;
  }

  private generateReference(date: Date, description?: string): string {
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const descPart = description?.substring(0, 15) || '';
    return `${dateStr}-${descPart}`.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
  }
}
