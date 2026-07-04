import { useState } from "react";
import { api } from "../api";
import { useApi } from "../useApi";
import { InsightCard, ViewToggle } from "../components/InsightCard";
import { QueryState } from "../components/ui";
import { VolumeChart, type VolumeView } from "../components/charts/VolumeChart";
import { MuscleHeatmap } from "../components/charts/MuscleHeatmap";

export function Volume() {
  const volume = useApi("volume", api.volume);
  const heatmap = useApi("heatmap", api.heatmap);
  const [view, setView] = useState<VolumeView>("area");

  return (
    <div className="view">
      <div className="view-head">
        <h1>Volume &amp; load</h1>
        <p className="sub">Weekly tonnage, working-set totals, and where the work landed.</p>
      </div>

      <QueryState loading={volume.loading} error={volume.error}>
        {volume.data && (
          <InsightCard
            title="Weekly volume"
            subtitle="Total tonnage (weight × reps) per week"
            actions={
              <ViewToggle
                value={view}
                onChange={setView}
                options={[
                  { value: "area", label: "Area" },
                  { value: "bar", label: "Bar" },
                ]}
              />
            }
          >
            <VolumeChart weeks={volume.data.weeks} view={view} />
          </InsightCard>
        )}
      </QueryState>

      <QueryState loading={heatmap.loading} error={heatmap.error}>
        {heatmap.data && (
          <InsightCard title="Muscle heatmap" subtitle="Working sets per muscle, by week">
            {heatmap.data.rows.length === 0 ? (
              <p className="muted">No recent training to map.</p>
            ) : (
              <MuscleHeatmap data={heatmap.data} />
            )}
          </InsightCard>
        )}
      </QueryState>
    </div>
  );
}
