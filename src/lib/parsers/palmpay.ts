import {
  type BankParser,
  type RawRow,
  type Transaction,
  type TransactionMeta,
  BankType,
  TransactionCategory,
  TransactionType,
} from '~/types';

const DATE_PATTERN = /^\d{2}\/\d{2}\/\d{4}/;
const AMOUNT_PATTERN = /^[+-]?[\d,.]+$/;
const TX_ID_PATTERN = /^[a-z0-9_]+$/i;

export class PalmPayParser implements BankParser {
  readonly bankName = 'PalmPay';

  static extractRowsFromPdfText(text: string): RawRow[] {
    const rows: RawRow[] = [];
    const datePattern = /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+(?:AM|PM))/gi;
    const chunks = text.split(datePattern).filter(Boolean);
    
    for (let i = 1; i < chunks.length - 1; i += 2) {
      const dateTime = chunks[i].trim();
      const rest = chunks[i + 1]?.trim() || '';
      
      if (!dateTime || !rest) continue;
      if (rest.includes('Transaction Date') || rest.includes('Transaction Detail')) continue;
      
      const amountMatch = rest.match(/([+-]\d+(?:,\d{3})*\.\d{2})/);
      
      if (amountMatch) {
        const amount = amountMatch[1];
        const amountIndex = rest.indexOf(amount);
        const description = rest.slice(0, amountIndex).trim();
        const transactionId = rest.slice(amountIndex + amount.length).trim();
        
        rows.push([`${dateTime} ${description}`, amount, transactionId]);
      }
    }
    
    return rows;
  }

  static preprocessRows(rows: RawRow[]): RawRow[] {
    const result: RawRow[] = [];
    let pendingForwardContinuations: string[] = [];
    
    for (const row of rows) {
      const firstCell = row[0]?.toString() || '';
      const startsWithDate = DATE_PATTERN.test(firstCell);
      const nonEmptyCells = row.filter((cell) => cell !== undefined && cell !== '');
      
      const continuationText = nonEmptyCells.length === 1 
        ? nonEmptyCells[0]?.toString() || ''
        : '';
      
      const isContinuation = !startsWithDate && 
                             nonEmptyCells.length === 1 && 
                             this.isDescriptionContinuation(continuationText);
      
      if (startsWithDate) {
        if (pendingForwardContinuations.length > 0) {
          const descColIdx = row.length > 1 ? 1 : 0;
          const existingDesc = row[descColIdx]?.toString() || '';
          row[descColIdx] = [...pendingForwardContinuations, existingDesc].filter(Boolean).join(' ');
          pendingForwardContinuations = [];
        }
        result.push(row);
      } else if (isContinuation) {
        const isForwardContinuation = this.isForwardContinuation(continuationText);
        
        if (isForwardContinuation) {
          pendingForwardContinuations.push(continuationText);
        } else if (result.length > 0) {
          const prevRow = result[result.length - 1];
          const descColIdx = prevRow.length > 1 ? 1 : 0;
          if (prevRow && prevRow[descColIdx] !== undefined) {
            prevRow[descColIdx] = prevRow[descColIdx]!.toString() + ' ' + continuationText;
          }
        }
      } else {
        result.push(row);
      }
    }
    
    return result;
  }

  private static isForwardContinuation(text: string): boolean {
    const lower = text.toLowerCase().trim();
    return lower.startsWith('send to ') || lower.startsWith('received from ');
  }

  private static isDescriptionContinuation(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (AMOUNT_PATTERN.test(trimmed)) return false;
    if (TX_ID_PATTERN.test(trimmed)) return false;
    if (/^\d+$/.test(trimmed)) return false;
    return true;
  }

  parseTransaction(row: RawRow, _rowIndex: number): Transaction | null {
    if (!row || row.length < 3) return null;

    try {
      const { date, description, amountStr, transactionId } = this.extractRowData(row);

      if (!date) return null;

      const amount = this.parseSignedAmount(amountStr);
      if (amount === null) return null;

      const txDescription = description || 'Transaction';
      const counterpartyInfo = this.extractCounterparty(description);

      const meta: TransactionMeta = {
        type: this.inferTransactionType(description),
        narration: description,
        ...counterpartyInfo,
      };

      return {
        id: this.generateId(date, amount, transactionId, description),
        date: date.toISOString(),
        createdAt: Math.floor(Date.now() / 1000),
        description: txDescription,
        amount,
        category: amount > 0 ? TransactionCategory.Inflow : TransactionCategory.Outflow,
        bankSource: BankType.PalmPay,
        reference: transactionId || this.generateReference(date, description),
        meta,
      };
    } catch {
      return null;
    }
  }

  private extractRowData(row: RawRow): { 
    date: Date | null; 
    description: string; 
    amountStr: string; 
    transactionId: string;
  } {
    const firstCell = row[0]?.toString().trim() || '';
    
    if (row.length >= 4) {
      const dateStr = firstCell;
      const description = row[1]?.toString().trim() || '';
      const moneyIn = row[2]?.toString().trim() || '';
      const moneyOut = row[3]?.toString().trim() || '';
      const transactionId = row[4]?.toString().trim() || row[3]?.toString().trim() || '';
      
      const date = this.parseDateTime(dateStr);
      const amountStr = moneyIn || moneyOut;
      const txId = moneyIn ? (row[4]?.toString().trim() || '') : transactionId;
      
      return { date, description, amountStr, transactionId: txId };
    }

    const parsed = this.parseDateTimeAndDescription(firstCell);
    if (!parsed) {
      return { date: null, description: '', amountStr: '', transactionId: '' };
    }

    return {
      date: parsed.date,
      description: parsed.description,
      amountStr: row[1]?.toString().trim() || '',
      transactionId: row[2]?.toString().trim() || '',
    };
  }

  private parseDateTimeAndDescription(input: string): { date: Date; description: string } | null {
    // Format: "12/29/2025 06:19:00 AM CashBox Interest"
    // Date pattern: MM/DD/YYYY HH:MM:SS AM/PM
    const datePattern = /^(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+(?:AM|PM))\s*(.*)/i;
    const match = input.match(datePattern);
    if (!match) return null;

    const [, dateTimeStr, description] = match;
    const date = this.parseDateTime(dateTimeStr);
    if (!date) return null;

    return { date, description: description.trim() };
  }

  private parseDateTime(dateStr: string): Date | null {
    const match = dateStr.match(
      /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+(AM|PM)/i
    );
    if (!match) return null;

    const [, month, day, year, hourStr, minute, second, meridiem] = match;
    
    let hour = parseInt(hourStr, 10);
    if (meridiem.toUpperCase() === 'PM' && hour !== 12) {
      hour += 12;
    } else if (meridiem.toUpperCase() === 'AM' && hour === 12) {
      hour = 0;
    }

    const date = new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      hour,
      parseInt(minute, 10),
      parseInt(second, 10)
    );

    return isNaN(date.getTime()) ? null : date;
  }

  private parseSignedAmount(amountStr: string): number | null {
    const isNegative = amountStr.startsWith('-');
    const cleaned = amountStr.replace(/[+\-₦$,\s]/g, '').trim();

    const amount = parseFloat(cleaned);
    if (isNaN(amount)) return null;

    const amountInKobo = Math.round(amount * 100);
    return isNegative ? -amountInKobo : amountInKobo;
  }

  private extractCounterparty(description?: string): Partial<TransactionMeta> {
    if (!description) return {};

    const receivedMatch = description.match(/Received from\s+(.+)/i);
    if (receivedMatch) {
      return { counterpartyName: receivedMatch[1].trim() };
    }

    const sendMatch = description.match(/Send to\s+(.+)/i);
    if (sendMatch) {
      return { counterpartyName: sendMatch[1].trim() };
    }

    return {};
  }

  private inferTransactionType(description?: string): TransactionType {
    if (!description) return TransactionType.Other;
    
    const lower = description.toLowerCase();

    if (lower.includes('airtime') || lower.includes('recharge')) {
      return TransactionType.Airtime;
    }
    if (lower.includes('bill') || lower.includes('electricity') || lower.includes('dstv') || lower.includes('gotv')) {
      return TransactionType.BillPayment;
    }
    if (lower.includes('card') || lower.includes('pos')) {
      return TransactionType.CardPayment;
    }
    if (lower.includes('atm') || lower.includes('withdrawal')) {
      return TransactionType.AtmWithdrawal;
    }
    if (lower.includes('levy') || lower.includes('charge') || lower.includes('fee') || lower.includes('vat')) {
      return TransactionType.BankCharge;
    }
    if (lower.includes('interest') || lower.includes('cashbox')) {
      return TransactionType.Interest;
    }
    if (lower.includes('reversal') || lower.includes('refund')) {
      return TransactionType.Reversal;
    }
    if (lower.includes('send to') || lower.includes('received from') || lower.includes('transfer')) {
      return TransactionType.Transfer;
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
    return `palmpay-${hash}`;
  }

  private generateReference(date: Date, description?: string): string {
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const descPart = description?.substring(0, 10) || '';
    return `${dateStr}-${descPart}`.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
  }
}
