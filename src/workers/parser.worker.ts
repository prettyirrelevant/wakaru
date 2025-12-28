import * as Comlink from 'comlink';
import * as XLSX from 'xlsx';
import { KudaParser } from '~/lib/parsers/kuda';
import type { Transaction, RawRow, BankType } from '~/types';

const CHUNK_SIZE = 1000;

interface ParseResult {
  transactions: Transaction[];
  error?: string;
}

type ProgressCallback = (progress: number, message: string) => void;

// Parser instances
const kudaParser = new KudaParser();

function parseCSVLine(line: string): RawRow {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result.map((cell) => {
    const trimmed = cell.replace(/^"|"$/g, '').trim();
    return trimmed === '' ? undefined : trimmed;
  });
}

// Main parser API
const parserApi = {
  async parseFile(
    fileBuffer: ArrayBuffer,
    fileName: string,
    bankType: BankType,
    onProgress: ProgressCallback
  ): Promise<ParseResult> {
    try {
      onProgress(5, 'Reading file...');

      const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
      let rows: RawRow[] = [];

      if (isExcel) {
        const workbook = XLSX.read(fileBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          return { transactions: [], error: 'No sheets found in Excel file' };
        }
        const worksheet = workbook.Sheets[firstSheetName];
        const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
          raw: false,
          header: 1,
        });
        rows = rawData.map((row) =>
          row.map((cell) =>
            cell === null || cell === undefined ? undefined : String(cell)
          ) as RawRow
        );
      } else {
        const text = new TextDecoder().decode(fileBuffer);
        const lines = text.split(/\r?\n/);
        rows = lines
          .filter((line) => line.trim())
          .map((line) => parseCSVLine(line));
      }

      onProgress(20, `Found ${rows.length} rows...`);

      const transactions: Transaction[] = [];
      const totalRows = rows.length;

      for (let i = 0; i < totalRows; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);

        for (let j = 0; j < chunk.length; j++) {
          const rowIndex = i + j;
          let transaction: Transaction | null = null;

          switch (bankType) {
            case 'kuda':
              transaction = kudaParser.parseTransaction(chunk[j], rowIndex);
              break;
            default:
              break;
          }

          if (transaction) {
            transactions.push(transaction);
          }
        }

        const progress = Math.min(90, 20 + Math.round(((i + chunk.length) / totalRows) * 70));
        onProgress(progress, `Processing ${Math.min(i + CHUNK_SIZE, totalRows)} of ${totalRows} rows...`);
      }

      if (transactions.length === 0) {
        return { transactions: [], error: 'No transactions found in file' };
      }

      transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      onProgress(95, 'Finalizing...');

      return { transactions };
    } catch (error) {
      return {
        transactions: [],
        error: error instanceof Error ? error.message : 'Failed to parse file',
      };
    }
  },
};

Comlink.expose(parserApi);

export type ParserApi = typeof parserApi;
