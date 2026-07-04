/**
 * Raw upstream API shapes. These mirror Hevy's JSON and are confined to this
 * module — nothing outside provider/ should import them.
 */

export interface RawSet {
  index: number;
  type: string; // "normal" | "warmup" | "dropset" | "failure"
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
}

export interface RawExercise {
  index: number;
  title: string;
  notes: string | null;
  exercise_template_id: string;
  superset_id: number | null;
  sets: RawSet[];
}

export interface RawWorkout {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  updated_at: string;
  created_at: string;
  exercises: RawExercise[];
}

export interface RawWorkoutsPage {
  page: number;
  page_count: number;
  workouts: RawWorkout[];
}

export interface RawExerciseTemplate {
  id: string;
  title: string;
  type: string;
  primary_muscle_group: string;
  secondary_muscle_groups: string[];
  is_custom: boolean;
}

export interface RawTemplatesPage {
  page: number;
  page_count: number;
  exercise_templates: RawExerciseTemplate[];
}
