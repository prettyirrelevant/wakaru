import type { Transaction } from '~/types';

const CSV_HEADERS = [
  'id',
  'date',
  'description',
  'amount',
  'category',
  'bankSource',
] as const;

function escapeCSVField(value: string | number): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function transactionsToCSV(transactions: Transaction[]): string {
  const header = CSV_HEADERS.join(',');
  
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  const rows = sorted.map((tx) =>
    CSV_HEADERS.map((field) => {
      const value = tx[field] ?? '';
      if (field === 'amount') {
        return escapeCSVField(Math.abs(Number(value)));
      }
      return escapeCSVField(value);
    }).join(',')
  );

  return [header, ...rows].join('\n');
}

export function downloadCSV(content: string): void {
  const date = new Date().toISOString().split('T')[0];
  const filename = `wakaru-export-${date}.csv`;

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
