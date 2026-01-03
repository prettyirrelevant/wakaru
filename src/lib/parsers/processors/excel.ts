import * as XLSX from 'xlsx';
import type { RawRow } from '~/types';

export function extractRowsFromExcel(buffer: ArrayBuffer, sheetName?: string): RawRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  
  const targetSheetName = sheetName ?? workbook.SheetNames[0];
  if (!targetSheetName || !workbook.SheetNames.includes(targetSheetName)) {
    throw new Error(sheetName ? `Sheet "${sheetName}" not found` : 'No sheets found in Excel file');
  }
  
  const worksheet = workbook.Sheets[targetSheetName];
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
    raw: false,
    header: 1,
  });
  
  return rawData.map((row): RawRow =>
    row.map((cell): string | number | undefined =>
      cell === null || cell === undefined ? undefined : String(cell)
    )
  );
}
