/**
 * Runtime configuration. The upstream API key is read from the environment
 * (injected at deploy time) and never leaves the server. The same is true for
 * the optional Anthropic key powering the AI coaching card.
 */
export interface Env {
  /** Global Hevy Pro API key — fallback when a user has no `config.hevy`. */
  providerApiKey: string | undefined;
  providerBaseUrl: string;
  /** DynamoDB table holding per-user Hevy tokens (single-table). */
  hevyTable: string | undefined;
  cacheTtlSeconds: number;
  /** Optional — enables the Claude-powered coaching analysis. */
  anthropicApiKey: string | undefined;
  anthropicModel: string;
}

export function loadEnv(): Env {
  return {
    providerApiKey: process.env.HEVY_API_KEY?.trim() || undefined,
    providerBaseUrl: process.env.HEVY_BASE_URL?.trim() || "https://api.hevyapp.com",
    hevyTable: process.env.HEVY_TABLE?.trim() || undefined,
    cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS ?? 3600),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || undefined,
    anthropicModel: process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-4-8",
  };
}
