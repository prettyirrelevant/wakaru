import type { CurrencyCode } from '~/types';
import { formatCompactCurrency } from '~/lib/utils';
import { cn } from '~/lib/utils';

interface StatsRowProps {
  inflowMinor: number;
  outflowMinor: number;
  netMinor: number;
  feesMinor: number;
  currency: CurrencyCode;
}

export function StatsRow({ inflowMinor, outflowMinor, netMinor, feesMinor, currency }: StatsRowProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StatCard label="in" value={formatCompactCurrency(inflowMinor, currency)} prefix="+" tone="success" />
      <StatCard label="out" value={formatCompactCurrency(outflowMinor, currency)} prefix="-" tone="destructive" />
      <StatCard
        label="net"
        value={formatCompactCurrency(Math.abs(netMinor), currency)}
        prefix={netMinor >= 0 ? '+' : '-'}
        tone={netMinor >= 0 ? 'success' : 'destructive'}
      />
      <StatCard
        label="fees"
        value={formatCompactCurrency(feesMinor, currency)}
        tone="warning"
        hint="charges, levies, VAT and stamp duty"
      />
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  prefix?: string;
  tone?: 'success' | 'destructive' | 'warning' | 'muted';
  hint?: string;
}

function StatCard({ label, value, prefix, tone = 'muted', hint }: StatCardProps) {
  return (
    <div className="tui-box p-3" title={hint}>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">$</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p
        className={cn(
          'mono-nums mt-1 text-lg font-semibold',
          tone === 'success' && 'text-success',
          tone === 'destructive' && 'text-destructive',
          tone === 'warning' && 'text-warning',
          tone === 'muted' && 'text-foreground'
        )}
      >
        {prefix && <span className="text-sm">{prefix}</span>}
        {value}
      </p>
    </div>
  );
}
