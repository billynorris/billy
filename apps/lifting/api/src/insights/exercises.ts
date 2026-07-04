import type {
  ExerciseListItemDTO,
  ExerciseProgressionDTO,
  ProgressionPoint,
  TrainingData,
  TrendStatus,
} from "@billynorris/lifting-shared";
import { bestE1rm, isWorkingSet, round, setVolumeKg, sortByStart } from "./util";

interface ExerciseInstance {
  date: string;
  e1rm: number;
  topSetWeightKg: number | null;
  topSetReps: number | null;
  volume: number;
}

/** Collect, per template id, one data point per workout the exercise appears in. */
function collectInstances(data: TrainingData): Map<string, ExerciseInstance[]> {
  const byExercise = new Map<string, ExerciseInstance[]>();
  for (const w of sortByStart(data.workouts)) {
    for (const ex of w.exercises) {
      const working = ex.sets.filter(isWorkingSet);
      if (working.length === 0) continue;
      let topWeight: number | null = null;
      let topReps: number | null = null;
      let bestSetE1rm = 0;
      for (const s of working) {
        if (s.weightKg == null || s.reps == null) continue;
        const e = s.weightKg * (1 + s.reps / 30);
        if (e > bestSetE1rm) {
          bestSetE1rm = e;
          topWeight = s.weightKg;
          topReps = s.reps;
        }
      }
      const point: ExerciseInstance = {
        date: w.startTime,
        e1rm: bestE1rm(ex.sets),
        topSetWeightKg: topWeight,
        topSetReps: topReps,
        volume: working.reduce((sum, s) => sum + setVolumeKg(s), 0),
      };
      const list = byExercise.get(ex.templateId) ?? [];
      list.push(point);
      byExercise.set(ex.templateId, list);
    }
  }
  return byExercise;
}

/**
 * Classify recent trajectory from the estimated-1RM series.
 * Compares the recent window's best e1RM against the prior window.
 */
export function classifyTrend(
  instances: ExerciseInstance[],
): { status: TrendStatus | null; note: string | null } {
  if (instances.length < 2) return { status: "new", note: "Not enough history yet" };

  const recentWindow = Math.min(4, Math.floor(instances.length / 2));
  const recent = instances.slice(-recentWindow);
  const prior = instances.slice(-recentWindow * 2, -recentWindow);
  if (prior.length === 0) return { status: "new", note: "Building baseline" };

  const recentBest = Math.max(...recent.map((i) => i.e1rm));
  const priorBest = Math.max(...prior.map((i) => i.e1rm));
  const delta = recentBest - priorBest;
  const pct = priorBest > 0 ? (delta / priorBest) * 100 : 0;
  const note = `${delta >= 0 ? "+" : ""}${round(delta, 1)}kg e1RM vs previous ${recentWindow} sessions`;

  if (pct >= 2) return { status: "overload", note };
  if (pct <= -3) return { status: "regression", note };
  if (Math.abs(pct) < 1) return { status: "plateau", note };
  return { status: "stagnant", note };
}

export function buildExerciseList(data: TrainingData): ExerciseListItemDTO[] {
  const instances = collectInstances(data);
  const items: ExerciseListItemDTO[] = [];
  for (const [id, list] of instances) {
    const template = data.templates[id];
    const last = list[list.length - 1];
    items.push({
      id,
      name: template?.name ?? id,
      primaryMuscle: template?.primaryMuscle ?? "other",
      lastPerformed: last?.date ?? null,
      bestE1rmKg: round(Math.max(...list.map((i) => i.e1rm)), 1),
      trend: classifyTrend(list).status,
    });
  }
  return items.sort((a, b) => (b.lastPerformed ?? "").localeCompare(a.lastPerformed ?? ""));
}

export function buildProgression(
  data: TrainingData,
  exerciseId: string,
): ExerciseProgressionDTO | null {
  const list = collectInstances(data).get(exerciseId);
  if (!list || list.length === 0) return null;
  const template = data.templates[exerciseId];

  let runningBest = 0;
  const points: ProgressionPoint[] = list.map((i) => {
    const isPr = i.e1rm > runningBest;
    if (isPr) runningBest = i.e1rm;
    return {
      date: i.date,
      e1rmKg: round(i.e1rm, 1),
      topSetWeightKg: i.topSetWeightKg,
      topSetReps: i.topSetReps,
      totalVolumeKg: round(i.volume, 0),
      isPr,
    };
  });

  const trend = classifyTrend(list);
  return {
    exerciseId,
    exerciseName: template?.name ?? exerciseId,
    primaryMuscle: template?.primaryMuscle ?? "other",
    points,
    trend: trend.status,
    trendNote: trend.note,
  };
}
