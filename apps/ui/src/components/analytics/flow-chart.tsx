import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  type TooltipProps,
} from 'recharts';
import type { CurrencyCode, MonthlyData } from '~/types';
import { formatCompactCurrency, millify, toMajorUnits } from '~/lib/utils';

interface FlowChartProps {
  data: MonthlyData[];
  currency: CurrencyCode;
}

// Theme tokens rather than fixed hues, so the chart tracks light and dark.
const IN_COLOR = 'hsl(var(--success))';
const OUT_COLOR = 'hsl(var(--destructive))';

export function FlowChart({ data, currency }: FlowChartProps) {
  if (data.length < 2 || !data.some((point) => point.inflow !== 0 || point.outflow !== 0)) {
    return null;
  }

  const chartData = data.map((d) => ({
    inflow: toMajorUnits(d.inflow),
    outflow: toMajorUnits(d.outflow),
    label: formatMonthLabel(d.month),
  }));

  return (
    <section className="tui-box h-full p-5" aria-labelledby="cashflow-heading">
      <p className="sr-only">Monthly money in and money out across the selected period.</p>
      <div className="mb-4 flex items-center gap-2">
        <h2 id="cashflow-heading" className="text-sm font-semibold">
          cashflow
        </h2>
        <div className="ml-auto flex gap-3">
          <Legend color="bg-success" label="in" />
          <Legend color="bg-destructive" label="out" />
        </div>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="inflowGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={IN_COLOR} stopOpacity={0.3} />
                <stop offset="95%" stopColor={IN_COLOR} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="outflowGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={OUT_COLOR} stopOpacity={0.3} />
                <stop offset="95%" stopColor={OUT_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
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
              tickFormatter={(value: number) => millify(value)}
              width={45}
            />
            <Tooltip content={<FlowTooltip currency={currency} />} />
            <Area
              type="monotone"
              dataKey="inflow"
              stroke={IN_COLOR}
              fill="url(#inflowGradient)"
              strokeWidth={1.5}
              name="Inflow"
              dot={false}
              activeDot={{ r: 3, fill: IN_COLOR }}
            />
            <Area
              type="monotone"
              dataKey="outflow"
              stroke={OUT_COLOR}
              fill="url(#outflowGradient)"
              strokeWidth={1.5}
              name="Outflow"
              dot={false}
              activeDot={{ r: 3, fill: OUT_COLOR }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className={`h-2 w-2 rounded-sm ${color}`} />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function FlowTooltip({
  active,
  payload,
  label,
  currency,
}: TooltipProps<number, string> & { currency: CurrencyCode }) {
  if (!active || !payload?.length) return null;

  const inflow = payload.find((p) => p.dataKey === 'inflow')?.value as number | undefined;
  const outflow = payload.find((p) => p.dataKey === 'outflow')?.value as number | undefined;

  return (
    <div className="tui-box p-2 text-xs">
      <p className="mb-1 text-muted-foreground">{label}</p>
      {inflow !== undefined && (
        <p className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">in</span>
          <span className="mono-nums text-success">
            +{formatCompactCurrency(Math.round(inflow * 100), currency)}
          </span>
        </p>
      )}
      {outflow !== undefined && (
        <p className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">out</span>
          <span className="mono-nums text-destructive">
            -{formatCompactCurrency(Math.round(outflow * 100), currency)}
          </span>
        </p>
      )}
    </div>
  );
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-');
  const index = parseInt(m, 10) - 1;
  // Anchor the year at each January so a multi-year chart stays readable.
  return index === 0 ? `${MONTH_NAMES[index]} '${year.slice(-2)}` : MONTH_NAMES[index];
}
