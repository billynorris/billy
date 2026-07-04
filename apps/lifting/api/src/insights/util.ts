import type { Workout, WorkoutSet } from "@billynorris/lifting-shared";

/** Epley estimated 1RM. Returns the raw weight for a single rep. */
export function epley1rm(weightKg: number, reps: number): number {
  if (reps <= 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** Brzycki estimated 1RM — used as a cross-check. */
export function brzycki1rm(weightKg: number, reps: number): number {
  if (reps <= 1) return weightKg;
  if (reps >= 37) return weightKg; // formula breaks down
  return weightKg * (36 / (37 - reps));
}

export function isWorkingSet(set: WorkoutSet): boolean {
  return set.type !== "warmup" && (set.reps ?? 0) > 0;
}

export function setVolumeKg(set: WorkoutSet): number {
  if (set.weightKg == null || set.reps == null) return 0;
  return set.weightKg * set.reps;
}

/** Best estimated 1RM across the working sets of one exercise instance. */
export function bestE1rm(sets: WorkoutSet[]): number {
  let best = 0;
  for (const s of sets) {
    if (!isWorkingSet(s) || s.weightKg == null || s.reps == null) continue;
    best = Math.max(best, epley1rm(s.weightKg, s.reps));
  }
  return best;
}

/** Monday 00:00 (local) of the week containing `iso`, as an ISO date string. */
export function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.toISOString();
}

export function daysBetween(aIso: string, bIso: string): number {
  const ms = new Date(bIso).getTime() - new Date(aIso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function sortByStart(workouts: Workout[]): Workout[] {
  return [...workouts].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
}

export function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
