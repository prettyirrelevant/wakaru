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
    <div className="space-y-4 border-b border-border py-3">
      <Group label="type">
        <Chip active={filters.flow === 'in'} onClick={() => setFlow('in')} tone="success">
          [credit]
        </Chip>
        <Chip active={filters.flow === 'out'} onClick={() => setFlow('out')} tone="destructive">
          [debit]
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
        <Group label="kind">
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
          <div className="mb-1.5 text-[10px] text-muted-foreground">&gt; amount</div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="numeric"
              aria-label="Minimum amount"
              placeholder="min"
              value={filters.amountMin ?? ''}
              onChange={(e) => onChange({ ...filters, amountMin: parseAmount(e.target.value) })}
              className="mono-nums w-full border border-border bg-background px-2 py-1.5 text-base focus:border-accent focus:outline-none sm:text-sm"
            />
            <span className="text-[10px] text-muted-foreground">to</span>
            <input
              type="number"
              inputMode="numeric"
              aria-label="Maximum amount"
              placeholder="max"
              value={filters.amountMax ?? ''}
              onChange={(e) => onChange({ ...filters, amountMax: parseAmount(e.target.value) })}
              className="mono-nums w-full border border-border bg-background px-2 py-1.5 text-base focus:border-accent focus:outline-none sm:text-sm"
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[10px] text-muted-foreground">&gt; date</div>
          <div className="flex items-center gap-1">
            <input
              type="date"
              aria-label="From date"
              value={filters.dateFrom ?? ''}
              min={minDate ?? undefined}
              max={maxDate ?? undefined}
              onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || null })}
              className="w-full border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
            />
            <span className="text-[10px] text-muted-foreground">to</span>
            <input
              type="date"
              aria-label="To date"
              value={filters.dateTo ?? ''}
              min={minDate ?? undefined}
              max={maxDate ?? undefined}
              onChange={(e) => onChange({ ...filters, dateTo: e.target.value || null })}
              className="w-full border border-border bg-background px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
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
          label="roll fees into their transaction"
        />
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[10px] text-muted-foreground">&gt; {label}</legend>
      <div className="flex flex-wrap gap-1">{children}</div>
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
        'border px-2 py-1 text-xs transition-colors',
        !active && 'border-border bg-muted hover:border-border-strong',
        active && tone === 'success' && 'border-success/50 bg-success/20 text-success',
        active && tone === 'destructive' && 'border-destructive/50 bg-destructive/20 text-destructive',
        active && !tone && 'border-accent bg-accent text-accent-foreground'
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
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
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
