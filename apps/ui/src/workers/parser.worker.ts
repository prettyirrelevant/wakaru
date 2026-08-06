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
import { noopLogger } from '~/lib/parsers/base';
import { PdfPasswordError } from '~/lib/parsers/processors/pdf';
import type { ParseFailure, ParseOutput, ParsedTransaction, RawRow, BankType } from '~/types';

const CHUNK_SIZE = 1000;

type ProgressCallback = (progress: number, message: string) => void;

const parsers = {
  access: new AccessParser(noopLogger),
  fcmb: new FcmbParser(noopLogger),
  gtb: new GtbParser(noopLogger),
  kuda: new KudaParser(noopLogger),
  opay: new OPayParser(noopLogger),
  palmpay: new PalmPayParser(noopLogger),
  standardchartered: new StandardCharteredParser(noopLogger),
  sterling: new SterlingParser(noopLogger),
  uba: new UbaParser(noopLogger),
  wema: new WemaParser(noopLogger),
  zenith: new ZenithParser(noopLogger),
} as const;

type SupportedBank = keyof typeof parsers;

function isValidBankType(type: string): type is SupportedBank {
  return type in parsers;
}

/** PDF banks that hand their text to a parser-specific row extractor. */
const PDF_EXTRACTORS: Partial<Record<SupportedBank, (text: string) => RawRow[]>> = {
  access: AccessParser.extractRowsFromPdfText,
  wema: WemaParser.extractRowsFromPdfText,
  palmpay: PalmPayParser.extractRowsFromPdfText,
  zenith: ZenithParser.extractRowsFromPdfText,
  fcmb: FcmbParser.extractRowsFromPdfText,
  standardchartered: StandardCharteredParser.extractRowsFromPdfText,
  gtb: GtbParser.extractRowsFromPdfText,
  uba: UbaParser.extractRowsFromPdfText,
  sterling: SterlingParser.extractRowsFromPdfText,
};

const parserApi = {
  async parseFile(
    fileBuffer: ArrayBuffer,
    fileName: string,
    bankType: BankType,
    password: string | undefined,
    onProgress: ProgressCallback
  ): Promise<ParseOutput> {
    // Validate before doing any extraction work, so an unsupported bank
    // reports that rather than a confusing downstream parse failure.
    if (!isValidBankType(bankType)) {
      return {
        transactions: [],
        rowsSeen: 0,
        failures: [],
        error: `Unsupported bank: ${bankType}`,
        errorCode: 'unsupported_bank',
      };
    }

    try {
      onProgress(5, 'Reading file...');

      let rows = await extractRows(fileBuffer, fileName, bankType, password);

      if (bankType === 'palmpay' && !fileName.toLowerCase().endsWith('.pdf')) {
        rows = PalmPayParser.preprocessRows(rows);
      }

      onProgress(20, `Found ${rows.length} rows...`);

      const parser = parsers[bankType];
      const transactions: ParsedTransaction[] = [];
      const failures: ParseFailure[] = [];
      const totalRows = rows.length;

      for (let i = 0; i < totalRows; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);

        for (let j = 0; j < chunk.length; j++) {
          const rowIndex = i + j;
          const result = parser.parseTransactionSafe(chunk[j], rowIndex);

          if (result.success) {
            transactions.push(result.transaction);
          } else if (result.error) {
            // A null error means the row was intentionally skipped (header,
            // footer, running total). An error object means we tried to read
            // a transaction and could not — that is worth telling the user.
            failures.push({ rowIndex, message: result.error.message });
          }
        }

        const progress = Math.min(90, 20 + Math.round(((i + chunk.length) / totalRows) * 70));
        onProgress(progress, `Processing ${Math.min(i + CHUNK_SIZE, totalRows)} of ${totalRows} rows...`);
      }

      if (transactions.length === 0) {
        return {
          transactions: [],
          rowsSeen: totalRows,
          failures,
          error: 'No transactions found in file',
          errorCode: 'no_transactions',
        };
      }

      onProgress(95, 'Finalizing...');

      // Deliberately unsorted: the ingest layer needs the order the bank
      // wrote the rows in to assign sequence numbers and to walk the running
      // balance. Display ordering is a query concern.
      return { transactions, rowsSeen: totalRows, failures };
    } catch (error) {
      if (error instanceof PdfPasswordError) {
        return {
          transactions: [],
          rowsSeen: 0,
          failures: [],
          error: error.message,
          errorCode: error.reason === 'required' ? 'password_required' : 'password_incorrect',
        };
      }

      return {
        transactions: [],
        rowsSeen: 0,
        failures: [],
        error: error instanceof Error ? error.message : 'Failed to parse file',
        errorCode: 'parse_failed',
      };
    }
  },
};

async function extractRows(
  buffer: ArrayBuffer,
  fileName: string,
  bankType: SupportedBank,
  password?: string
): Promise<RawRow[]> {
  const extractor = PDF_EXTRACTORS[bankType];
  if (extractor) {
    const text = await extractTextFromPdf(buffer, password);
    return extractor(text);
  }

  if (bankType === 'opay') {
    return extractRowsFromExcel(buffer, 'Wallet Account Transactions');
  }

  const ext = fileName.toLowerCase();
  if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
    return extractRowsFromExcel(buffer);
  }

  return extractRowsFromCsv(buffer);
}

Comlink.expose(parserApi);

export type ParserApi = typeof parserApi;
