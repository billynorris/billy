import type { PrEvent, SummaryDTO, TrainingData } from "@billynorris/lifting-shared";
import { bestE1rm, isWorkingSet, round, setVolumeKg, sortByStart, weekStart } from "./util";

export function buildSummary(data: TrainingData, now = new Date()): SummaryDTO {
  const thisWeek = weekStart(now.toISOString());
  const lastWeek = weekStart(new Date(now.getTime() - 7 * 86400000).toISOString());

  let workoutsThisWeek = 0;
  let weeklyVolume = 0;
  let lastWeekVolume = 0;
  let setsThisWeek = 0;

  for (const w of data.workouts) {
    const wk = weekStart(w.startTime);
    const volume = w.exercises.reduce(
      (vs, ex) => vs + ex.sets.filter(isWorkingSet).reduce((s, set) => s + setVolumeKg(set), 0),
      0,
    );
    if (wk === thisWeek) {
      workoutsThisWeek++;
      weeklyVolume += volume;
      setsThisWeek += w.exercises.reduce((c, ex) => c + ex.sets.filter(isWorkingSet).length, 0);
    } else if (wk === lastWeek) {
      lastWeekVolume += volume;
    }
  }

  return {
    meta: { fetchedAt: data.fetchedAt, workoutCount: data.workouts.length },
    workoutsThisWeek,
    weeklyVolumeKg: round(weeklyVolume, 0),
    weeklyVolumeChangePct:
      lastWeekVolume > 0 ? round(((weeklyVolume - lastWeekVolume) / lastWeekVolume) * 100, 1) : null,
    setsThisWeek,
    currentStreakWeeks: computeStreak(data, now),
    recentPrs: computeRecentPrs(data, 5),
  };
}

/** Consecutive weeks (ending this/last week) with at least one workout. */
function computeStreak(data: TrainingData, now: Date): number {
  const weeks = new Set(data.workouts.map((w) => weekStart(w.startTime)));
  let streak = 0;
  const cursor = new Date(now);
  // Allow the current week to be empty without breaking the streak.
  if (!weeks.has(weekStart(cursor.toISOString()))) cursor.setDate(cursor.getDate() - 7);
  while (weeks.has(weekStart(cursor.toISOString()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

function computeRecentPrs(data: TrainingData, limit: number): PrEvent[] {
  const best = new Map<string, number>();
  const prs: PrEvent[] = [];
  for (const w of sortByStart(data.workouts)) {
    for (const ex of w.exercises) {
      const e = bestE1rm(ex.sets);
      if (e <= 0) continue;
      const prev = best.get(ex.templateId) ?? 0;
      if (e > prev) {
        if (prev > 0) {
          prs.push({
            exerciseId: ex.templateId,
            exerciseName: data.templates[ex.templateId]?.name ?? ex.name,
            date: w.startTime,
            e1rmKg: round(e, 1),
            deltaKg: round(e - prev, 1),
          });
        }
        best.set(ex.templateId, e);
      }
    }
  }
  return prs.reverse().slice(0, limit);
}
