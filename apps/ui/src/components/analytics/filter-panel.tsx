import { type FilterState } from '~/lib/filters';
import { useFilterOptions } from '~/hooks/useFilterOptions';
import { cn } from '~/lib/utils';

interface FilterPanelProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

export function FilterPanel({ filters, onChange }: FilterPanelProps) {
  const { banks, minDate, maxDate } = useFilterOptions();

  const toggleBank = (bank: string) => {
    const newBanks = filters.banks.includes(bank)
      ? filters.banks.filter(b => b !== bank)
      : [...filters.banks, bank];
    onChange({ ...filters, banks: newBanks });
  };

  const setFlow = (flow: 'in' | 'out' | null) => {
    onChange({ ...filters, flow: filters.flow === flow ? null : flow });
  };

  const setAmountMin = (value: string) => {
    const num = value ? parseInt(value, 10) : null;
    onChange({ ...filters, amountMin: num });
  };

  const setAmountMax = (value: string) => {
    const num = value ? parseInt(value, 10) : null;
    onChange({ ...filters, amountMax: num });
  };

  const setDateFrom = (value: string) => {
    onChange({ ...filters, dateFrom: value || null });
  };

  const setDateTo = (value: string) => {
    onChange({ ...filters, dateTo: value || null });
  };

  return (
    <div className="py-3 border-b border-border space-y-4">
      <div className="space-y-3">
        <div>
          <div className="text-[10px] text-muted-foreground mb-1.5">&gt; type</div>
          <div className="flex gap-1">
            <button
              onClick={() => setFlow('in')}
              className={cn(
                'text-xs px-3 py-1.5 border transition-colors',
                filters.flow === 'in'
                  ? 'bg-success/20 text-success border-success/50'
                  : 'bg-muted border-border hover:border-border-strong'
              )}
            >
              [credit]
            </button>
            <button
              onClick={() => setFlow('out')}
              className={cn(
                'text-xs px-3 py-1.5 border transition-colors',
                filters.flow === 'out'
                  ? 'bg-destructive/20 text-destructive border-destructive/50'
                  : 'bg-muted border-border hover:border-border-strong'
              )}
            >
              [debit]
            </button>
          </div>
        </div>

        <div>
          <div className="text-[10px] text-muted-foreground mb-1.5">&gt; bank</div>
          <div className="flex flex-wrap gap-1">
            {banks.map(bank => (
              <button
                key={bank}
                onClick={() => toggleBank(bank)}
                className={cn(
                  'text-xs px-2 py-1 border transition-colors',
                  filters.banks.includes(bank)
                    ? 'bg-accent text-accent-foreground border-accent'
                    : 'bg-muted border-border hover:border-border-strong'
                )}
              >
                {bank}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] text-muted-foreground mb-1.5">&gt; amount</div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="numeric"
              placeholder="min"
              value={filters.amountMin ?? ''}
              onChange={e => setAmountMin(e.target.value)}
              className="w-full text-base px-2 py-1.5 bg-background border border-border focus:border-accent focus:outline-none mono-nums"
            />
            <span className="text-muted-foreground text-[10px]">to</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder="max"
              value={filters.amountMax ?? ''}
              onChange={e => setAmountMax(e.target.value)}
              className="w-full text-base px-2 py-1.5 bg-background border border-border focus:border-accent focus:outline-none mono-nums"
            />
          </div>
        </div>

        <div>
          <div className="text-[10px] text-muted-foreground mb-1.5">&gt; date</div>
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={filters.dateFrom ?? ''}
              min={minDate ?? undefined}
              max={maxDate ?? undefined}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full text-xs px-2 py-1.5 bg-background border border-border focus:border-accent focus:outline-none"
            />
            <span className="text-muted-foreground text-[10px]">to</span>
            <input
              type="date"
              value={filters.dateTo ?? ''}
              min={minDate ?? undefined}
              max={maxDate ?? undefined}
              onChange={e => setDateTo(e.target.value)}
              className="w-full text-xs px-2 py-1.5 bg-background border border-border focus:border-accent focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
