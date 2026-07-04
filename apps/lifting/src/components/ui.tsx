import type { ReactNode } from "react";
import type { SessionGoal, TrendStatus } from "@billynorris/lifting-shared";
import { GOAL_META, TREND_META } from "../format";

export function StatTile({
  label,
  value,
  delta,
  deltaTone,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "pos" | "neg" | "muted";
}) {
  const tone = deltaTone === "pos" ? "pos" : deltaTone === "neg" ? "neg" : "muted";
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {delta && <div className={`stat-delta ${tone}`}>{delta}</div>}
    </div>
  );
}

export function TrendBadge({ trend }: { trend: TrendStatus | null }) {
  if (!trend) return null;
  const meta = TREND_META[trend];
  return <span className={`badge ${meta.tone}`}>{meta.label}</span>;
}

export function GoalBadge({ goal }: { goal: SessionGoal }) {
  const meta = GOAL_META[goal];
  return <span className={`badge ${meta.tone}`}>{meta.label}</span>;
}

/** Loading / error / empty gate around a query's children. */
export function QueryState({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: unknown;
  children: ReactNode;
}) {
  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="error empty">Couldn’t load data. Is the API running?</div>;
  return <>{children}</>;
}
