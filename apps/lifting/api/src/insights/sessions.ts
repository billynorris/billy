import type {
  HistoryDTO,
  MuscleGroup,
  SessionGoal,
  SessionSummary,
  TrainingData,
  Workout,
} from "@billynorris/lifting-shared";
import { isWorkingSet, round, setVolumeKg, sortByStart } from "./util";

/**
 * Classify a session's training emphasis from its working-set rep distribution
 * (inspired by LiftShift's session-goal detection):
 *   1–5 reps  → strength · 6–12 → hypertrophy · 13+ → endurance.
 * The dominant zone wins if it holds a majority of sets, else "mixed".
 */
function classifyGoal(workout: Workout): SessionGoal {
  let strength = 0;
  let hypertrophy = 0;
  let endurance = 0;
  for (const ex of workout.exercises) {
    for (const s of ex.sets) {
      if (!isWorkingSet(s) || s.reps == null) continue;
      if (s.reps <= 5) strength++;
      else if (s.reps <= 12) hypertrophy++;
      else endurance++;
    }
  }
  const total = strength + hypertrophy + endurance;
  if (total === 0) return "mixed";
  const zones: Array<[SessionGoal, number]> = [
    ["strength", strength],
    ["hypertrophy", hypertrophy],
    ["endurance", endurance],
  ];
  zones.sort((a, b) => b[1] - a[1]);
  const [topGoal, topCount] = zones[0];
  return topCount / total >= 0.5 ? topGoal : "mixed";
}

function summarize(workout: Workout, data: TrainingData): SessionSummary {
  let totalVolume = 0;
  let totalSets = 0;
  const muscleSets = new Map<MuscleGroup, number>();

  for (const ex of workout.exercises) {
    const working = ex.sets.filter(isWorkingSet);
    if (working.length === 0) continue;
    totalSets += working.length;
    totalVolume += working.reduce((s, set) => s + setVolumeKg(set), 0);
    const muscle = data.templates[ex.templateId]?.primaryMuscle;
    if (muscle) muscleSets.set(muscle, (muscleSets.get(muscle) ?? 0) + working.length);
  }

  const durationMs = new Date(workout.endTime).getTime() - new Date(workout.startTime).getTime();
  const topMuscles = [...muscleSets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m]) => m);

  return {
    id: workout.id,
    title: workout.title,
    date: workout.startTime,
    durationMinutes: Math.max(0, Math.round(durationMs / 60000)),
    totalVolumeKg: round(totalVolume, 0),
    totalSets,
    exerciseCount: workout.exercises.filter((ex) => ex.sets.some(isWorkingSet)).length,
    goal: classifyGoal(workout),
    topMuscles,
  };
}

export function buildHistory(data: TrainingData, limit = 60): HistoryDTO {
  const sessions = sortByStart(data.workouts)
    .reverse() // newest first
    .slice(0, limit)
    .map((w) => summarize(w, data));

  return {
    meta: { fetchedAt: data.fetchedAt, workoutCount: data.workouts.length },
    sessions,
  };
}
