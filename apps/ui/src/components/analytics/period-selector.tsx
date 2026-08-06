import { PERIOD_LABELS, type PeriodKey } from '~/lib/filters';
import { cn } from '~/lib/utils';

const ORDER: PeriodKey[] = ['30d', '90d', 'this-month', 'this-year', 'all'];

interface PeriodSelectorProps {
  value: PeriodKey;
  onChange: (period: PeriodKey) => void;
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Time period"
      className="scrollbar-hide -mx-1 flex gap-1 overflow-x-auto px-1"
    >
      {ORDER.map((period) => (
        <button
          key={period}
          onClick={() => onChange(period)}
          aria-pressed={value === period}
          className={cn(
            'shrink-0 border px-2.5 py-1 text-xs transition-colors',
            value === period
              ? 'border-accent bg-accent text-accent-foreground'
              : 'border-border hover:border-border-strong'
          )}
        >
          {PERIOD_LABELS[period]}
        </button>
      ))}
    </div>
  );
}
