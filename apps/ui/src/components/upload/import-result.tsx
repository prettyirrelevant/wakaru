import type { ImportSummary, SuggestedRulesOutcome } from '~/types';
import { cn } from '~/lib/utils';

interface ImportResultProps {
  summary: ImportSummary;
  suggestions?: SuggestedRulesOutcome;
  className?: string;
}

/**
 * What actually happened during an import.
 *
 * Silent drops were the worst failure mode of the old pipeline: a statement
 * where a third of the rows failed looked exactly like a clean one. Both the
 * parse rate and the statement's own balance check are shown here.
 */
export function ImportResult({ summary, suggestions, className }: ImportResultProps) {
  const { reconcile } = summary;
  const skipped = Math.max(0, summary.rowsSeen - summary.rowsParsed);

  const tone =
    reconcile.ok === false ? 'warning' : summary.inserted === 0 ? 'muted' : 'success';

  return (
    <div
      className={cn(
        'tui-box space-y-2 p-3 text-xs',
        tone === 'success' && 'border-success/30 bg-success-muted',
        tone === 'warning' && 'border-warning/40 bg-warning-muted',
        className
      )}
      role="status"
    >
      <p className={cn('font-medium', tone === 'warning' ? 'text-warning' : 'text-foreground')}>
        {summary.inserted > 0
          ? `added ${summary.inserted} transaction${summary.inserted === 1 ? '' : 's'}`
          : 'nothing new — this statement was already imported'}
      </p>

      <dl className="space-y-1 text-muted-foreground">
        <Row label="rows read" value={String(summary.rowsSeen)} />
        <Row
          label="parsed"
          value={skipped > 0 ? `${summary.rowsParsed} (${skipped} skipped)` : String(summary.rowsParsed)}
        />
        {summary.duplicates > 0 && (
          <Row label="already had" value={String(summary.duplicates)} />
        )}
        <Row label="balance check" value={reconcileLabel(reconcile.ok, reconcile.checked, reconcile.breaks.length)} />
      </dl>

      {suggestions && suggestions.rules > 0 && (
        <p className="text-muted-foreground">
          ai suggested {suggestions.rules} categor
          {suggestions.rules === 1 ? 'y rule' : 'y rules'} covering{' '}
          {suggestions.rows} transaction{suggestions.rows === 1 ? '' : 's'} — review
          in settings
        </p>
      )}

      {reconcile.ok === false && (
        <p className="text-warning/90">
          the running balance stops adding up at {reconcile.breaks.length} point
          {reconcile.breaks.length === 1 ? '' : 's'}, so some rows may be missing or misread.
        </p>
      )}
    </div>
  );
}

function reconcileLabel(ok: boolean | null, checked: number, breaks: number): string {
  if (ok === null) return 'no balance column to check';
  if (ok) return `clean (${checked} checked)`;
  return `${breaks} mismatch${breaks === 1 ? '' : 'es'}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt>{label}</dt>
      <dd className="mono-nums text-right text-foreground/80">{value}</dd>
    </div>
  );
}
