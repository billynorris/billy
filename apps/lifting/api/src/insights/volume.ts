import type { MuscleGroup, TrainingData, VolumeDTO, VolumePoint } from "@billynorris/lifting-shared";
import { isWorkingSet, round, setVolumeKg, weekStart } from "./util";

/**
 * Weekly tonnage and working-set counts, with a per-muscle-group set breakdown.
 * Secondary muscles are credited a half set (a common volume-landmark convention).
 */
export function buildVolume(data: TrainingData): VolumeDTO {
  const byWeek = new Map<string, VolumePoint>();

  for (const w of data.workouts) {
    const wk = weekStart(w.startTime);
    let point = byWeek.get(wk);
    if (!point) {
      point = { weekStart: wk, totalVolumeKg: 0, totalSets: 0, byMuscle: {} };
      byWeek.set(wk, point);
    }

    for (const ex of w.exercises) {
      const template = data.templates[ex.templateId];
      const working = ex.sets.filter(isWorkingSet);
      const setCount = working.length;
      if (setCount === 0) continue;

      point.totalSets += setCount;
      point.totalVolumeKg += working.reduce((s, set) => s + setVolumeKg(set), 0);

      if (template) {
        addMuscleSets(point.byMuscle, template.primaryMuscle, setCount);
        for (const m of template.secondaryMuscles) {
          addMuscleSets(point.byMuscle, m, setCount * 0.5);
        }
      }
    }
  }

  const weeks = [...byWeek.values()]
    .map((p) => ({
      ...p,
      totalVolumeKg: round(p.totalVolumeKg, 0),
      byMuscle: roundMuscles(p.byMuscle),
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  return {
    meta: { fetchedAt: data.fetchedAt, workoutCount: data.workouts.length },
    weeks,
  };
}

function addMuscleSets(
  acc: Partial<Record<MuscleGroup, number>>,
  muscle: MuscleGroup,
  amount: number,
): void {
  acc[muscle] = (acc[muscle] ?? 0) + amount;
}

function roundMuscles(
  m: Partial<Record<MuscleGroup, number>>,
): Partial<Record<MuscleGroup, number>> {
  const out: Partial<Record<MuscleGroup, number>> = {};
  for (const [k, v] of Object.entries(m)) {
    out[k as MuscleGroup] = round(v as number, 1);
  }
  return out;
}
