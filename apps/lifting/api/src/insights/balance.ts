import type {
  BalanceDTO,
  MuscleBalanceEntry,
  MuscleGroup,
  TrainingData,
} from "@billynorris/lifting-shared";
import { daysBetween, isWorkingSet } from "./util";

// Rough push/pull tagging for the upper-body ratio metric.
const PUSH: MuscleGroup[] = ["chest", "shoulders", "triceps"];
const PULL: MuscleGroup[] = ["lats", "upper_back", "biceps", "traps"];

export function buildBalance(data: TrainingData, now = new Date()): BalanceDTO {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 28);
  const cutoffIso = cutoff.toISOString();

  const sets = new Map<MuscleGroup, number>();
  const lastTrained = new Map<MuscleGroup, string>();
  let push = 0;
  let pull = 0;

  for (const w of data.workouts) {
    const recent = w.startTime >= cutoffIso;
    for (const ex of w.exercises) {
      const template = data.templates[ex.templateId];
      if (!template) continue;
      const count = ex.sets.filter(isWorkingSet).length;
      if (count === 0) continue;

      const muscles: Array<[MuscleGroup, number]> = [
        [template.primaryMuscle, count],
        ...template.secondaryMuscles.map((m) => [m, count * 0.5] as [MuscleGroup, number]),
      ];

      for (const [m, amount] of muscles) {
        const prev = lastTrained.get(m);
        if (!prev || w.startTime > prev) lastTrained.set(m, w.startTime);
        if (recent) {
          sets.set(m, (sets.get(m) ?? 0) + amount);
          if (PUSH.includes(m)) push += amount;
          if (PULL.includes(m)) pull += amount;
        }
      }
    }
  }

  const totalSets = [...sets.values()].reduce((a, b) => a + b, 0);
  const muscles: MuscleBalanceEntry[] = [...sets.entries()]
    .map(([muscle, setsLast4Weeks]) => {
      const last = lastTrained.get(muscle);
      return {
        muscle,
        setsLast4Weeks: Math.round(setsLast4Weeks * 10) / 10,
        sharePct: totalSets > 0 ? Math.round((setsLast4Weeks / totalSets) * 1000) / 10 : 0,
        daysSinceLastTrained: last ? daysBetween(last, now.toISOString()) : null,
      };
    })
    .sort((a, b) => b.setsLast4Weeks - a.setsLast4Weeks);

  return {
    meta: { fetchedAt: data.fetchedAt, workoutCount: data.workouts.length },
    pushPullRatio: pull > 0 ? Math.round((push / pull) * 100) / 100 : null,
    muscles,
  };
}
