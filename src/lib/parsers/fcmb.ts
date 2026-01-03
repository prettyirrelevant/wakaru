import {
  type BankParser,
  type RawRow,
  type Transaction,
  type TransactionMeta,
  BankType,
  TransactionCategory,
  TransactionType,
} from '~/types';

export class FcmbParser implements BankParser {
  readonly bankName = 'FCMB';

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

    try {
      const txnDateStr = row[0]?.toString().trim() || '';
      const valDateStr = row[1]?.toString().trim() || '';
      const description = row[2]?.toString().trim() || '';
      const debitStr = row[3]?.toString().trim() || '';
      const creditStr = row[4]?.toString().trim() || '';
      const balanceStr = row[5]?.toString().trim() || '';

      const date = this.parseDate(txnDateStr);
      if (!date) return null;

      const amount = this.parseAmount(debitStr, creditStr);
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

      return {
        id: this.generateId(date, amount, description),
        date: date.toISOString(),
        createdAt: Math.floor(Date.now() / 1000),
        description: description || 'Transaction',
        amount,
        category: amount > 0 ? TransactionCategory.Inflow : TransactionCategory.Outflow,
        bankSource: BankType.FCMB,
        reference: this.generateReference(date, description),
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

    if (credit && credit > 0) {
      return credit;
    }

    if (debit && debit > 0) {
      return -debit;
    }

    return null;
  }

  private parseAmountValue(amountStr: string): number | null {
    if (!amountStr || amountStr === '-') return null;

    const cleaned = amountStr.replace(/[₦,\s]/g, '').trim();
    const amount = parseFloat(cleaned);

    if (isNaN(amount) || amount === 0) return null;

    return Math.round(amount * 100);
  }

  private extractCounterparty(description: string): Partial<TransactionMeta> {
    const appToMatch = description.match(/App(?:\s*:?\s*\w*)?\s+To\s+([^\d]+)/i);
    if (appToMatch) {
      const parts = appToMatch[1].trim().split(/\s+/);
      const bankKeywords = ['Opay', 'Palmpay', 'Kuda', 'MONIEPOINT', 'GTBank', 'Wema', 'VFD', 'POCKETAPP'];
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
    return `fcmb-${hash}`;
  }

  private generateReference(date: Date, description?: string): string {
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const descPart = description?.substring(0, 15) || '';
    return `${dateStr}-${descPart}`.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
  }
}
