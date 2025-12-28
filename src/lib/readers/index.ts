import type { FileReader } from '~/types';
import { ExcelReader } from './excel';
import { CSVReader } from './csv';

export { ExcelReader, CSVReader };

export function getFileReader(file: File): FileReader {
  const fileName = file.name.toLowerCase();
  const mimeType = file.type;

  if (
    mimeType.includes('excel') ||
    mimeType.includes('spreadsheetml') ||
    fileName.endsWith('.xlsx') ||
    fileName.endsWith('.xls')
  ) {
    return new ExcelReader();
  }

  if (mimeType.includes('csv') || fileName.endsWith('.csv')) {
    return new CSVReader();
  }

  if (mimeType.includes('text')) {
    return new CSVReader();
  }

  throw new Error(`Unsupported file type: ${mimeType || fileName}`);
}
