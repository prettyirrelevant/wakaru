import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  type TooltipProps,
} from 'recharts';
import type { BalancePoint, CurrencyCode } from '~/types';
import { formatCompactCurrency, millify, toMajorUnits } from '~/lib/utils';

interface BalanceChartProps {
  data: BalancePoint[];
  currency: CurrencyCode;
}

export function BalanceChart({ data, currency }: BalanceChartProps) {
  if (data.length < 2) return null;

  const chartData = data.map((point) => ({
    label: formatDayLabel(point.at),
    balance: toMajorUnits(point.balanceMinor),
  }));

  return (
    <section className="tui-box p-4" aria-labelledby="balance-heading">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">$</span>
        <h2 id="balance-heading" className="text-sm font-medium">
          balance
        </h2>
        <span className="ml-auto mono-nums text-xs text-muted-foreground">
          {formatCompactCurrency(data[data.length - 1].balanceMinor, currency)} now
        </span>
      </div>

      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => millify(value)}
              width={45}
            />
            <Tooltip content={<BalanceTooltip currency={currency} />} />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="hsl(var(--accent))"
              fill="url(#balanceGradient)"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: 'hsl(var(--accent))' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function BalanceTooltip({
  active,
  payload,
  label,
  currency,
}: TooltipProps<number, string> & { currency: CurrencyCode }) {
  if (!active || !payload?.length) return null;

  const value = payload[0]?.value;
  if (typeof value !== 'number') return null;

  return (
    <div className="tui-box p-2 text-xs">
      <p className="mb-1 text-muted-foreground">{label}</p>
      <p className="mono-nums">{formatCompactCurrency(Math.round(value * 100), currency)}</p>
    </div>
  );
}

function formatDayLabel(day: string): string {
  const [, month, date] = day.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date} ${monthNames[parseInt(month, 10) - 1]}`;
}
