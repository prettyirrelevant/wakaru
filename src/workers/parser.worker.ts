import * as Comlink from 'comlink';
import { KudaParser } from '~/lib/parsers/kuda';
import { PalmPayParser } from '~/lib/parsers/palmpay';
import { WemaBankParser } from '~/lib/parsers/wema';
import {
  extractRowsFromExcel,
  extractRowsFromCsv,
  extractTextFromPdf,
} from '~/lib/parsers/processors';
import type { Transaction, RawRow, BankType } from '~/types';

const CHUNK_SIZE = 1000;

interface ParseResult {
  transactions: Transaction[];
  error?: string;
}

type ProgressCallback = (progress: number, message: string) => void;

const parsers = {
  kuda: new KudaParser(),
  palmpay: new PalmPayParser(),
  wemabank: new WemaBankParser(),
} as const;

const parserApi = {
  async parseFile(
    fileBuffer: ArrayBuffer,
    fileName: string,
    bankType: BankType,
    onProgress: ProgressCallback
  ): Promise<ParseResult> {
    try {
      onProgress(5, 'Reading file...');

      let rows = await extractRows(fileBuffer, fileName, bankType);

      if (bankType === 'palmpay' && !fileName.toLowerCase().endsWith('.pdf')) {
        rows = PalmPayParser.preprocessRows(rows);
      }

      onProgress(20, `Found ${rows.length} rows...`);

      const parser = parsers[bankType as keyof typeof parsers];
      if (!parser) {
        return { transactions: [], error: `Unsupported bank: ${bankType}` };
      }

      const transactions: Transaction[] = [];
      const totalRows = rows.length;

      for (let i = 0; i < totalRows; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);

        for (let j = 0; j < chunk.length; j++) {
          const rowIndex = i + j;
          const transaction = parser.parseTransaction(chunk[j], rowIndex);

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

async function extractRows(buffer: ArrayBuffer, fileName: string, bankType: BankType): Promise<RawRow[]> {
  const ext = fileName.toLowerCase();
  
  if (bankType === 'wemabank') {
    const text = await extractTextFromPdf(buffer);
    return WemaBankParser.extractRowsFromPdfText(text);
  }
  
  if (bankType === 'palmpay') {
    const text = await extractTextFromPdf(buffer);
    return PalmPayParser.extractRowsFromPdfText(text);
  }
  
  if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
    return extractRowsFromExcel(buffer);
  }
  
  return extractRowsFromCsv(buffer);
}

Comlink.expose(parserApi);

export type ParserApi = typeof parserApi;
