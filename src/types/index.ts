export interface Transaction {
  id: string;
  date: string; // ISO string
  createdAt: number; // unix timestamp
  description: string;
  amount: number; // in kobo (positive = inflow, negative = outflow)
  category: TransactionCategory;
  bankSource: BankType;
  reference: string;
  
  // Extended details (optional - populated when available)
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
  sessionId?: string;
  
  // Original raw category from bank
  rawCategory?: string;
  
  // Balance after transaction (if available)
  balanceAfter?: number;
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
  OPay = 'opay',
  GTB = 'gtb',
  Access = 'access',
  Zenith = 'zenith',
  FirstBank = 'firstbank',
  UBA = 'uba',
  Fidelity = 'fidelity',
}

export enum TransactionCategory {
  Inflow = 'inflow',
  Outflow = 'outflow',
}

export interface BankInfo {
  id: BankType;
  name: string;
  available: boolean;
}

export interface ProcessingProgress {
  processed: number;
  total?: number;
  message: string;
}

export interface ProcessingResult {
  transactions: Transaction[];
  stats: ProcessingStats;
  errors: ParseError[];
}

export interface ProcessingStats {
  totalRows: number;
  successfulTransactions: number;
  errors: number;
  processingTimeMs: number;
}

export interface ParseError {
  rowIndex: number;
  error: string;
}

export type RawRow = (string | number | undefined)[];

export interface BankParser {
  bankName: string;
  parseTransaction(row: RawRow, rowIndex: number): Transaction | null;
}

export interface FileReader {
  supportedTypes: readonly string[];
  read(file: File): AsyncGenerator<RawRow[]>;
}

export type Theme = 'light' | 'dark' | 'system';

export type DeviceTier = 'basic' | 'standard' | 'powerful';

export interface DeviceCapability {
  tier: DeviceTier;
  hasWebGPU: boolean;
  memory: number;
  cores: number;
  lastChecked: number;
  fingerprint: string;
}

export type ChatLevel = 'basic' | 'semantic' | 'ai';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export type ProcessingStatus =
  | { stage: 'idle' }
  | { stage: 'parsing'; progress: number; message: string }
  | { stage: 'complete'; transactionCount: number; dateRange: string }
  | { stage: 'error'; message: string };

export interface AnalyticsSummary {
  totalInflow: number;
  totalOutflow: number;
  netChange: number;
  transactionCount: number;
  dateRange: { start: string; end: string } | null;
  byMonth: MonthlyData[];
  byCategory: CategoryData[];
}

export interface MonthlyData {
  month: string;
  inflow: number;
  outflow: number;
}

export interface CategoryData {
  category: string;
  amount: number;
  percentage: number;
}
