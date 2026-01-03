import {
  type BankParser,
  type RawRow,
  type Transaction,
  type TransactionMeta,
  BankType,
  TransactionCategory,
  TransactionType,
} from '~/types';

export class WemaParser implements BankParser {
  readonly bankName = 'Wema';

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

  parseTransaction(row: RawRow, _rowIndex: number): Transaction | null {
    if (!row || row.length < 4) return null;

    try {
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

      return {
        id: this.generateId(date, amount, reference, description),
        date: date.toISOString(),
        createdAt: Math.floor(Date.now() / 1000),
        description: description || 'Transaction',
        amount,
        category: amount > 0 ? TransactionCategory.Inflow : TransactionCategory.Outflow,
        bankSource: BankType.Wema,
        reference: reference || this.generateReference(date, description),
        meta,
      };
    } catch {
      return null;
    }
  }

  private parseDate(dateStr: string): Date | null {
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };

    const match = dateStr.match(/(\d{2})-([A-Za-z]{3})-?\s*(\d{4})/);
    if (!match) return null;

    const [, day, monthStr, year] = match;
    const month = months[monthStr.toLowerCase()];
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

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private generateId(date: Date, amount: number, reference?: string, description?: string): string {
    const hash = this.simpleHash(`${date.toISOString()}-${amount}-${reference || ''}-${description || ''}`);
    return `wema-${hash}`;
  }

  private generateReference(date: Date, description?: string): string {
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const descPart = description?.substring(0, 10) || '';
    return `${dateStr}-${descPart}`.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
  }
}
