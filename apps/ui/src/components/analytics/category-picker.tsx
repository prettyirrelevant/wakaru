import { useState } from 'react';
import { usePGlite } from '@electric-sql/pglite-react';
import { useLiveQuery } from '@electric-sql/pglite-react';
import type { CategorySource } from '~/types';
import { createRule, setTransactionCategory } from '~/lib/db';

interface CategoryPickerProps {
  transactionId: string;
  categoryId: string | null;
  source: CategorySource | null;
}

const SOURCE_LABEL: Record<CategorySource, string> = {
  parser: 'from the statement',
  rule: 'matched a rule',
  user: 'set by you',
};

/**
 * Recategorising is only useful if it sticks. Alongside updating this row,
 * the user can turn the correction into a rule so the next import gets it
 * right without being told twice.
 */
export function CategoryPicker({ transactionId, categoryId, source }: CategoryPickerProps) {
  const db = usePGlite();
  const [busy, setBusy] = useState(false);

  const categoriesResult = useLiveQuery<{ id: string; name: string }>(
    'SELECT id, name FROM categories ORDER BY name'
  );
  const categories = categoriesResult?.rows ?? [];

  const descriptionResult = useLiveQuery<{ description: string; counterparty_name: string | null }>(
    `SELECT t.description, cp.canonical_name AS counterparty_name
     FROM transactions t
     LEFT JOIN counterparties cp ON cp.id = t.counterparty_id
     WHERE t.id = $1`,
    [transactionId]
  );
  const row = descriptionResult?.rows?.[0];

  const handleChange = async (nextId: string) => {
    setBusy(true);
    try {
      await setTransactionCategory(db, transactionId, nextId || null);
    } finally {
      setBusy(false);
    }
  };

  const handleAlwaysApply = async () => {
    if (!categoryId || !row) return;

    const pattern = row.counterparty_name || row.description;
    if (!pattern) return;

    setBusy(true);
    try {
      await createRule(db, {
        matchField: row.counterparty_name ? 'counterparty' : 'description',
        matchType: 'contains',
        pattern,
        categoryId,
        priority: 20,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <label htmlFor={`category-${transactionId}`} className="sr-only">
        Category
      </label>
      <select
        id={`category-${transactionId}`}
        value={categoryId ?? ''}
        disabled={busy}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none disabled:opacity-50"
      >
        <option value="">uncategorized</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground/70">
          {source ? SOURCE_LABEL[source] : 'not categorized yet'}
        </span>
        {categoryId && source === 'user' && (
          <button
            type="button"
            onClick={handleAlwaysApply}
            disabled={busy}
            className="text-[11px] text-accent underline underline-offset-2 hover:no-underline disabled:opacity-50"
          >
            always use this
          </button>
        )}
      </div>
    </div>
  );
}
