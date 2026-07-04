import type { MuscleGroup } from "@billynorris/lifting-shared";

/** "upper_back" → "Upper Back". Used in human-readable coaching notes. */
export function muscleLabel(m: MuscleGroup): string {
  return m
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}
