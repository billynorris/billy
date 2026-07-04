import { api } from "../api";
import { useApi } from "../useApi";
import { muscleLabel, relativeDays } from "../format";
import { InsightCard } from "../components/InsightCard";
import { QueryState, StatTile } from "../components/ui";
import { BalanceRadar } from "../components/charts/BalanceRadar";

export function Balance() {
  const balance = useApi("balance", api.balance);

  return (
    <div className="view">
      <div className="view-head">
        <h1>Balance &amp; recovery</h1>
        <p className="sub">Set distribution per muscle over the last 4 weeks.</p>
      </div>

      <QueryState loading={balance.loading} error={balance.error}>
        {balance.data && (
          <div className="split">
            <InsightCard title="Muscle set distribution" subtitle="Working sets, last 4 weeks">
              <BalanceRadar muscles={balance.data.muscles} />
            </InsightCard>

            <div className="stack">
              <StatTile
                label="Push / pull ratio"
                value={balance.data.pushPullRatio != null ? balance.data.pushPullRatio.toFixed(2) : "—"}
                delta={balance.data.pushPullRatio != null ? "balanced ≈ 1.00" : undefined}
                deltaTone="muted"
              />
              <InsightCard title="What's stale" subtitle="Days since last trained">
                {balance.data.muscles.length === 0 ? (
                  <p className="muted">No recent training.</p>
                ) : (
                  <ul className="rows">
                    {balance.data.muscles.slice(0, 8).map((m) => (
                      <li key={m.muscle}>
                        <span>{muscleLabel(m.muscle)}</span>
                        <span className="muted tnum">
                          {m.setsLast4Weeks} sets · {relativeDays(m.daysSinceLastTrained)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </InsightCard>
            </div>
          </div>
        )}
      </QueryState>
    </div>
  );
}
