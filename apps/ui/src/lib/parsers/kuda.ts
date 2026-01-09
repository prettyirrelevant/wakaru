import {
  type RawRow,
  type Transaction,
  type TransactionMeta,
  BankType,
  TransactionType,
} from '~/types';
import { BaseParser, type ParserLogger, consoleLogger } from './base';

export class KudaParser extends BaseParser {
  readonly bankName = 'Kuda';
  protected readonly bankType = BankType.Kuda;
  protected readonly idPrefix = 'kuda';

  constructor(logger: ParserLogger = consoleLogger) {
    super(logger);
  }

  parseTransaction(row: RawRow, _rowIndex: number): Transaction | null {
    // Skip empty rows or rows that are too short
    if (!row || row.length < 6) return null;

    // Kuda Excel format:
    // [Date/Time, empty, Money In, empty, Money out, empty, Category, empty, To/From, empty, Description, empty, Balance]
    // Indices: 0       1        2        3         4        5         6        7        8        9         10        11       12
    const dateTime = row[0]?.toString().trim();
    const moneyIn = row[2]?.toString().trim();
    const moneyOut = row[4]?.toString().trim();
    const category = row[6]?.toString().trim();
    const toFrom = row[8]?.toString().trim();
    const description = row[10]?.toString().trim();

    // Skip if no valid date/time (this filters out headers and other non-transaction rows)
    if (!dateTime) return null;

    const date = this.parseKudaDate(dateTime);
    // If date parsing fails, this isn't a transaction row
    if (!date) return null;

    const amount = this.parseKudaAmount(moneyIn, moneyOut);
    if (amount === null) return null;

    const reference = this.generateKudaReference(dateTime, toFrom, description);

    // Use actual description, fallback to category if empty
    const txDescription = description || category || 'Transaction';

    // Build meta with counterparty info
    const meta: TransactionMeta = {
      type: this.inferTransactionType(category, description),
      rawCategory: category,
      narration: [description, toFrom, category].filter(Boolean).join(' - '),
    };

    // Parse counterparty info from toFrom field
    // Format: "Name/AccountNumber/BankName" e.g. "Olayinka Jubril Ganiyu/2211391117/Zenith Bank Plc"
    if (toFrom) {
      const parts = toFrom.split('/');
      if (parts.length >= 1 && parts[0]) {
        meta.counterpartyName = parts[0].trim();
      }
      if (parts.length >= 2 && parts[1]) {
        meta.counterpartyAccount = parts[1].trim();
      }
      if (parts.length >= 3 && parts[2]) {
        meta.counterpartyBank = parts[2].trim();
      }
    }

    return this.createTransaction({
      date,
      amount,
      description: txDescription,
      reference,
      meta,
    });
  }

  private parseKudaDate(dateStr: string): Date | null {
    // Format: "22/01/23 12:46:35"
    const match = dateStr.match(
      /(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/
    );
    if (!match) return null;

    const [, day, month, year, hour, minute, second] = match;
    const fullYear = 2000 + parseInt(year, 10);

    const date = new Date(
      fullYear,
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      parseInt(second, 10)
    );

    return isNaN(date.getTime()) ? null : date;
  }

  private generateKudaReference(
    dateTime: string,
    toFrom?: string,
    description?: string
  ): string {
    const parts = [
      dateTime.substring(0, 8),
      toFrom?.substring(0, 10),
      description?.substring(0, 10),
    ].filter(Boolean);

    return parts.join('-').replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
  }

  private parseKudaAmount(moneyIn?: string, moneyOut?: string): number | null {
    if (moneyIn && moneyIn.trim()) {
      return this.parseAmountValue(moneyIn);
    }

    if (moneyOut && moneyOut.trim()) {
      const amount = this.parseAmountValue(moneyOut);
      return amount ? -amount : null;
    }

    return null;
  }

  private inferTransactionType(category?: string, description?: string): TransactionType {
    const combined = `${category || ''} ${description || ''}`.toLowerCase();

    if (combined.includes('airtime') || combined.includes('recharge')) {
      return TransactionType.Airtime;
    }
    if (combined.includes('bill') || combined.includes('electricity') || combined.includes('dstv') || combined.includes('gotv')) {
      return TransactionType.BillPayment;
    }
    if (combined.includes('card') || combined.includes('pos')) {
      return TransactionType.CardPayment;
    }
    if (combined.includes('atm') || combined.includes('withdrawal')) {
      return TransactionType.AtmWithdrawal;
    }
    if (combined.includes('charge') || combined.includes('fee') || combined.includes('vat')) {
      return TransactionType.BankCharge;
    }
    if (combined.includes('interest')) {
      return TransactionType.Interest;
    }
    if (combined.includes('reversal') || combined.includes('refund')) {
      return TransactionType.Reversal;
    }
    if (combined.includes('transfer') || combined.includes('sent') || combined.includes('received')) {
      return TransactionType.Transfer;
    }

    return TransactionType.Other;
  }
}
