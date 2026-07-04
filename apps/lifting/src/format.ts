import type { MuscleGroup, SessionGoal, TrendStatus } from "@billynorris/lifting-shared";

export function kg(n: number | null | undefined, dp = 1): string {
  if (n == null) return "—";
  return `${n.toFixed(dp)} kg`;
}

export function compactKg(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}t`;
  return `${Math.round(n)} kg`;
}

export function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function relativeDays(days: number | null): string {
  if (days == null) return "never";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function muscleLabel(m: MuscleGroup): string {
  return m
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/** Badge tone maps to a CSS class suffix: .badge.<tone>. */
export const TREND_META: Record<TrendStatus, { label: string; tone: string }> = {
  new: { label: "New", tone: "muted" },
  overload: { label: "Progressing", tone: "pos" },
  stagnant: { label: "Stagnant", tone: "warn" },
  plateau: { label: "Plateau", tone: "warn" },
  regression: { label: "Regressing", tone: "neg" },
};

export const GOAL_META: Record<SessionGoal, { label: string; tone: string }> = {
  strength: { label: "Strength", tone: "pos" },
  hypertrophy: { label: "Hypertrophy", tone: "accent" },
  endurance: { label: "Endurance", tone: "warn" },
  mixed: { label: "Mixed", tone: "muted" },
};
