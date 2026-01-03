import {
  type BankParser,
  type RawRow,
  type Transaction,
  type TransactionMeta,
  BankType,
  TransactionCategory,
  TransactionType,
} from '~/types';

export class SterlingParser implements BankParser {
  readonly bankName = 'Sterling';

  static extractRowsFromPdfText(text: string): RawRow[] {
    const hasMonthNames = /\d{2}-[A-Za-z]{3}-\d{4}/.test(text);

    if (hasMonthNames) {
      return SterlingParser.extractRowsFormatB(text);
    }
    return SterlingParser.extractRowsFormatA(text);
  }

  private static extractRowsFormatA(text: string): RawRow[] {
    const rows: RawRow[] = [];

    const cleanText = text
      .replace(/Page \d+ of \d+/gi, ' ')
      .replace(/Date\s+Reference\s+Narration\s+Money\s*In\s+Money\s*Out\s+Balance/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const datePattern = /(\d{2}-\d{2}-\d{4})/g;
    const dateMatches = [...cleanText.matchAll(datePattern)];

    for (let i = 0; i < dateMatches.length; i++) {
      const currentMatch = dateMatches[i];
      const nextMatch = dateMatches[i + 1];

      const startIdx = currentMatch.index!;
      const endIdx = nextMatch ? nextMatch.index! : cleanText.length;

      const transactionText = cleanText.slice(startIdx, endIdx).trim();

      if (transactionText.match(/^\d{2}-\d{2}-\d{4}\s+to\s+\d{2}-\d{2}-\d{4}/i)) {
        continue;
      }

      if (transactionText.match(/date\s*range/i)) {
        continue;
      }

      const amountPattern = /([\d,]+\.\d{2}|-)/g;
      const amounts = [...transactionText.matchAll(amountPattern)].map((m) => ({
        value: m[0],
        numeric: m[0] === '-' ? null : parseFloat(m[0].replace(/,/g, '')),
        index: m.index!,
      }));

      if (amounts.length >= 3) {
        const balance = amounts[amounts.length - 1];
        const moneyOut = amounts[amounts.length - 2];
        const moneyIn = amounts[amounts.length - 3];

        if (balance.numeric === null) continue;

        const dateMatch = transactionText.match(/^(\d{2}-\d{2}-\d{4})\s+(\d{10})?/);
        if (!dateMatch) continue;

        const date = dateMatch[1];
        const reference = dateMatch[2] || '';

        const refEndIdx = dateMatch[0].length;
        const narrationEndIdx = moneyIn.index;
        const narration = transactionText.slice(refEndIdx, narrationEndIdx).trim();

        rows.push([
          date,
          reference,
          narration,
          moneyIn.value,
          moneyOut.value,
          balance.value,
        ]);
      }
    }

    return rows;
  }

  private static extractRowsFormatB(text: string): RawRow[] {
    const rows: RawRow[] = [];

    const headerEndMatch = text.match(/Trans\s*Date\s+Narration\s+Value\s*Date\s+Debit\s+Credit\s+Balance/i);
    if (!headerEndMatch || headerEndMatch.index === undefined) {
      return rows;
    }

    const transactionSection = text.slice(headerEndMatch.index + headerEndMatch[0].length);

    const cleanText = transactionSection
      .replace(/\s+/g, ' ')
      .trim();

    const txPattern = /(\d{2}-[A-Za-z]{3}-\d{4})\s+(.+?)\s+(\d{2}-[A-Za-z]{3}-\d{4})\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2})/g;

    let match;
    while ((match = txPattern.exec(cleanText)) !== null) {
      const [, transDate, narrationRaw, _valueDate, debit, credit, balance] = match;

      const narration = narrationRaw
        .replace(/\s+[A-Z][A-Z\s]+[A-Z]\s+Ref:\s*\S+\s*$/, '')
        .replace(/\s+Ref:\s*\S+\s*$/, '')
        .trim();

      const debitNum = parseFloat(debit);
      const creditNum = parseFloat(credit);

      const moneyIn = creditNum > 0 ? credit : '-';
      const moneyOut = debitNum > 0 ? debit : '-';

      const refMatch = narrationRaw.match(/Ref:\s*(\d{10})/);
      const reference = refMatch ? refMatch[1] : '';

      rows.push([
        SterlingParser.convertDateFormat(transDate),
        reference,
        narration,
        moneyIn,
        moneyOut,
        balance,
      ]);
    }

    return rows;
  }

  private static convertDateFormat(dateStr: string): string {
    const months: Record<string, string> = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
      Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
    };

    const match = dateStr.match(/(\d{2})-([A-Za-z]{3})-(\d{4})/);
    if (!match) return dateStr;

    const [, day, monthStr, year] = match;
    const month = months[monthStr];
    if (!month) return dateStr;

    return `${day}-${month}-${year}`;
  }

  parseTransaction(row: RawRow, _rowIndex: number): Transaction | null {
    if (!row || row.length < 6) return null;

    try {
      const dateStr = row[0]?.toString().trim() || '';
      const reference = row[1]?.toString().trim() || '';
      const narration = row[2]?.toString().trim() || '';
      const moneyInStr = row[3]?.toString().trim() || '';
      const moneyOutStr = row[4]?.toString().trim() || '';
      const balanceStr = row[5]?.toString().trim() || '';

      const date = this.parseDate(dateStr);
      if (!date) return null;

      const amount = this.parseAmount(moneyInStr, moneyOutStr);
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

      if (reference) {
        meta.sessionId = reference;
      }

      return {
        id: this.generateId(date, amount, narration),
        date: date.toISOString(),
        createdAt: Math.floor(Date.now() / 1000),
        description: narration || 'Transaction',
        amount,
        category: amount > 0 ? TransactionCategory.Inflow : TransactionCategory.Outflow,
        bankSource: BankType.Sterling,
        reference: this.generateReference(date, narration),
        meta,
      };
    } catch {
      return null;
    }
  }

  private parseDate(dateStr: string): Date | null {
    const match = dateStr.match(/(\d{2})-(\d{2})-(\d{4})/);
    if (!match) return null;

    const [, day, month, year] = match;
    const date = new Date(
      Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), 0, 0, 0, 0)
    );

    return isNaN(date.getTime()) ? null : date;
  }

  private parseAmount(moneyInStr: string, moneyOutStr: string): number | null {
    const moneyIn = this.parseAmountValue(moneyInStr);
    const moneyOut = this.parseAmountValue(moneyOutStr);

    if (moneyIn && moneyIn > 0) return moneyIn;
    if (moneyOut && moneyOut > 0) return -moneyOut;
    return null;
  }

  private parseAmountValue(amountStr: string): number | null {
    if (!amountStr || amountStr === '-') return null;
    const cleaned = amountStr.replace(/[₦,\s]/g, '').trim();
    const amount = parseFloat(cleaned);
    if (isNaN(amount) || amount === 0) return null;
    return Math.round(amount * 100);
  }

  private extractCounterparty(narration: string): Partial<TransactionMeta> {
    const oneBankMatch = narration.match(/OneBank Transfer from ([A-Z\s]+) to ([A-Z\s]+)/i);
    if (oneBankMatch) {
      return {
        counterpartyName: oneBankMatch[2].trim(),
        counterpartyBank: 'Sterling Bank',
      };
    }

    const bankNipMatch = narration.match(/BANKNIP From .+? SENDER:\s*([A-Z\s]+?)(?:\s+REMARK:|$)/i);
    if (bankNipMatch) {
      return {
        counterpartyName: bankNipMatch[1].trim(),
      };
    }

    const posMatch = narration.match(/(?:POS Purchase|Bill Payment).+?(?:from|to)\s+([A-Z0-9\s]+)/i);
    if (posMatch) {
      return {
        counterpartyName: posMatch[1].trim(),
      };
    }

    const dataMatch = narration.match(/Data purchase for (\d{11})/i);
    if (dataMatch) {
      return {
        narration: `Data purchase for ${dataMatch[1]}`,
      };
    }

    const airtimeMatch = narration.match(/USSDAirtime .+? to Mobile (\d{11})/i);
    if (airtimeMatch) {
      return {
        narration: `Airtime for ${airtimeMatch[1]}`,
      };
    }

    return {};
  }

  private inferTransactionType(narration: string): TransactionType {
    const lower = narration.toLowerCase();

    if (lower.includes('onebank transfer') || lower.includes('banknip') ||
        lower.includes('nip ') || lower.includes('transfer')) {
      return TransactionType.Transfer;
    }

    if (lower.includes('airtime') || lower.includes('data purchase') ||
        lower.includes('ussdairtime')) {
      return TransactionType.Airtime;
    }

    if (lower.includes('pos purchase') || lower.includes('pos ') ||
        lower.includes('web purchase')) {
      return TransactionType.CardPayment;
    }

    if (lower.includes('bill payment')) {
      return TransactionType.BillPayment;
    }

    if (lower.includes('sms notification charge') || lower.includes('govt levy') ||
        lower.includes('emt ') || lower.includes('charge')) {
      return TransactionType.BankCharge;
    }

    if (lower.includes('remitastp') || lower.includes('remita')) {
      return TransactionType.Transfer;
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

  private generateId(date: Date, amount: number, narration: string): string {
    const hash = this.simpleHash(`${date.toISOString()}-${amount}-${narration}`);
    return `sterling-${hash}`;
  }

  private generateReference(date: Date, narration?: string): string {
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const descPart = narration?.substring(0, 15) || '';
    return `${dateStr}-${descPart}`.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
  }
}
