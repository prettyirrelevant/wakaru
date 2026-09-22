import { useState } from 'react';
import type { CounterpartySpend, CurrencyCode } from '~/types';
import { formatCompactCurrency } from '~/lib/utils';
import { cn } from '~/lib/utils';

interface TopCounterpartiesProps {
  outgoing: CounterpartySpend[];
  incoming: CounterpartySpend[];
  currency: CurrencyCode;
  onSelect?: (name: string) => void;
}

export function TopCounterparties({
  outgoing,
  incoming,
  currency,
  onSelect,
}: TopCounterpartiesProps) {
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const data = direction === 'out' ? outgoing : incoming;

  if (outgoing.length === 0 && incoming.length === 0) return null;

  return (
    <section className="tui-box p-5" aria-labelledby="counterparties-heading">
      <div className="mb-3 flex items-center gap-2">
        <h2 id="counterparties-heading" className="text-sm font-semibold">
          {direction === 'out' ? 'paid most to' : 'received most from'}
        </h2>
        <div className="ml-auto flex gap-1" role="group" aria-label="Direction">
          <DirectionButton
            active={direction === 'out'}
            onClick={() => setDirection('out')}
            label="out"
          />
          <DirectionButton
            active={direction === 'in'}
            onClick={() => setDirection('in')}
            label="in"
          />
        </div>
      </div>

      {data.length === 0 ? (
        <p className="text-xs text-muted-foreground">no transactions match this period</p>
      ) : (
        <ol className="space-y-1.5">
          {data.map((row, index) => (
            <li key={`${row.counterpartyId ?? row.name}-${index}`}>
              <button
                type="button"
                onClick={() => onSelect?.(row.name)}
                disabled={!onSelect}
                className="flex w-full items-baseline justify-between gap-3 text-left text-xs hover:text-accent disabled:cursor-default disabled:hover:text-inherit"
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="mono-nums w-4 shrink-0 text-muted-foreground/60">
                    {index + 1}
                  </span>
                  <span className="truncate">{row.name}</span>
                </span>
                <span className="mono-nums shrink-0 text-muted-foreground">
                  {formatCompactCurrency(row.amountMinor, currency)}
                  <span className="ml-1.5 text-muted-foreground/60">×{row.count}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function DirectionButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'border px-2 py-1 text-[11px] font-semibold transition-colors',
        active
          ? 'border-border-strong bg-muted text-foreground'
          : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}
