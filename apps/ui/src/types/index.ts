// ---------------------------------------------------------------------------
// Parser DTO
//
// What a bank parser emits for a single statement line. This is deliberately
// separate from the stored ledger row: parsers know about one file, they do
// not know which account it belongs to, what position the row holds, or who
// the counterparty is as a persistent identity. The ingest layer decides all
// of that. Keeping the seam here means a parser change never touches storage
// and vice versa.
// ---------------------------------------------------------------------------

export interface ParsedTransaction {
  id: string;
  date: string; // ISO string
  createdAt: number; // unix timestamp
  description: string;
  amount: number; // signed minor units (positive = inflow, negative = outflow)
  category: TransactionCategory; // direction, as seen by the parser
  bankSource: BankType;
  reference: string;
  meta?: TransactionMeta;
}

export interface TransactionMeta {
  // Counterparty info
  counterpartyName?: string;
  counterpartyAccount?: string;
  counterpartyBank?: string;

  // Transaction type classification
  type?: TransactionType;

  // For bill payments
  billType?: string;
  billProvider?: string;
  billToken?: string; // electricity token, etc.

  // For transfers
  narration?: string;

  /** Value date, where the bank distinguishes it from the transaction date. */
  valueDate?: string;

  // Original raw category from bank
  rawCategory?: string;

  // Balance after transaction (if available)
  balanceAfter?: number;

  /** Account number of the statement holder, when the statement declares it. */
  ownAccountNumber?: string;
}

export enum TransactionType {
  Transfer = 'transfer',
  BillPayment = 'bill_payment',
  Airtime = 'airtime',
  CardPayment = 'card_payment',
  AtmWithdrawal = 'atm_withdrawal',
  BankCharge = 'bank_charge',
  Interest = 'interest',
  Reversal = 'reversal',
  Other = 'other',
}

export enum BankType {
  Kuda = 'kuda',
  PalmPay = 'palmpay',
  Wema = 'wema',
  OPay = 'opay',
  GTB = 'gtb',
  Access = 'access',
  Zenith = 'zenith',
  FirstBank = 'firstbank',
  UBA = 'uba',
  Fidelity = 'fidelity',
  StandardChartered = 'standardchartered',
  FCMB = 'fcmb',
  Sterling = 'sterling',
}

/** Direction of a single line, as the parser sees it. */
export enum TransactionCategory {
  Inflow = 'inflow',
  Outflow = 'outflow',
}

export type RawRow = (string | number | undefined)[];

export interface BankParser {
  bankName: string;
  parseTransaction(row: RawRow, rowIndex: number): ParsedTransaction | null;
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export type CurrencyCode = 'NGN' | 'USD' | 'GBP' | 'EUR';

/** Minor units per major unit. Every currency here has two decimals. */
export const MINOR_UNITS = 100;

export const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  NGN: '₦',
  USD: '$',
  GBP: '£',
  EUR: '€',
};

export interface Account {
  id: string;
  bank: BankType;
  numberMasked: string;
  name: string;
  currency: CurrencyCode;
  openingBalanceMinor: number | null;
  createdAt: string;
}

export interface ImportRecord {
  id: string;
  accountId: string;
  fileName: string;
  fileHash: string;
  parserId: string;
  parserVersion: string;
  periodStart: string | null;
  periodEnd: string | null;
  rowsSeen: number;
  rowsParsed: number;
  reconciled: boolean | null;
  reconcileBreaks: number;
  importedAt: string;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  isSystem: boolean;
}

export type CategorySource = 'parser' | 'rule' | 'user';

/**
 * Where a rule came from. `suggested` rules are AI guesses awaiting review;
 * they stay inert to nothing — they apply — but the UI can list and reject
 * them in bulk.
 */
export type RuleSource = 'system' | 'user' | 'suggested';

export type RuleMatchField = 'description' | 'counterparty' | 'kind' | 'any';
export type RuleMatchType = 'contains' | 'equals' | 'regex';

export interface Rule {
  id: string;
  matchField: RuleMatchField;
  matchType: RuleMatchType;
  pattern: string;
  categoryId: string;
  priority: number;
  source?: RuleSource;
}

/** A stored ledger row. */
export interface LedgerTransaction {
  id: string;
  accountId: string;
  importId: string;
  bookedAt: string;
  valueAt: string | null;
  seq: number;
  amountMinor: number;
  currency: CurrencyCode;
  balanceAfterMinor: number | null;
  description: string;
  narration: string | null;
  reference: string;
  counterpartyId: string | null;
  kind: TransactionType;
  categoryId: string | null;
  categorySource: CategorySource | null;
  parentTransactionId: string | null;
  transferGroupId: string | null;

  // Joined for display
  counterpartyName?: string | null;
  categoryName?: string | null;
  accountBank?: BankType;
  accountLabel?: string;
}

// ---------------------------------------------------------------------------
// Import pipeline
// ---------------------------------------------------------------------------

export type FileFormat = 'pdf' | 'excel' | 'csv';

export interface BankInfo {
  id: BankType;
  name: string;
  available: boolean;
  fileFormat?: FileFormat;
  requiresPassword?: boolean;
}

/** A point where the statement's own running balance stops adding up. */
export interface ReconcileBreak {
  transactionId: string;
  bookedAt: string;
  expectedMinor: number;
  actualMinor: number;
  deltaMinor: number;
}

export interface ReconcileResult {
  /** null when the statement carries no balance column to check against. */
  ok: boolean | null;
  checked: number;
  breaks: ReconcileBreak[];
}

export interface ImportSummary {
  importId: string;
  accountId: string;
  rowsSeen: number;
  rowsParsed: number;
  inserted: number;
  duplicates: number;
  reconcile: ReconcileResult;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface ParseFailure {
  rowIndex: number;
  message: string;
}

export type ParseErrorCode =
  | 'password_required'
  | 'password_incorrect'
  | 'unsupported_bank'
  | 'no_transactions'
  | 'parse_failed';

export interface ParseOutput {
  transactions: ParsedTransaction[];
  rowsSeen: number;
  failures: ParseFailure[];
  error?: string;
  errorCode?: ParseErrorCode;
}

export type ProcessingStatus =
  | { stage: 'idle' }
  | { stage: 'parsing'; progress: number; message: string }
  | { stage: 'complete'; summary: ImportSummary; suggestions?: SuggestedRulesOutcome }
  | { stage: 'error'; message: string };

/** Result of one AI categorisation pass over an import. */
export interface SuggestedRulesOutcome {
  rules: number;
  rows: number;
}

// ---------------------------------------------------------------------------
// Settings / chat
// ---------------------------------------------------------------------------

export type Theme = 'light' | 'dark' | 'system';

export type ChatModeType = 'off' | 'cloud' | 'local';
export type LocalServerStatus = 'idle' | 'testing' | 'connected' | 'error';

export type ChatMode =
  | { type: 'off' }
  | { type: 'cloud' }
  | {
      type: 'local';
      status: LocalServerStatus;
      url: string;
      model: string;
      models: string[];
      error: string | null;
    };

export type LocalChatMode = Extract<ChatMode, { type: 'local' }>;

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface MonthlyData {
  month: string;
  inflow: number;
  outflow: number;
}

export interface CategorySpend {
  categoryId: string | null;
  categoryName: string;
  amountMinor: number;
  share: number;
  count: number;
}

export interface CounterpartySpend {
  counterpartyId: string | null;
  name: string;
  amountMinor: number;
  count: number;
}

export interface BalancePoint {
  at: string;
  balanceMinor: number;
}
