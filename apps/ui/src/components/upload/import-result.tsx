import type { ImportSummary, SuggestedRulesOutcome } from '~/types';
import { cn } from '~/lib/utils';
import { Icon } from '~/components/ui/icon';

interface ImportResultProps {
  summary: ImportSummary;
  suggestions?: SuggestedRulesOutcome;
  className?: string;
}

export function ImportResult({ summary, suggestions, className }: ImportResultProps) {
  const { reconcile } = summary;
  const skipped = Math.max(0, summary.rowsSeen - summary.rowsParsed);

  const tone =
    reconcile.ok === false ? 'warning' : summary.inserted === 0 ? 'muted' : 'success';

  return (
    <div
      className={cn(
        'border p-5 text-sm',
        tone === 'success' && 'border-success/30 bg-success-muted',
        tone === 'warning' && 'border-warning/40 bg-warning-muted',
        tone === 'muted' && 'border-border bg-muted/50',
        className
      )}
      role="status"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center border',
            tone === 'success' && 'bg-success text-white',
            tone === 'warning' && 'bg-warning text-black',
            tone === 'muted' && 'bg-muted text-muted-foreground'
          )}
        >
          {tone === 'success' ? (
            <Icon name="check" className="h-4 w-4" />
          ) : (
            <span aria-hidden="true" className="font-mono font-bold">
              {tone === 'warning' ? '!' : '='}
            </span>
          )}
        </span>
        <div>
          <p className={cn('font-semibold', tone === 'warning' && 'text-warning')}>
            {summary.inserted > 0
              ? `${summary.inserted} transaction${summary.inserted === 1 ? '' : 's'} imported`
              : 'statement already imported'}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {reconcile.ok === false
              ? 'Review the balance warning before you use these totals.'
              : 'Your dashboard is ready with the latest statement data.'}
          </p>
        </div>
      </div>

      <dl className="mt-4 space-y-2 border-t border-current/10 pt-4 text-xs text-muted-foreground">
        <Row label="Rows Read" value={String(summary.rowsSeen)} />
        <Row
          label="Rows Parsed"
          value={skipped > 0 ? `${summary.rowsParsed} (${skipped} skipped)` : String(summary.rowsParsed)}
        />
        {summary.duplicates > 0 && (
          <Row label="Duplicates" value={String(summary.duplicates)} />
        )}
        <Row label="Balance Check" value={reconcileLabel(reconcile.ok, reconcile.checked, reconcile.breaks.length)} />
      </dl>

      {suggestions && suggestions.rules > 0 && (
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          AI suggested {suggestions.rules} categor
          {suggestions.rules === 1 ? 'y rule' : 'y rules'} for {suggestions.rows} transaction
          {suggestions.rows === 1 ? '' : 's'}. Review them in Settings.
        </p>
      )}

      {reconcile.ok === false && (
        <p className="mt-4 text-xs leading-5 text-warning">
          The running balance fails at {reconcile.breaks.length} point
          {reconcile.breaks.length === 1 ? '' : 's'}. Some rows can be missing or incorrect.
        </p>
      )}
    </div>
  );
}

function reconcileLabel(ok: boolean | null, checked: number, breaks: number): string {
  if (ok === null) return 'No balance column';
  if (ok) return `Passed (${checked} checked)`;
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
