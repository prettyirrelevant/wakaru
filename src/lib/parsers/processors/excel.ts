import * as XLSX from 'xlsx';
import type { RawRow } from '~/types';

export function extractRowsFromExcel(buffer: ArrayBuffer): RawRow[] {
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
  
  return rawData.map((row) =>
    row.map((cell) =>
      cell === null || cell === undefined ? undefined : String(cell)
    ) as RawRow
  );
}
