import {
  type BankParser,
  type RawRow,
  type Transaction,
  type TransactionMeta,
  TransactionCategory,
  TransactionType,
  type BankType,
} from '~/types';

/**
 * Error details from parsing a transaction row
 */
export interface ParseError {
  rowIndex: number;
  message: string;
  row?: RawRow;
}

/**
 * Result of parsing a transaction - either success with data or failure with error
 */
export type ParseResult =
  | { success: true; transaction: Transaction }
  | { success: false; error: ParseError | null };

/**
 * Logger interface for parser errors
 */
export interface ParserLogger {
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
}

/**
 * Default console logger
 */
export const consoleLogger: ParserLogger = {
  error: (message, context) => {
    if (import.meta.env.DEV) {
      console.error(`[Parser Error] ${message}`, context);
    }
  },
  warn: (message, context) => {
    if (import.meta.env.DEV) {
      console.warn(`[Parser Warning] ${message}`, context);
    }
  },
};

/**
 * No-op logger for production or when logging is disabled
 */
export const noopLogger: ParserLogger = {
  error: () => {},
  warn: () => {},
};

/**
 * Month name to index mapping (case-insensitive)
 */
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Base parser class with shared utilities for all bank parsers.
 * Provides common functionality for parsing amounts, dates, generating IDs, and error handling.
 */
export abstract class BaseParser implements BankParser {
  abstract readonly bankName: string;
  protected abstract readonly bankType: BankType;
  protected abstract readonly idPrefix: string;

  protected logger: ParserLogger;

  constructor(logger: ParserLogger = consoleLogger) {
    this.logger = logger;
  }

  /**
   * Parse a transaction row. Must be implemented by subclasses.
   */
  abstract parseTransaction(row: RawRow, rowIndex: number): Transaction | null;

  /**
   * Parse a transaction with detailed error information.
   * Wraps parseTransaction with error handling and logging.
   */
  parseTransactionSafe(row: RawRow, rowIndex: number): ParseResult {
    try {
      const transaction = this.parseTransaction(row, rowIndex);
      if (transaction) {
        return { success: true, transaction };
      }
      // Null result means row was skipped (e.g., header row, filtered transaction)
      return { success: false, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown parsing error';
      const error: ParseError = {
        rowIndex,
        message,
        row,
      };
      this.logger.error(`Failed to parse row ${rowIndex}`, {
        bank: this.bankName,
        error: message,
        row,
      });
      return { success: false, error };
    }
  }

  /**
   * Simple hash function for generating unique IDs.
   * Produces a base36 string from input.
   */
  protected simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Generate a unique transaction ID.
   * @param date - Transaction date
   * @param amount - Transaction amount in kobo
   * @param parts - Additional parts to include in hash (reference, description, etc.)
   */
  protected generateId(date: Date, amount: number, ...parts: (string | undefined)[]): string {
    const hashInput = [date.toISOString(), String(amount), ...parts.filter(Boolean)].join('-');
    return `${this.idPrefix}-${this.simpleHash(hashInput)}`;
  }

  /**
   * Generate a reference string from date and description.
   * @param date - Transaction date
   * @param description - Transaction description
   * @param maxDescLength - Maximum characters to take from description (default: 10)
   */
  protected generateReference(date: Date, description?: string, maxDescLength = 10): string {
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const descPart = description?.substring(0, maxDescLength) || '';
    return `${dateStr}-${descPart}`.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
  }

  /**
   * Parse an amount string to kobo (integer cents).
   * Removes currency symbols, commas, and whitespace.
   * @param amountStr - Amount string (e.g., "₦1,234.56" or "1234.56")
   * @returns Amount in kobo, or null if invalid
   */
  protected parseAmountValue(amountStr: string | undefined): number | null {
    if (!amountStr || amountStr === '-' || amountStr === '--') return null;
    const cleaned = amountStr.replace(/[₦$,\s]/g, '').trim();
    const amount = parseFloat(cleaned);
    if (isNaN(amount) || amount === 0) return null;
    return Math.round(amount * 100);
  }

  /**
   * Parse debit/credit columns into a signed amount.
   * Credit = positive (inflow), Debit = negative (outflow).
   * @param debitStr - Debit column value
   * @param creditStr - Credit column value
   */
  protected parseDebitCredit(debitStr?: string, creditStr?: string): number | null {
    const credit = this.parseAmountValue(creditStr);
    const debit = this.parseAmountValue(debitStr);

    if (credit && credit > 0) return credit;
    if (debit && debit > 0) return -debit;
    return null;
  }

  /**
   * Parse a month name to its index (0-11).
   * Case-insensitive.
   */
  protected parseMonthName(monthStr: string): number | undefined {
    return MONTHS[monthStr.toLowerCase()];
  }

  /**
   * Parse a date string in DD-MMM-YYYY format (e.g., "15-Nov-2025").
   * @param dateStr - Date string to parse
   * @param useUTC - Whether to create UTC date (default: true)
   */
  protected parseDDMMMYYYY(dateStr: string, useUTC = true): Date | null {
    const match = dateStr.match(/(\d{2})-([A-Za-z]{3})-(\d{4})/);
    if (!match) return null;

    const [, day, monthStr, year] = match;
    const month = this.parseMonthName(monthStr);
    if (month === undefined) return null;

    const date = useUTC
      ? new Date(Date.UTC(parseInt(year, 10), month, parseInt(day, 10), 0, 0, 0, 0))
      : new Date(parseInt(year, 10), month, parseInt(day, 10));

    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Parse a date string in DD/MM/YYYY format (e.g., "15/11/2025").
   */
  protected parseDDMMYYYY(dateStr: string): Date | null {
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

  /**
   * Parse a date string in DD-MM-YYYY format (e.g., "15-11-2025").
   */
  protected parseDDMMYYYYDash(dateStr: string): Date | null {
    const match = dateStr.match(/(\d{2})-(\d{2})-(\d{4})/);
    if (!match) return null;

    const [, day, month, year] = match;
    const date = new Date(
      Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), 0, 0, 0, 0)
    );

    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Create a transaction object with common defaults.
   */
  protected createTransaction(params: {
    date: Date;
    amount: number;
    description: string;
    reference: string;
    meta?: TransactionMeta;
  }): Transaction {
    return {
      id: this.generateId(params.date, params.amount, params.reference, params.description),
      date: params.date.toISOString(),
      createdAt: Math.floor(Date.now() / 1000),
      description: params.description,
      amount: params.amount,
      category: params.amount > 0 ? TransactionCategory.Inflow : TransactionCategory.Outflow,
      bankSource: this.bankType,
      reference: params.reference,
      meta: params.meta,
    };
  }

  /**
   * Infer transaction type from common keywords in description.
   * Subclasses can override or extend this.
   */
  protected inferBaseTransactionType(description: string): TransactionType {
    const lower = description.toLowerCase();

    if (lower.includes('reversal') || lower.includes('refund')) {
      return TransactionType.Reversal;
    }
    if (lower.includes('interest')) {
      return TransactionType.Interest;
    }
    if (lower.includes('airtime') || lower.includes('recharge')) {
      return TransactionType.Airtime;
    }
    if (lower.includes('levy') || lower.includes('charge') || lower.includes('fee') || lower.includes('vat ')) {
      return TransactionType.BankCharge;
    }
    if (lower.includes('atm') || lower.includes('withdrawal')) {
      return TransactionType.AtmWithdrawal;
    }
    if (lower.includes('pos') || lower.includes('card')) {
      return TransactionType.CardPayment;
    }
    if (lower.includes('transfer') || lower.includes('nip') || lower.includes('trf')) {
      return TransactionType.Transfer;
    }

    return TransactionType.Other;
  }
}
