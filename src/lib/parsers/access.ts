import {
  type BankParser,
  type RawRow,
  type Transaction,
  type TransactionMeta,
  BankType,
  TransactionCategory,
  TransactionType,
} from '~/types';

export class AccessParser implements BankParser {
  readonly bankName = 'Access';

  static extractRowsFromPdfText(text: string): RawRow[] {
    const rows: RawRow[] = [];

    const amountPattern = '(?:\\d{1,3}(?:,\\d{3})*\\.\\d{2}|-)';
    const datePattern = '\\d{2}-[A-Z]{3}-\\d{2}';

    const txPattern = new RegExp(
      `(${datePattern})\\s+(${datePattern})\\s+(.+?)\\s+(${amountPattern})\\s+(${amountPattern})\\s+(\\d{1,3}(?:,\\d{3})*\\.\\d{2})`,
      'gi'
    );

    let match;
    while ((match = txPattern.exec(text)) !== null) {
      const [, postedDate, valueDate, description, debit, credit, balance] = match;

      if (
        description.includes('Posted Date') ||
        description.includes('Value Date') ||
        description.includes('Description') ||
        description === 'Opening Balance'
      ) {
        continue;
      }

      rows.push([
        postedDate,
        valueDate,
        description.trim(),
        debit,
        credit,
        balance,
      ]);
    }

    return rows;
  }

  parseTransaction(row: RawRow, _rowIndex: number): Transaction | null {
    if (!row || row.length < 6) return null;

    try {
      const postedDateStr = row[0]?.toString().trim() || '';
      const valueDateStr = row[1]?.toString().trim() || '';
      const description = row[2]?.toString().trim() || '';
      const debitStr = row[3]?.toString().trim() || '';
      const creditStr = row[4]?.toString().trim() || '';
      const balanceStr = row[5]?.toString().trim() || '';

      const date = this.parseDate(postedDateStr);
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

      if (valueDateStr) {
        meta.sessionId = valueDateStr;
      }

      return {
        id: this.generateId(date, amount, description),
        date: date.toISOString(),
        createdAt: Math.floor(Date.now() / 1000),
        description: description || 'Transaction',
        amount,
        category: amount > 0 ? TransactionCategory.Inflow : TransactionCategory.Outflow,
        bankSource: BankType.Access,
        reference: this.generateReference(date, description),
        meta,
      };
    } catch {
      return null;
    }
  }

  private parseDate(dateStr: string): Date | null {
    const months: Record<string, number> = {
      JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
      JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
    };

    const match = dateStr.match(/(\d{2})-([A-Z]{3})-(\d{2})/i);
    if (!match) return null;

    const [, day, monthStr, year] = match;
    const month = months[monthStr.toUpperCase()];
    if (month === undefined) return null;

    const fullYear = 2000 + parseInt(year, 10);
    const date = new Date(Date.UTC(fullYear, month, parseInt(day, 10), 0, 0, 0, 0));

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
    const mobileTrfMatch = description.match(/MOBILE TRF (?:TO|FROM) ([A-Z]{3})\/ (.+)/i);
    if (mobileTrfMatch) {
      const bankCode = mobileTrfMatch[1];
      const rest = mobileTrfMatch[2];
      const parts = rest.split('/');
      const counterpartyName = parts[parts.length - 1]?.trim() || parts[0]?.trim();
      
      return {
        counterpartyBank: this.resolveBankCode(bankCode),
        counterpartyName,
      };
    }

    const nipMatch = description.match(/NIP (?:TFR FROM|Transfer to) ([^.]+)/i);
    if (nipMatch) {
      return {
        counterpartyName: nipMatch[1].trim(),
      };
    }

    const trfFromMatch = description.match(/TRF\/\/FRM (.+?) TO (.+)/i);
    if (trfFromMatch) {
      return {
        counterpartyName: trfFromMatch[2].trim(),
      };
    }

    return {};
  }

  private resolveBankCode(code: string): string {
    const bankCodes: Record<string, string> = {
      GTB: 'GTB',
      PAY: 'OPay',
      FBN: 'First Bank',
      MMF: 'Moniepoint',
      WBP: 'Wema Bank',
      SPB: 'Sterling Bank',
      STL: 'Sterling Bank',
      PPL: 'PalmPay',
      FMO: 'FCMB',
      KMF: 'Kuda',
      ACCESS: 'Access Bank',
    };
    return bankCodes[code.toUpperCase()] || code;
  }

  private inferTransactionType(description: string): TransactionType {
    const lower = description.toLowerCase();

    if (lower.includes('mobile trf to') || lower.includes('mobile trf from') || 
        lower.includes('nip tfr') || lower.includes('nip transfer') ||
        lower.includes('trf//frm')) {
      return TransactionType.Transfer;
    }
    if (lower.includes('web pymt')) {
      return TransactionType.CardPayment;
    }
    if (lower.includes('pos pymt')) {
      return TransactionType.CardPayment;
    }
    if (lower.includes('atm cash wdl')) {
      return TransactionType.AtmWithdrawal;
    }
    if (lower.includes('bills pymt') || lower.includes('airtime')) {
      return TransactionType.BillPayment;
    }
    if (lower.includes('commission') || lower.includes('vat ') || 
        lower.includes('sms alert fee') || lower.includes('levy')) {
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
    return `access-${hash}`;
  }

  private generateReference(date: Date, description?: string): string {
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const descPart = description?.substring(0, 15) || '';
    return `${dateStr}-${descPart}`.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
  }
}
