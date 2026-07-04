import type { HeatmapDTO } from "@billynorris/lifting-shared";
import { muscleLabel, shortDate } from "../../format";

/**
 * Weekly working-sets-per-muscle grid. Cell intensity scales with set count
 * relative to the busiest cell, so hot/cold training patterns pop out at a
 * glance (LiftShift-inspired). Pure CSS — colour comes from --chart-accent.
 */
export function MuscleHeatmap({ data }: { data: HeatmapDTO }) {
  const max = Math.max(1, ...data.rows.flatMap((r) => r.weeklySets));

  return (
    <div>
      <div className="heatmap">
        {data.rows.map((row) => (
          <div className="hm-row" key={row.muscle}>
            <span className="hm-label">{muscleLabel(row.muscle)}</span>
            <div className="hm-cells">
              {row.weeklySets.map((sets, i) => {
                // 0 sets stays at base; otherwise 18%–100% so any work is visible.
                const fill = sets === 0 ? 0 : 18 + (sets / max) * 82;
                const week = data.weekStarts[i];
                return (
                  <div
                    key={week ?? i}
                    className="hm-cell"
                    style={{ ["--fill" as string]: `${fill}%` }}
                    title={`${muscleLabel(row.muscle)} · ${week ? shortDate(week) : ""}: ${sets} sets`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="hm-legend">
        <span>Less</span>
        <span className="hm-swatch" style={{ ["--fill" as string]: "18%", background: "color-mix(in srgb, var(--chart-accent) 18%, var(--bg))" }} />
        <span className="hm-swatch" style={{ background: "color-mix(in srgb, var(--chart-accent) 55%, var(--bg))" }} />
        <span className="hm-swatch" style={{ background: "color-mix(in srgb, var(--chart-accent) 100%, var(--bg))" }} />
        <span>More · {data.weekStarts.length} weeks</span>
      </div>
    </div>
  );
}
