import { useState } from 'react';
import { usePGlite } from '@electric-sql/pglite-react';
import { useLiveQuery } from '@electric-sql/pglite-react';
import type { CategorySource } from '~/types';
import { createRule, setTransactionCategory } from '~/lib/db';

interface CategoryPickerProps {
  transactionId: string;
}

const SOURCE_LABEL: Record<CategorySource, string> = {
  parser: 'From the statement',
  rule: 'Matched a rule',
  user: 'Set by you',
};

export function CategoryPicker({ transactionId }: CategoryPickerProps) {
  const db = usePGlite();
  const [busy, setBusy] = useState(false);

  const categoriesResult = useLiveQuery<{ id: string; name: string }>(
    'SELECT id, name FROM categories ORDER BY name'
  );
  const categories = categoriesResult?.rows ?? [];

  const transactionResult = useLiveQuery<{
    description: string;
    counterparty_name: string | null;
    category_id: string | null;
    category_source: string | null;
  }>(
    `SELECT t.description, t.category_id, t.category_source,
            cp.canonical_name AS counterparty_name
     FROM transactions t
     LEFT JOIN counterparties cp ON cp.id = t.counterparty_id
     WHERE t.id = $1`,
    [transactionId]
  );
  const row = transactionResult?.rows?.[0];
  const categoryId = row?.category_id ?? null;
  const source = (row?.category_source as CategorySource | null | undefined) ?? null;

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
        name={`category-${transactionId}`}
        className="tui-input w-full text-xs disabled:opacity-50"
      >
        <option value="">Uncategorized</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground/70">
          {source ? SOURCE_LABEL[source] : 'Not categorized yet'}
        </span>
        {categoryId && source === 'user' && (
          <button
            type="button"
            onClick={handleAlwaysApply}
            disabled={busy}
            className="text-[11px] text-accent underline underline-offset-2 hover:no-underline disabled:opacity-50"
          >
            Always Use This
          </button>
        )}
      </div>
    </div>
  );
}
