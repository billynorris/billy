import type { ProgressionPoint } from "@billynorris/lifting-shared";
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { shortDate } from "../../format";
import { axisProps, CHART } from "./theme";
import { ChartTooltip } from "./ChartTooltip";

export function ExerciseProgressChart({ points }: { points: ProgressionPoint[] }) {
  const data = points.map((p) => ({
    date: shortDate(p.date),
    e1rm: p.e1rmKg,
    pr: p.isPr ? p.e1rmKg : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="e1rmFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.accent} stopOpacity={0.25} />
            <stop offset="100%" stopColor={CHART.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" {...axisProps} minTickGap={28} />
        <YAxis {...axisProps} width={44} domain={["auto", "auto"]} />
        <Tooltip
          content={<ChartTooltip formatter={(v, name) => `${v} kg${name === "PR" ? " 🏆" : ""}`} />}
        />
        <Area
          type="monotone"
          dataKey="e1rm"
          name="Est. 1RM"
          stroke={CHART.accent}
          strokeWidth={2}
          fill="url(#e1rmFill)"
          dot={false}
        />
        <Line type="monotone" dataKey="e1rm" name="Est. 1RM" stroke="transparent" dot={false} />
        <Scatter dataKey="pr" name="PR" fill={CHART.warning} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
