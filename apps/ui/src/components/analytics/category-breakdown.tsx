import type { CategorySpend, CurrencyCode } from '~/types';
import { formatCompactCurrency } from '~/lib/utils';

interface CategoryBreakdownProps {
  data: CategorySpend[];
  currency: CurrencyCode;
  onSelect?: (categoryId: string | null) => void;
}

const MAX_ROWS = 8;

export function CategoryBreakdown({ data, currency, onSelect }: CategoryBreakdownProps) {
  if (data.length === 0) return null;

  const rows = data.slice(0, MAX_ROWS);
  const rest = data.slice(MAX_ROWS);
  const restTotal = rest.reduce((sum, row) => sum + row.amountMinor, 0);
  const restShare = rest.reduce((sum, row) => sum + row.share, 0);

  return (
    <section className="tui-box p-5" aria-labelledby="category-breakdown-heading">
      <div className="mb-3 flex items-center gap-2">
        <h2 id="category-breakdown-heading" className="text-sm font-semibold">
          where it went
        </h2>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.categoryId ?? 'uncategorized'}>
            <button
              type="button"
              onClick={() => onSelect?.(row.categoryId)}
              disabled={!onSelect}
              className="group w-full text-left disabled:cursor-default"
            >
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate font-medium group-hover:text-accent">{row.categoryName}</span>
                <span className="mono-nums shrink-0 text-muted-foreground">
                  {formatCompactCurrency(row.amountMinor, currency)}
                  <span className="ml-1.5 text-muted-foreground/60">
                    {Math.round(row.share * 100)}%
                  </span>
                </span>
              </div>
              <div className="mt-1 h-1 w-full bg-muted">
                <div
                  className="h-full bg-accent/70 transition-[width]"
                  style={{ width: `${Math.max(row.share * 100, 1)}%` }}
                />
              </div>
            </button>
          </li>
        ))}

        {rest.length > 0 && (
          <li className="flex items-baseline justify-between gap-3 pt-1 text-xs text-muted-foreground">
            <span>+{rest.length} more</span>
            <span className="mono-nums">
              {formatCompactCurrency(restTotal, currency)}
              <span className="ml-1.5 text-muted-foreground/60">
                {Math.round(restShare * 100)}%
              </span>
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
