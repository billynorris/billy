import type { MuscleBalanceEntry } from "@billynorris/lifting-shared";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { muscleLabel } from "../../format";
import { CHART } from "./theme";
import { ChartTooltip } from "./ChartTooltip";

export function BalanceRadar({ muscles }: { muscles: MuscleBalanceEntry[] }) {
  const data = muscles
    .filter((m) => m.setsLast4Weeks > 0)
    .slice(0, 10)
    .map((m) => ({ muscle: muscleLabel(m.muscle), sets: m.setsLast4Weeks }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke={CHART.grid} />
        <PolarAngleAxis dataKey="muscle" tick={{ fill: CHART.axis, fontSize: 11 }} />
        <Tooltip content={<ChartTooltip formatter={(v) => `${v} sets`} />} />
        <Radar
          dataKey="sets"
          name="Sets (4wk)"
          stroke={CHART.accent}
          fill={CHART.accent}
          fillOpacity={0.25}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
