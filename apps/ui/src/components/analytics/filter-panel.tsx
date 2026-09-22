import { type FilterState } from '~/lib/filters';
import { useFilterOptions } from '~/hooks/useFilterOptions';
import { formatKind } from '~/lib/utils';
import { cn } from '~/lib/utils';

interface FilterPanelProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

export function FilterPanel({ filters, onChange }: FilterPanelProps) {
  const { accounts, categories, kinds, minDate, maxDate } = useFilterOptions();

  const toggle = (key: 'accounts' | 'categories' | 'kinds', value: string) => {
    const current = filters[key];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ ...filters, [key]: next });
  };

  const setFlow = (flow: 'in' | 'out') => {
    onChange({ ...filters, flow: filters.flow === flow ? null : flow });
  };

  const parseAmount = (value: string): number | null => {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">&gt; filters</h3>
          <p className="mt-1 text-xs text-muted-foreground">every filter also updates dashboard totals.</p>
        </div>
      </div>

      <Group label="flow">
        <Chip active={filters.flow === 'in'} onClick={() => setFlow('in')} tone="success">
          [money in]
        </Chip>
        <Chip active={filters.flow === 'out'} onClick={() => setFlow('out')} tone="destructive">
          [money out]
        </Chip>
      </Group>

      {accounts.length > 1 && (
        <Group label="account">
          {accounts.map((account) => (
            <Chip
              key={account.id}
              active={filters.accounts.includes(account.id)}
              onClick={() => toggle('accounts', account.id)}
            >
              {account.label}
            </Chip>
          ))}
        </Group>
      )}

      {categories.length > 0 && (
        <Group label="category">
          {categories.map((category) => (
            <Chip
              key={category.id}
              active={filters.categories.includes(category.id)}
              onClick={() => toggle('categories', category.id)}
            >
              {category.name}
            </Chip>
          ))}
          <Chip
            active={filters.categories.includes('uncategorized')}
            onClick={() => toggle('categories', 'uncategorized')}
          >
            uncategorized
          </Chip>
        </Group>
      )}

      {kinds.length > 1 && (
        <Group label="transaction type">
          {kinds.map((kind) => (
            <Chip
              key={kind}
              active={filters.kinds.includes(kind)}
              onClick={() => toggle('kinds', kind)}
            >
              {formatKind(kind)}
            </Chip>
          ))}
        </Group>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="amount-min" className="mb-2 block text-xs font-medium text-muted-foreground">&gt; amount</label>
          <div className="flex items-center gap-1">
            <input
              id="amount-min"
              name="amount-min"
              type="number"
              inputMode="decimal"
              autoComplete="off"
              aria-label="Minimum amount"
              placeholder="min…"
              value={filters.amountMin ?? ''}
              onChange={(e) => onChange({ ...filters, amountMin: parseAmount(e.target.value) })}
              className="tui-input mono-nums w-full text-base sm:text-sm"
            />
            <span className="text-[10px] text-muted-foreground">to</span>
            <input
              name="amount-max"
              type="number"
              inputMode="decimal"
              autoComplete="off"
              aria-label="Maximum amount"
              placeholder="max…"
              value={filters.amountMax ?? ''}
              onChange={(e) => onChange({ ...filters, amountMax: parseAmount(e.target.value) })}
              className="tui-input mono-nums w-full text-base sm:text-sm"
            />
          </div>
        </div>

        <div>
          <label htmlFor="date-from" className="mb-2 block text-xs font-medium text-muted-foreground">&gt; date</label>
          <div className="flex items-center gap-1">
            <input
              type="date"
              id="date-from"
              name="date-from"
              autoComplete="off"
              aria-label="From date"
              value={filters.dateFrom ?? ''}
              min={minDate ?? undefined}
              max={maxDate ?? undefined}
              onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || null })}
              className="tui-input w-full text-xs"
            />
            <span className="text-[10px] text-muted-foreground">to</span>
            <input
              type="date"
              name="date-to"
              autoComplete="off"
              aria-label="To date"
              value={filters.dateTo ?? ''}
              min={minDate ?? undefined}
              max={maxDate ?? undefined}
              onChange={(e) => onChange({ ...filters, dateTo: e.target.value || null })}
              className="tui-input w-full text-xs"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Toggle
          checked={filters.excludeInternal}
          onChange={(checked) => onChange({ ...filters, excludeInternal: checked })}
          label="hide internal transfers"
        />
        <Toggle
          checked={filters.hideChildFees}
          onChange={(checked) => onChange({ ...filters, hideChildFees: checked })}
          label="group fees with transactions"
        />
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function Chip({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'success' | 'destructive';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'touch-manipulation border px-2.5 py-1.5 text-xs font-medium transition-[background-color,border-color,color,transform] active:scale-[0.97]',
        !active && 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
        active && tone === 'success' && 'border-success/40 bg-success-muted text-success',
        active && tone === 'destructive' && 'border-destructive/40 bg-destructive-muted text-destructive',
        active && !tone && 'border-accent/40 bg-accent/10 text-accent'
      )}
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex min-h-8 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[hsl(var(--accent))]"
      />
      {label}
    </label>
  );
}
