/** Shared Recharts styling so every chart reads consistently. */
export const CHART = {
  accent: "rgb(99 162 255)",
  positive: "rgb(74 201 155)",
  negative: "rgb(240 113 120)",
  warning: "rgb(232 184 96)",
  grid: "rgb(38 44 58)",
  axis: "rgb(138 146 162)",
} as const;

export const axisProps = {
  stroke: CHART.axis,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;
