import type {
  ExerciseKind,
  ExerciseTemplate,
  MuscleGroup,
  SetType,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from "@billynorris/lifting-shared";
import type { RawExerciseTemplate, RawSet, RawWorkout } from "./raw";

const MUSCLE_MAP: Record<string, MuscleGroup> = {
  chest: "chest",
  shoulders: "shoulders",
  biceps: "biceps",
  triceps: "triceps",
  forearms: "forearms",
  lats: "lats",
  upper_back: "upper_back",
  lower_back: "lower_back",
  trapezius: "traps",
  traps: "traps",
  abdominals: "abdominals",
  abs: "abdominals",
  quadriceps: "quadriceps",
  hamstrings: "hamstrings",
  glutes: "glutes",
  calves: "calves",
  abductors: "abductors",
  adductors: "adductors",
  neck: "neck",
  cardio: "cardio",
  full_body: "full_body",
};

const KIND_MAP: Record<string, ExerciseKind> = {
  weight_reps: "weight_reps",
  bodyweight_reps: "bodyweight_reps",
  weighted_bodyweight: "weighted_bodyweight",
  assisted_bodyweight: "assisted_bodyweight",
  reps_only: "reps_only",
  duration: "duration",
  distance_duration: "distance_duration",
  weight_distance: "weight_distance",
};

function toMuscle(raw: string | null | undefined): MuscleGroup {
  if (!raw) return "other";
  return MUSCLE_MAP[raw.toLowerCase()] ?? "other";
}

function toSetType(raw: string): SetType {
  if (raw === "warmup" || raw === "dropset" || raw === "failure") return raw;
  return "normal";
}

export function normalizeTemplate(raw: RawExerciseTemplate): ExerciseTemplate {
  return {
    id: raw.id,
    name: raw.title,
    kind: KIND_MAP[raw.type] ?? "other",
    primaryMuscle: toMuscle(raw.primary_muscle_group),
    secondaryMuscles: (raw.secondary_muscle_groups ?? []).map(toMuscle),
    isCustom: raw.is_custom,
  };
}

function normalizeSet(raw: RawSet): WorkoutSet {
  return {
    index: raw.index,
    type: toSetType(raw.type),
    weightKg: raw.weight_kg,
    reps: raw.reps,
    rpe: raw.rpe,
    distanceMeters: raw.distance_meters,
    durationSeconds: raw.duration_seconds,
  };
}

function normalizeExercise(raw: RawWorkout["exercises"][number]): WorkoutExercise {
  return {
    index: raw.index,
    templateId: raw.exercise_template_id,
    name: raw.title,
    notes: raw.notes ?? "",
    sets: raw.sets.map(normalizeSet),
  };
}

export function normalizeWorkout(raw: RawWorkout): Workout {
  return {
    id: raw.id,
    title: raw.title,
    startTime: raw.start_time,
    endTime: raw.end_time,
    exercises: raw.exercises.map(normalizeExercise),
  };
}
