import * as XLSX from 'xlsx';
import type { FileReader, RawRow } from '~/types';
import { PROCESSING, FILE_EXTENSIONS, MIME_TYPES } from '~/lib/constants';

export class ExcelReader implements FileReader {
  readonly supportedTypes = [...MIME_TYPES.EXCEL, ...FILE_EXTENSIONS.EXCEL];

  async *read(file: File): AsyncGenerator<RawRow[]> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('No sheets found in Excel file');
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      header: 1,
    });

    for (let i = 0; i < rawData.length; i += PROCESSING.CHUNK_SIZE) {
      const chunk = rawData
        .slice(i, i + PROCESSING.CHUNK_SIZE)
        .map(
          (row) =>
            row.map((cell) =>
              cell === null || cell === undefined ? undefined : String(cell)
            ) as RawRow
        );

      yield chunk;
    }
  }
}
