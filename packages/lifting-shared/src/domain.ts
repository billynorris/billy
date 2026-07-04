/**
 * Normalized, source-agnostic training domain model.
 * The frontend and insight engine only ever see these types — never the
 * upstream provider's raw shapes.
 */

export type MuscleGroup =
  | "chest"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "forearms"
  | "lats"
  | "upper_back"
  | "lower_back"
  | "traps"
  | "abdominals"
  | "quadriceps"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "abductors"
  | "adductors"
  | "neck"
  | "cardio"
  | "full_body"
  | "other";

export type ExerciseKind =
  | "weight_reps"
  | "bodyweight_reps"
  | "weighted_bodyweight"
  | "assisted_bodyweight"
  | "reps_only"
  | "duration"
  | "distance_duration"
  | "weight_distance"
  | "other";

export interface ExerciseTemplate {
  id: string;
  name: string;
  kind: ExerciseKind;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  isCustom: boolean;
}

export type SetType = "normal" | "warmup" | "dropset" | "failure";

export interface WorkoutSet {
  index: number;
  type: SetType;
  /** Weight in kilograms (canonical storage unit). Null for non-weighted sets. */
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
}

export interface WorkoutExercise {
  index: number;
  templateId: string;
  name: string;
  notes: string;
  sets: WorkoutSet[];
}

export interface Workout {
  id: string;
  title: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  exercises: WorkoutExercise[];
}

/** The full normalized dataset the insight engine operates over. */
export interface TrainingData {
  workouts: Workout[];
  templates: Record<string, ExerciseTemplate>;
  /** When this dataset was assembled, for cache/staleness display. */
  fetchedAt: string;
}

export type WeightUnit = "kg" | "lb";
