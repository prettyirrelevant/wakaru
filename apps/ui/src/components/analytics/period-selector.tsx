import { PERIOD_LABELS, type PeriodKey } from '~/lib/filters';
import { cn } from '~/lib/utils';

const ORDER: PeriodKey[] = ['30d', '90d', 'this-month', 'this-year', 'all'];

interface PeriodSelectorProps {
  value: PeriodKey;
  onChange: (period: PeriodKey) => void;
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const periods = value === 'custom' ? [...ORDER, 'custom' as const] : ORDER;

  return (
    <div
      role="group"
      aria-label="Time period"
      className="scrollbar-hide flex max-w-full gap-1 overflow-x-auto border border-border bg-muted/50 p-1"
    >
      {periods.map((period) => (
        <button
          key={period}
          onClick={() => onChange(period)}
          aria-pressed={value === period}
          className={cn(
            'shrink-0 touch-manipulation px-2.5 py-1.5 text-xs font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.97]',
            value === period
              ? 'bg-surface text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {PERIOD_LABELS[period]}
        </button>
      ))}
    </div>
  );
}
