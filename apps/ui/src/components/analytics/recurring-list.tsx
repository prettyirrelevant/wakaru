import type { CurrencyCode } from '~/types';
import type { RecurringPayment } from '~/hooks/useAnalytics';
import { formatCompactCurrency } from '~/lib/utils';

interface RecurringListProps {
  data: RecurringPayment[];
  currency: CurrencyCode;
  onSelect?: (name: string) => void;
}

export function RecurringList({ data, currency, onSelect }: RecurringListProps) {
  if (data.length === 0) return null;

  const monthlyTotal = data.reduce((sum, row) => sum + row.avgAmountMinor, 0);

  return (
    <section className="tui-box p-5" aria-labelledby="recurring-heading">
      <div className="mb-3 flex items-center gap-2">
        <h2 id="recurring-heading" className="text-sm font-semibold">
          looks recurring
        </h2>
        <span className="mono-nums ml-auto text-xs text-muted-foreground">
          ~{formatCompactCurrency(monthlyTotal, currency)}/mo
        </span>
      </div>

      <ul className="space-y-1.5">
        {data.map((row) => (
          <li key={row.name}>
            <button
              type="button"
              onClick={() => onSelect?.(row.name)}
              disabled={!onSelect}
              className="flex w-full touch-manipulation items-baseline justify-between gap-3 border-l border-transparent py-1.5 pl-2 text-left text-xs hover:border-accent hover:text-accent disabled:cursor-default disabled:hover:border-transparent disabled:hover:text-inherit"
            >
              <span className="truncate font-medium">{row.name}</span>
              <span className="mono-nums shrink-0 text-muted-foreground">
                {formatCompactCurrency(row.avgAmountMinor, currency)}
                <span className="ml-1.5 text-muted-foreground/60">×{row.occurrences}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
