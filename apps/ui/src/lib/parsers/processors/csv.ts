import type { RawRow } from '~/types';

export function extractRowsFromCsv(buffer: ArrayBuffer): RawRow[] {
  const text = new TextDecoder().decode(buffer);
  const lines = text.split(/\r?\n/);
  
  return lines
    .filter((line) => line.trim())
    .map((line) => parseCsvLine(line));
}

function parseCsvLine(line: string): RawRow {
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
