import type { FileReader, RawRow } from '~/types';
import { PROCESSING, FILE_EXTENSIONS, MIME_TYPES } from '~/lib/constants';

export class CSVReader implements FileReader {
  readonly supportedTypes = [...MIME_TYPES.CSV, ...FILE_EXTENSIONS.CSV];

  async *read(file: File): AsyncGenerator<RawRow[]> {
    const text = await file.text();
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i += PROCESSING.CHUNK_SIZE) {
      const chunk = lines
        .slice(i, i + PROCESSING.CHUNK_SIZE)
        .filter((line) => line.trim())
        .map((line) => this.parseCSVLine(line));

      if (chunk.length > 0) {
        yield chunk;
      }
    }
  }

  private parseCSVLine(line: string): RawRow {
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
}
