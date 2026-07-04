import type {
  HeatmapCell,
  HeatmapDTO,
  MuscleGroup,
  TrainingData,
} from "@billynorris/lifting-shared";
import { isWorkingSet, round, weekStart } from "./util";

/**
 * Weekly working-set count per muscle over the most recent `weeks` weeks — the
 * grid behind the interactive muscle heatmap (LiftShift-inspired). Secondary
 * muscles earn a half set, matching the volume convention.
 */
export function buildHeatmap(data: TrainingData, weeks = 12, now = new Date()): HeatmapDTO {
  // Build the ordered list of week-start ISO dates (oldest → newest).
  const weekStarts: string[] = [];
  const cursor = new Date(weekStart(now.toISOString()));
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(cursor);
    d.setDate(d.getDate() - i * 7);
    weekStarts.push(d.toISOString());
  }
  const weekIndex = new Map(weekStarts.map((w, i) => [w, i]));

  const rows = new Map<MuscleGroup, number[]>();
  const ensure = (m: MuscleGroup): number[] => {
    let arr = rows.get(m);
    if (!arr) {
      arr = new Array(weeks).fill(0);
      rows.set(m, arr);
    }
    return arr;
  };

  for (const w of data.workouts) {
    const idx = weekIndex.get(weekStart(w.startTime));
    if (idx === undefined) continue; // outside the window
    for (const ex of w.exercises) {
      const template = data.templates[ex.templateId];
      if (!template) continue;
      const count = ex.sets.filter(isWorkingSet).length;
      if (count === 0) continue;
      ensure(template.primaryMuscle)[idx] += count;
      for (const m of template.secondaryMuscles) ensure(m)[idx] += count * 0.5;
    }
  }

  const cells: HeatmapCell[] = [...rows.entries()]
    .map(([muscle, weeklySets]) => ({
      muscle,
      weeklySets: weeklySets.map((n) => round(n, 1)),
    }))
    .sort(
      (a, b) =>
        b.weeklySets.reduce((s, n) => s + n, 0) - a.weeklySets.reduce((s, n) => s + n, 0),
    );

  return {
    meta: { fetchedAt: data.fetchedAt, workoutCount: data.workouts.length },
    weekStarts,
    rows: cells,
  };
}
