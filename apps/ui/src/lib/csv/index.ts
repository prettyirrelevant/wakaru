import type { Queryable } from '~/lib/db';
import { toMajorUnits } from '~/lib/utils/format';

const CSV_HEADERS = [
  'date',
  'value_date',
  'account',
  'bank',
  'currency',
  'description',
  'counterparty',
  'category',
  'kind',
  'amount',
  'balance_after',
  'reference',
  'internal_transfer',
] as const;

interface ExportRow {
  booked_at: Date;
  value_at: Date | null;
  account_label: string;
  bank: string;
  currency: string;
  description: string;
  counterparty_name: string | null;
  category_name: string | null;
  kind: string;
  amount_minor: string;
  balance_after_minor: string | null;
  reference: string;
  transfer_group_id: string | null;
}

const EXPORT_QUERY = `
  SELECT
    t.booked_at,
    t.value_at,
    COALESCE(NULLIF(a.name, ''), CONCAT_WS(' ', a.bank, NULLIF(a.number_masked, ''))) AS account_label,
    a.bank,
    t.currency,
    t.description,
    cp.canonical_name AS counterparty_name,
    c.name            AS category_name,
    t.kind,
    t.amount_minor,
    t.balance_after_minor,
    t.reference,
    t.transfer_group_id
  FROM transactions t
  JOIN accounts a               ON a.id = t.account_id
  LEFT JOIN counterparties cp   ON cp.id = t.counterparty_id
  LEFT JOIN categories c        ON c.id = t.category_id
  ORDER BY t.booked_at ASC, t.seq ASC
`;

function escapeCSVField(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function isoDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : '';
}

/**
 * Export is a query, not a subscription. The settings sheet used to hold an
 * always-live `SELECT *` over every transaction just so this button could be
 * enabled.
 *
 * Amounts stay signed so the export round-trips; the old version wrote
 * absolute values and lost direction.
 */
export async function exportTransactionsToCSV(db: Queryable): Promise<string> {
  const result = await db.query<ExportRow>(EXPORT_QUERY);

  const rows = result.rows.map((row) =>
    [
      isoDate(row.booked_at),
      isoDate(row.value_at),
      row.account_label ?? '',
      row.bank,
      row.currency,
      row.description,
      row.counterparty_name ?? '',
      row.category_name ?? '',
      row.kind,
      toMajorUnits(Number(row.amount_minor)).toFixed(2),
      row.balance_after_minor === null
        ? ''
        : toMajorUnits(Number(row.balance_after_minor)).toFixed(2),
      row.reference,
      row.transfer_group_id ? 'yes' : 'no',
    ]
      .map(escapeCSVField)
      .join(',')
  );

  return [CSV_HEADERS.join(','), ...rows].join('\n');
}

export function downloadCSV(content: string): void {
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `wakaru-export-${date}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
