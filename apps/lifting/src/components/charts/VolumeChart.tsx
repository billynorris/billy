import type { VolumePoint } from "@billynorris/lifting-shared";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { compactKg, shortDate } from "../../format";
import { axisProps, CHART } from "./theme";
import { ChartTooltip } from "./ChartTooltip";

export type VolumeView = "area" | "bar";

export function VolumeChart({ weeks, view }: { weeks: VolumePoint[]; view: VolumeView }) {
  const data = weeks.map((w) => ({
    week: shortDate(w.weekStart),
    volume: w.totalVolumeKg,
    sets: w.totalSets,
  }));

  const common = (
    <>
      <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="week" {...axisProps} minTickGap={24} />
      <YAxis {...axisProps} width={48} tickFormatter={(v) => compactKg(v)} />
      <Tooltip content={<ChartTooltip formatter={(v, name) => (name === "Sets" ? `${v}` : compactKg(v))} />} />
    </>
  );

  return (
    <ResponsiveContainer width="100%" height={260}>
      {view === "area" ? (
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
          <defs>
            <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.accent} stopOpacity={0.3} />
              <stop offset="100%" stopColor={CHART.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          {common}
          <Area
            type="monotone"
            dataKey="volume"
            name="Volume"
            stroke={CHART.accent}
            strokeWidth={2}
            fill="url(#volFill)"
          />
        </AreaChart>
      ) : (
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
          {common}
          <Bar dataKey="volume" name="Volume" fill={CHART.accent} radius={[3, 3, 0, 0]} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
