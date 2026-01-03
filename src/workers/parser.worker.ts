import * as Comlink from 'comlink';
import { AccessParser } from '~/lib/parsers/access';
import { FcmbParser } from '~/lib/parsers/fcmb';
import { GtbParser } from '~/lib/parsers/gtb';
import { KudaParser } from '~/lib/parsers/kuda';
import { OPayParser } from '~/lib/parsers/opay';
import { PalmPayParser } from '~/lib/parsers/palmpay';
import { StandardCharteredParser } from '~/lib/parsers/standard-chartered';
import { SterlingParser } from '~/lib/parsers/sterling';
import { WemaParser } from '~/lib/parsers/wema';
import { UbaParser } from '~/lib/parsers/uba';
import { ZenithParser } from '~/lib/parsers/zenith';
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
  access: new AccessParser(),
  fcmb: new FcmbParser(),
  gtb: new GtbParser(),
  kuda: new KudaParser(),
  opay: new OPayParser(),
  palmpay: new PalmPayParser(),
  standardchartered: new StandardCharteredParser(),
  sterling: new SterlingParser(),
  uba: new UbaParser(),
  wema: new WemaParser(),
  zenith: new ZenithParser(),
} as const;

const parserApi = {
  async parseFile(
    fileBuffer: ArrayBuffer,
    fileName: string,
    bankType: BankType,
    password: string | undefined,
    onProgress: ProgressCallback
  ): Promise<ParseResult> {
    try {
      onProgress(5, 'Reading file...');

      let rows = await extractRows(fileBuffer, fileName, bankType, password);

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

async function extractRows(buffer: ArrayBuffer, fileName: string, bankType: BankType, password?: string): Promise<RawRow[]> {
  const ext = fileName.toLowerCase();
  
  if (bankType === 'access') {
    const text = await extractTextFromPdf(buffer);
    return AccessParser.extractRowsFromPdfText(text);
  }
  
  if (bankType === 'wema') {
    const text = await extractTextFromPdf(buffer);
    return WemaParser.extractRowsFromPdfText(text);
  }
  
  if (bankType === 'palmpay') {
    const text = await extractTextFromPdf(buffer);
    return PalmPayParser.extractRowsFromPdfText(text);
  }
  
  if (bankType === 'zenith') {
    const text = await extractTextFromPdf(buffer);
    return ZenithParser.extractRowsFromPdfText(text);
  }
  
  if (bankType === 'fcmb') {
    const text = await extractTextFromPdf(buffer);
    return FcmbParser.extractRowsFromPdfText(text);
  }
  
  if (bankType === 'standardchartered') {
    const text = await extractTextFromPdf(buffer, password);
    return StandardCharteredParser.extractRowsFromPdfText(text);
  }
  
  if (bankType === 'gtb') {
    const text = await extractTextFromPdf(buffer, password);
    return GtbParser.extractRowsFromPdfText(text);
  }
  
  if (bankType === 'uba') {
    const text = await extractTextFromPdf(buffer, password);
    return UbaParser.extractRowsFromPdfText(text);
  }
  
  if (bankType === 'sterling') {
    const text = await extractTextFromPdf(buffer, password);
    return SterlingParser.extractRowsFromPdfText(text);
  }
  
  if (bankType === 'opay') {
    return extractRowsFromExcel(buffer, 'Wallet Account Transactions');
  }
  
  if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
    return extractRowsFromExcel(buffer);
  }
  
  return extractRowsFromCsv(buffer);
}

Comlink.expose(parserApi);

export type ParserApi = typeof parserApi;
