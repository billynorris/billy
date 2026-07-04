/**
 * Adapts Hevy's consumer ("user") API into the app's normalized `TrainingData`.
 * Unlike the Pro API, user-API workouts identify exercises only by **title** (no
 * template id, no muscle groups), so we join them by normalized title to a
 * template library (sourced from the Pro key when available). Titles with no
 * match get a synthesized "other"-muscle template so the insight engine still
 * has an entry to key off.
 */
import type {
  ExerciseTemplate,
  SetType,
  TrainingData,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from "@billynorris/lifting-shared";
import {
  getWorkoutsPage,
  type HevyUserExercise,
  type HevyUserSet,
  type HevyUserWorkout,
} from "../hevy/userApi";

/** Hevy returns ~5 workouts per offset step. */
const PAGE_STEP = 5;
const MAX_PAGES = 500;

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function toSetType(indicator: string | undefined): SetType {
  return indicator === "warmup" || indicator === "dropset" || indicator === "failure"
    ? indicator
    : "normal";
}

function toNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function isoFromEpochSeconds(s: number | undefined): string {
  return s && Number.isFinite(s) ? new Date(s * 1000).toISOString() : "";
}

export class UserProviderClient {
  constructor(
    private readonly baseUrl: string,
    private readonly accessToken: string,
    private readonly username: string,
  ) {}

  private async fetchAllWorkouts(): Promise<HevyUserWorkout[]> {
    const all: HevyUserWorkout[] = [];
    let offset = 0;
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await getWorkoutsPage(this.baseUrl, this.accessToken, this.username, offset);
      if (page.length === 0) break;
      all.push(...page);
      offset += page.length;
      if (page.length < PAGE_STEP) break;
    }
    return all;
  }

  async fetchTrainingData(
    baseTemplates: Record<string, ExerciseTemplate>,
  ): Promise<TrainingData> {
    const raw = await this.fetchAllWorkouts();

    // Index the Pro template library by normalized title for the join.
    const byTitle = new Map<string, ExerciseTemplate>();
    for (const t of Object.values(baseTemplates)) byTitle.set(normalizeTitle(t.name), t);

    const templates: Record<string, ExerciseTemplate> = { ...baseTemplates };

    const resolveTemplate = (title: string): string => {
      const key = normalizeTitle(title);
      const matched = byTitle.get(key);
      if (matched) return matched.id;
      const id = `custom:${key || "unknown"}`;
      if (!templates[id]) {
        templates[id] = {
          id,
          name: title || "Unknown",
          kind: "other",
          primaryMuscle: "other",
          secondaryMuscles: [],
          isCustom: true,
        };
        byTitle.set(key, templates[id]);
      }
      return id;
    };

    const workouts: Workout[] = raw.map((w) => mapWorkout(w, resolveTemplate));
    return { workouts, templates, fetchedAt: new Date().toISOString() };
  }
}

function mapSet(raw: HevyUserSet, index: number): WorkoutSet {
  const distance = toNum(raw.distance_meters);
  return {
    index: raw.index ?? index,
    type: toSetType(raw.indicator),
    weightKg: toNum(raw.weight_kg),
    reps: toNum(raw.reps),
    rpe: toNum(raw.rpe),
    distanceMeters: distance,
    durationSeconds: toNum(raw.duration_seconds),
  };
}

function mapExercise(
  raw: HevyUserExercise,
  index: number,
  resolveTemplate: (title: string) => string,
): WorkoutExercise {
  const name = (raw.title ?? "").trim();
  return {
    index: raw.index ?? index,
    templateId: resolveTemplate(name),
    name,
    notes: raw.notes ?? "",
    sets: (raw.sets ?? []).map(mapSet),
  };
}

function mapWorkout(raw: HevyUserWorkout, resolveTemplate: (title: string) => string): Workout {
  return {
    id: raw.id,
    title: raw.name ?? "Workout",
    startTime: isoFromEpochSeconds(raw.start_time),
    endTime: isoFromEpochSeconds(raw.end_time),
    exercises: (raw.exercises ?? []).map((ex, i) => mapExercise(ex, i, resolveTemplate)),
  };
}
