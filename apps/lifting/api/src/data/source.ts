import type { ExerciseTemplate, TrainingData } from "@billynorris/lifting-shared";
import type { User } from "@billynorris/config";
import type { Env } from "../env";
import { ProviderClient } from "../provider/client";
import { UserProviderClient } from "../provider/userClient";
import { buildMockTrainingData } from "../provider/mock";
import { getHevySession, hasHevyUserConfig } from "../hevy/tokens";
import { HevyApiError } from "../hevy/userApi";

interface CacheEntry {
  data: TrainingData;
  expiresAt: number;
}

/**
 * In-memory cache, scoped to a warm Lambda container and keyed per user (each
 * user's Hevy data differs). Good enough for a low-traffic app; swap for the
 * DynamoDB store if full-history loads get slow.
 */
const cache = new Map<string, CacheEntry>();

/** The Hevy Pro exercise-template library is global — cache it once, longer. */
let templateCache: { templates: Record<string, ExerciseTemplate>; expiresAt: number } | null = null;

export async function getTrainingData(env: Env, user: User, force = false): Promise<TrainingData> {
  const key = user.id;
  const now = Date.now();
  const cached = cache.get(key);
  if (!force && cached && cached.expiresAt > now) return cached.data;

  const data = await loadFor(env, user);
  cache.set(key, { data, expiresAt: now + env.cacheTtlSeconds * 1000 });
  return data;
}

async function loadFor(env: Env, user: User): Promise<TrainingData> {
  // 1. Per-user consumer ("user") API — mirrors the user's own Hevy app.
  if (hasHevyUserConfig(user, env)) {
    return loadFromUserApi(env, user);
  }
  // 2. Global Pro API key fallback.
  if (env.providerApiKey) {
    return new ProviderClient(env).fetchTrainingData();
  }
  // 3. Nothing configured — deterministic mock data.
  return buildMockTrainingData();
}

async function loadFromUserApi(env: Env, user: User): Promise<TrainingData> {
  const templates = await loadTemplateLibrary(env);

  const fetchWith = async (force: boolean): Promise<TrainingData> => {
    const session = await getHevySession(user, env, { force });
    const client = new UserProviderClient(env.providerBaseUrl, session.accessToken, session.username);
    return client.fetchTrainingData(templates);
  };

  try {
    return await fetchWith(false);
  } catch (err) {
    // A 401 means the cached access token went stale mid-flight: force a
    // refresh and retry once before giving up.
    if (err instanceof HevyApiError && err.status === 401) {
      return fetchWith(true);
    }
    throw err;
  }
}

/** The Pro template library (muscle groups), if a Pro key is configured. */
async function loadTemplateLibrary(env: Env): Promise<Record<string, ExerciseTemplate>> {
  if (!env.providerApiKey) return {};
  const now = Date.now();
  if (templateCache && templateCache.expiresAt > now) return templateCache.templates;

  const templates = await new ProviderClient(env).fetchTemplates();
  templateCache = { templates, expiresAt: now + 24 * 60 * 60 * 1000 };
  return templates;
}

export function clearCache(): void {
  cache.clear();
  templateCache = null;
}
