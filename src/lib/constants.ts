import { BankType, type BankInfo } from '~/types';

export const SUPPORTED_BANKS: BankInfo[] = [
  { id: BankType.Kuda, name: 'Kuda', available: true, fileFormat: 'excel' },
  { id: BankType.PalmPay, name: 'PalmPay', available: true, fileFormat: 'pdf' },
  { id: BankType.Wema, name: 'Wema', available: true, fileFormat: 'pdf' },
  { id: BankType.OPay, name: 'OPay', available: true, fileFormat: 'excel' },
  { id: BankType.GTB, name: 'GTBank', available: false },
  { id: BankType.Access, name: 'Access', available: true, fileFormat: 'pdf' },
  { id: BankType.Zenith, name: 'Zenith', available: true, fileFormat: 'pdf' },
  { id: BankType.FirstBank, name: 'First Bank', available: false },
  { id: BankType.UBA, name: 'UBA', available: false },
  { id: BankType.Fidelity, name: 'Fidelity Bank', available: false },
];

const MIME_TYPES = {
  EXCEL: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ] as const,
  CSV: ['text/csv', 'application/csv'] as const,
  PDF: ['application/pdf'] as const,
} as const;

export const ACCEPTED_FILE_TYPES = [
  ...MIME_TYPES.EXCEL,
  ...MIME_TYPES.CSV,
  ...MIME_TYPES.PDF,
].join(',');
