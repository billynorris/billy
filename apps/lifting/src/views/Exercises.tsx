import { useState } from "react";
import { api } from "../api";
import { useApi } from "../useApi";
import { daysAgo, kg, muscleLabel, relativeDays, shortDate } from "../format";
import { InsightCard } from "../components/InsightCard";
import { QueryState, TrendBadge } from "../components/ui";
import { ExerciseProgressChart } from "../components/charts/ExerciseProgressChart";

export function Exercises() {
  const list = useApi("exercises", api.exercises);
  const [selected, setSelected] = useState<string | null>(null);

  const activeId = selected ?? list.data?.[0]?.id ?? null;
  const progression = useApi(activeId, () => api.progression(activeId!));

  return (
    <div className="view">
      <div className="view-head">
        <h1>Exercises</h1>
        <p className="sub">Per-lift strength progression and trend.</p>
      </div>

      <QueryState loading={list.loading} error={list.error}>
        <div className="ex-layout">
          <ul className="ex-list">
            {list.data?.map((ex) => (
              <li key={ex.id}>
                <button
                  className={`ex-item${ex.id === activeId ? " active" : ""}`}
                  onClick={() => setSelected(ex.id)}
                >
                  <span style={{ minWidth: 0 }}>
                    <span className="ex-name">{ex.name}</span>
                    <span className="ex-meta" style={{ display: "block" }}>
                      {muscleLabel(ex.primaryMuscle)} · {relativeDays(daysAgo(ex.lastPerformed))}
                    </span>
                  </span>
                  <TrendBadge trend={ex.trend} />
                </button>
              </li>
            ))}
          </ul>

          <div>
            {progression.loading && <div className="loading">Loading…</div>}
            {progression.data && (
              <InsightCard
                title={progression.data.exerciseName}
                subtitle={progression.data.trendNote ?? undefined}
                actions={<TrendBadge trend={progression.data.trend} />}
              >
                <ExerciseProgressChart points={progression.data.points} />
                <div className="mini-grid">
                  <Mini
                    label="Best e1RM"
                    value={kg(Math.max(...progression.data.points.map((p) => p.e1rmKg)))}
                  />
                  <Mini label="Sessions" value={String(progression.data.points.length)} />
                  <Mini
                    label="Last session"
                    value={shortDate(progression.data.points[progression.data.points.length - 1]!.date)}
                  />
                </div>
              </InsightCard>
            )}
          </div>
        </div>
      </QueryState>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="mini">
      <div className="mini-label">{label}</div>
      <div className="mini-value">{value}</div>
    </div>
  );
}
