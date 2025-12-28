import { formatCompactCurrency } from '~/lib/utils';
import { cn } from '~/lib/utils';

interface StatsRowProps {
  inflow: number;
  outflow: number;
  net: number;
}

export function StatsRow({ inflow, outflow, net }: StatsRowProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <StatCard
        label="in"
        value={formatCompactCurrency(inflow)}
        prefix="+"
        variant="green"
      />
      <StatCard
        label="out"
        value={formatCompactCurrency(outflow)}
        prefix="-"
        variant="red"
      />
      <StatCard
        label="net"
        value={formatCompactCurrency(Math.abs(net))}
        prefix={net >= 0 ? '+' : '-'}
        variant={net >= 0 ? 'green' : 'red'}
      />
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  prefix?: string;
  variant?: 'green' | 'red' | 'muted';
}

function StatCard({ label, value, prefix, variant = 'muted' }: StatCardProps) {
  return (
    <div className="tui-box p-3">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground text-xs">$</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p
        className={cn(
          'mt-1 text-lg font-semibold mono-nums',
          variant === 'green' && 'text-green-500',
          variant === 'red' && 'text-red-500',
          variant === 'muted' && 'text-foreground'
        )}
      >
        {prefix && <span className="text-sm">{prefix}</span>}
        {value}
      </p>
    </div>
  );
}
