import { BankType, type BankInfo } from '~/types';

export const PROCESSING = {
  CHUNK_SIZE: 1000,
  UI_UPDATE_INTERVAL_MS: 100,
  MAX_ERRORS_STORED: 500,
} as const;

export const FILE_EXTENSIONS = {
  EXCEL: ['.xlsx', '.xls'] as const,
  CSV: ['.csv'] as const,
} as const;

export const MIME_TYPES = {
  EXCEL: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ] as const,
  CSV: ['text/csv', 'application/csv'] as const,
} as const;

export const SUPPORTED_BANKS: BankInfo[] = [
  { id: BankType.Kuda, name: 'Kuda', available: true },
  { id: BankType.OPay, name: 'OPay', available: false },
  { id: BankType.GTB, name: 'GTBank', available: false },
  { id: BankType.Access, name: 'Access Bank', available: false },
  { id: BankType.Zenith, name: 'Zenith Bank', available: false },
  { id: BankType.FirstBank, name: 'First Bank', available: false },
  { id: BankType.UBA, name: 'UBA', available: false },
  { id: BankType.Fidelity, name: 'Fidelity Bank', available: false },
];

export const ACCEPTED_FILE_TYPES = [
  ...MIME_TYPES.EXCEL,
  ...MIME_TYPES.CSV,
].join(',');
