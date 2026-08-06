import { useState } from 'react';
import { usePGlite, useLiveQuery } from '@electric-sql/pglite-react';
import type { Queryable } from '~/lib/db';
import {
  approveSuggestedRule,
  rejectSuggestedRule,
} from '~/lib/ledger/suggested-rules';

interface SuggestedRuleRow {
  id: string;
  pattern: string;
  category_name: string;
}

/**
 * The AI's guesses, kept until the user decides. They apply from the moment
 * they are written; this panel is where a wrong guess is caught — one at a
 * time or in bulk.
 */
export function SuggestedRulesPanel() {
  const db = usePGlite();
  const [busy, setBusy] = useState(false);

  const result = useLiveQuery<SuggestedRuleRow>(`
    SELECT r.id, r.pattern, c.name AS category_name
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
      <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          ai suggested categories for {rules.length} merchant
          {rules.length === 1 ? '' : 's'}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => runForAll(approveSuggestedRule)}
            disabled={busy}
            className="border border-border px-2 py-1 text-[11px] hover:border-border-strong disabled:opacity-50"
          >
            keep all
          </button>
          <button
            type="button"
            onClick={() => runForAll(rejectSuggestedRule)}
            disabled={busy}
            className="border border-border px-2 py-1 text-[11px] text-destructive hover:border-destructive/50 disabled:opacity-50"
          >
            reject all
          </button>
        </div>
      </div>

      <ul className="space-y-1">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span className="min-w-0 truncate">{rule.pattern}</span>
            <span className="shrink-0 text-muted-foreground">{rule.category_name}</span>
            <span className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => approveSuggestedRule(db, rule.id)}
                disabled={busy}
                aria-label={`keep ${rule.pattern}`}
                className="border border-border px-1.5 py-0.5 text-[11px] text-success hover:border-success/50 disabled:opacity-50"
              >
                keep
              </button>
              <button
                type="button"
                onClick={() => rejectSuggestedRule(db, rule.id)}
                disabled={busy}
                aria-label={`reject ${rule.pattern}`}
                className="border border-border px-1.5 py-0.5 text-[11px] text-destructive hover:border-destructive/50 disabled:opacity-50"
              >
                remove
              </button>
            </span>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-muted-foreground/60">
        names only are sent for categorisation — amounts, dates and balances
        never leave your device. rejecting stops that merchant being suggested
        again.
      </p>
      </section>
    </>
  );
}
