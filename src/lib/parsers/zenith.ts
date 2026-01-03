import {
  type BankParser,
  type RawRow,
  type Transaction,
  type TransactionMeta,
  BankType,
  TransactionCategory,
  TransactionType,
} from '~/types';

export class ZenithBankParser implements BankParser {
  readonly bankName = 'Zenith Bank';

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

    try {
      const dateStr = row[0]?.toString().trim() || '';
      const description = row[1]?.toString().trim() || '';
      const debitStr = row[2]?.toString().trim() || '';
      const creditStr = row[3]?.toString().trim() || '';
      const valueDate = row[4]?.toString().trim() || '';
      const balanceStr = row[5]?.toString().trim() || '';

      const date = this.parseDate(dateStr);
      if (!date) return null;

      const amount = this.parseAmount(debitStr, creditStr);
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

      return {
        id: this.generateId(date, amount, description, valueDate),
        date: date.toISOString(),
        createdAt: Math.floor(Date.now() / 1000),
        description: description || 'Transaction',
        amount,
        category:
          amount > 0 ? TransactionCategory.Inflow : TransactionCategory.Outflow,
        bankSource: BankType.Zenith,
        reference: this.generateReference(date, description),
        meta,
      };
    } catch {
      return null;
    }
  }

  private parseDate(dateStr: string): Date | null {
    const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!match) return null;

    const [, day, month, year] = match;
    const date = new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10)
    );

    return isNaN(date.getTime()) ? null : date;
  }

  private parseAmount(debitStr: string, creditStr: string): number | null {
    const debit = this.parseAmountValue(debitStr);
    const credit = this.parseAmountValue(creditStr);

    if (credit && credit > 0) {
      return credit;
    }

    if (debit && debit > 0) {
      return -debit;
    }

    return null;
  }

  private parseAmountValue(amountStr: string): number | null {
    if (!amountStr) return null;

    const cleaned = amountStr.replace(/[₦,\s]/g, '').trim();
    const amount = parseFloat(cleaned);

    if (isNaN(amount) || amount === 0) return null;

    return Math.round(amount * 100);
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

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private generateId(
    date: Date,
    amount: number,
    description: string,
    valueDate?: string
  ): string {
    const hash = this.simpleHash(
      `${date.toISOString()}-${amount}-${description}-${valueDate || ''}`
    );
    return `zenith-${hash}`;
  }

  private generateReference(date: Date, description?: string): string {
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const descPart = description?.substring(0, 15) || '';
    return `${dateStr}-${descPart}`
      .replace(/[^a-zA-Z0-9-]/g, '')
      .toUpperCase();
  }
}
