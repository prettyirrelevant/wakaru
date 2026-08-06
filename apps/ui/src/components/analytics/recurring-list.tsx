import type { CurrencyCode } from '~/types';
import type { RecurringPayment } from '~/hooks/useAnalytics';
import { formatCompactCurrency } from '~/lib/utils';

interface RecurringListProps {
  data: RecurringPayment[];
  currency: CurrencyCode;
  onSelect?: (name: string) => void;
}

/**
 * Payments that repeat on a steady amount across three or more months. The
 * query already filters on low variance, so what lands here is subscriptions
 * and standing commitments rather than coincidence.
 */
export function RecurringList({ data, currency, onSelect }: RecurringListProps) {
  if (data.length === 0) return null;

  const monthlyTotal = data.reduce((sum, row) => sum + row.avgAmountMinor, 0);

  return (
    <section className="tui-box p-4" aria-labelledby="recurring-heading">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">$</span>
        <h2 id="recurring-heading" className="text-sm font-medium">
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
              className="flex w-full items-baseline justify-between gap-3 text-left text-xs hover:text-accent disabled:cursor-default disabled:hover:text-inherit"
            >
              <span className="truncate">{row.name}</span>
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
