import { api } from "../api";
import { useApi } from "../useApi";
import { muscleLabel, shortDate } from "../format";
import { InsightCard } from "../components/InsightCard";
import { GoalBadge, QueryState } from "../components/ui";

export function History() {
  const history = useApi("history", api.history);

  return (
    <div className="view">
      <div className="view-head">
        <h1>History</h1>
        <p className="sub">Every session, tagged by its training emphasis.</p>
      </div>

      <QueryState loading={history.loading} error={history.error}>
        {history.data && (
          <InsightCard title="Sessions" subtitle={`${history.data.meta.workoutCount} workouts logged`}>
            {history.data.sessions.length === 0 ? (
              <p className="muted">No sessions yet.</p>
            ) : (
              <ul className="rows">
                {history.data.sessions.map((s) => (
                  <li key={s.id}>
                    <div className="session-row" style={{ flex: 1 }}>
                      <div>
                        <div className="session-title">{s.title}</div>
                        <div className="session-meta">
                          {shortDate(s.date)} · {s.exerciseCount} exercises · {s.totalSets} sets ·{" "}
                          {s.durationMinutes}m
                          {s.topMuscles.length > 0 && ` · ${s.topMuscles.map(muscleLabel).join(", ")}`}
                        </div>
                      </div>
                      <div className="session-right">
                        <span className="session-vol tnum">
                          {s.totalVolumeKg >= 1000
                            ? `${(s.totalVolumeKg / 1000).toFixed(1)}t`
                            : `${s.totalVolumeKg} kg`}
                        </span>
                        <GoalBadge goal={s.goal} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </InsightCard>
        )}
      </QueryState>
    </div>
  );
}
