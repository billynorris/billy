import type { ExerciseTemplate, TrainingData, Workout } from "@billynorris/lifting-shared";
import type { Env } from "../env";
import { normalizeTemplate, normalizeWorkout } from "./normalize";
import type { RawTemplatesPage, RawWorkoutsPage } from "./raw";

/**
 * Thin client for Hevy. The personal access token is sent as a Bearer token
 * alongside the mobile-app headers Hevy expects, and is sourced from
 * server-side config only — it never reaches the browser.
 */
export class ProviderClient {
  constructor(private readonly env: Env) {
    if (!env.providerApiKey) {
      throw new Error("ProviderClient requires an API key");
    }
  }

  async get<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const url = new URL(`${this.env.providerBaseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.env.providerApiKey!}`,
        accept: "application/json, text/plain, */*",
        "accept-language": "en-GB,en;q=0.9",
        "hevy-app-build": "1991020",
        "hevy-app-version": "3.0.7",
        "hevy-platform": "ios 26.3.1",
        "user-agent": "Hevy/1991020 CFNetwork/3860.400.51 Darwin/25.3.0",
        "x-api-key": "klean_kanteen_insulated",
      },
    });
    if (!res.ok) {
      throw new Error(`Upstream ${path} failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  /** Fetch every page of a paginated collection, gently sequential. */
  private async getAllPages<T>(path: string, pageSize: number, pageCount: (page: T) => number): Promise<T[]> {
    const first = await this.get<T>(path, { page: 1, pageSize });
    const pages = [first];
    const total = pageCount(first);
    for (let p = 2; p <= total; p++) {
      pages.push(await this.get<T>(path, { page: p, pageSize }));
    }
    return pages;
  }

  async fetchWorkouts(): Promise<Workout[]> {
    const pages = await this.getAllPages<RawWorkoutsPage>("/v1/workouts", 10, (p) => p.page_count);
    return pages.flatMap((page) => page.workouts.map(normalizeWorkout));
  }

  async fetchTemplates(): Promise<Record<string, ExerciseTemplate>> {
    const pages = await this.getAllPages<RawTemplatesPage>(
      "/v1/exercise_templates",
      100,
      (p) => p.page_count,
    );
    const map: Record<string, ExerciseTemplate> = {};
    for (const page of pages) {
      for (const raw of page.exercise_templates) {
        const t = normalizeTemplate(raw);
        map[t.id] = t;
      }
    }
    return map;
  }

  async fetchTrainingData(): Promise<TrainingData> {
    const [workouts, templates] = await Promise.all([this.fetchWorkouts(), this.fetchTemplates()]);
    return { workouts, templates, fetchedAt: new Date().toISOString() };
  }
}
