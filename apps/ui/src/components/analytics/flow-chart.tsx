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
import type { MonthlyData } from '~/types';
import { formatCompactCurrency, millify } from '~/lib/utils';

interface FlowChartProps {
  data: MonthlyData[];
}

export function FlowChart({ data }: FlowChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    // Convert from kobo to naira for display
    inflow: d.inflow / 100,
    outflow: d.outflow / 100,
    // Format month label with year context
    label: formatMonthLabel(d.month),
    fullLabel: formatFullMonth(d.month),
  }));

  return (
    <div className="tui-box p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-muted-foreground text-xs">$</span>
        <span className="text-sm font-medium">cashflow</span>
        <div className="flex gap-3 ml-auto">
          <span className="flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 bg-success rounded-sm" />
            <span className="text-muted-foreground">in</span>
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 bg-destructive rounded-sm" />
            <span className="text-muted-foreground">out</span>
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="inflowGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(142 70% 45%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(142 70% 45%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="outflowGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(0 70% 55%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(0 70% 55%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => millify(value)}
              width={45}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="inflow"
              stroke="hsl(142 70% 45%)"
              fill="url(#inflowGradient)"
              strokeWidth={1.5}
              name="Inflow"
              dot={false}
              activeDot={{ r: 3, fill: 'hsl(142 70% 45%)' }}
            />
            <Area
              type="monotone"
              dataKey="outflow"
              stroke="hsl(0 70% 55%)"
              fill="url(#outflowGradient)"
              strokeWidth={1.5}
              name="Outflow"
              dot={false}
              activeDot={{ r: 3, fill: 'hsl(0 70% 55%)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Custom tooltip component
function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || !payload.length) return null;

  const inflow = payload.find((p) => p.dataKey === 'inflow')?.value as number | undefined;
  const outflow = payload.find((p) => p.dataKey === 'outflow')?.value as number | undefined;

  return (
    <div className="tui-box p-2 text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {inflow !== undefined && (
        <p className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">in</span>
          <span className="text-success mono-nums">+{formatCompactCurrency(inflow * 100)}</span>
        </p>
      )}
      {outflow !== undefined && (
        <p className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">out</span>
          <span className="text-destructive mono-nums">-{formatCompactCurrency(outflow * 100)}</span>
        </p>
      )}
    </div>
  );
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIndex = parseInt(m, 10) - 1;
  // Show year suffix for Jan to provide context
  if (monthIndex === 0) {
    return `${monthNames[monthIndex]} '${year.slice(-2)}`;
  }
  return monthNames[monthIndex];
}

function formatFullMonth(month: string): string {
  const [year, m] = month.split('-');
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${monthNames[parseInt(m, 10) - 1]} ${year}`;
}
