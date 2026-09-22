import { useState } from 'react';
import { usePGlite, useLiveQuery } from '@electric-sql/pglite-react';
import type { Queryable } from '~/lib/db';
import {
  approveSuggestedRule,
  rejectSuggestedRule,
} from '~/lib/ledger/suggested-rules';
import { Button } from '~/components/ui/button';

interface SuggestedRuleRow {
  id: string;
  pattern: string;
  category_name: string;
  suggestion_confidence: number | null;
  suggestion_model: string | null;
}

const confidenceFormat = new Intl.NumberFormat('en', {
  style: 'percent',
  maximumFractionDigits: 0,
});

export function SuggestedRulesPanel() {
  const db = usePGlite();
  const [busy, setBusy] = useState(false);

  const result = useLiveQuery<SuggestedRuleRow>(`
    SELECT r.id, r.pattern, c.name AS category_name,
           r.suggestion_confidence, r.suggestion_model
    FROM rules r
    JOIN categories c ON c.id = r.category_id
    WHERE r.source = 'suggested'
    ORDER BY r.pattern
  `);
  const rules = result?.rows ?? [];

  if (rules.length === 0) return null;

  const runForAll = async (action: (db: Queryable, id: string) => Promise<void>) => {
    setBusy(true);
    try {
      for (const rule of rules) await action(db, rule.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="tui-divider my-4" />
      <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Suggested Categories</h3>
          <p className="mt-1 text-xs text-muted-foreground">
          AI found matches for {rules.length} merchant
          {rules.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => runForAll(approveSuggestedRule)}
            disabled={busy}
          >
            Keep All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => runForAll(rejectSuggestedRule)}
            disabled={busy}
            className="text-destructive"
          >
            Reject All
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-border border border-border bg-surface px-3">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className="flex items-center justify-between gap-3 py-3 text-xs"
          >
            <span className="min-w-0 truncate">{rule.pattern}</span>
            <span className="shrink-0 text-right text-muted-foreground">
              <span className="block">{rule.category_name}</span>
              {rule.suggestion_confidence !== null && (
                <span className="block text-[10px] text-muted-foreground/60">
                  {confidenceFormat.format(rule.suggestion_confidence)}
                  {rule.suggestion_model ? ` · ${rule.suggestion_model}` : ''}
                </span>
              )}
            </span>
            <span className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => approveSuggestedRule(db, rule.id)}
                disabled={busy}
                aria-label={`Keep ${rule.pattern}`}
                className="px-1.5 py-1 text-[11px] font-semibold text-success hover:bg-success-muted disabled:opacity-50"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={() => rejectSuggestedRule(db, rule.id)}
                disabled={busy}
                aria-label={`Reject ${rule.pattern}`}
                className="px-1.5 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive-muted disabled:opacity-50"
              >
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>

      <p className="text-[11px] leading-5 text-muted-foreground">
        Only merchant names go to the model. Amounts, dates, and balances stay on this device.
      </p>
      </section>
    </>
  );
}
