/**
 * Low-level client for Hevy's **consumer ("user") API** — the one backing the
 * Hevy app, authenticated with a per-user bearer token (not the Pro API key).
 * Only the calls this app needs: refresh the access token, read the account, and
 * page the user's workouts. Modelled on the LiftShift reference implementation.
 *
 * We deliberately do NOT implement `/login` here: it requires solving a
 * reCAPTCHA (headless browser), impractical in this lightweight Lambda. Instead
 * we seed a long-lived `refresh_token` (see `@billynorris/config` HevyConfig) and
 * refresh from it.
 */

/** Shared web-app API key Hevy expects on the consumer API (not a secret). */
const X_API_KEY = "klean_kanteen_insulated";

/** Headers mimicking the Hevy web client. */
function headers(accessToken?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": X_API_KEY,
    Origin: "https://www.hevy.com",
    Referer: "https://www.hevy.com/",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Hevy-Platform": "web",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };
  if (accessToken) h.Authorization = `Bearer ${accessToken}`;
  return h;
}

export interface HevyAuthTokens {
  /** Bearer access token used for subsequent requests. */
  accessToken: string;
  /** Rotated refresh token — persist it, the old one may stop working. */
  refreshToken: string;
  /** When the access token expires, if Hevy told us (epoch ms). */
  expiresAtMs: number | undefined;
  userId: string | undefined;
}

interface RawAuthResponse {
  auth_token?: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: string | number;
  user_id?: string;
}

export interface HevyAccount {
  id: string;
  username: string;
  email?: string;
  full_name?: string;
}

/** A raw workout from `/user_workouts_paged` (consumer API shape). */
export interface HevyUserWorkout {
  id: string;
  name?: string;
  description?: string;
  start_time?: number; // epoch seconds
  end_time?: number; // epoch seconds
  exercises?: HevyUserExercise[];
}

export interface HevyUserExercise {
  id?: string;
  index?: number;
  title?: string;
  notes?: string;
  superset_id?: string | number | null;
  sets?: HevyUserSet[];
}

export interface HevyUserSet {
  index?: number;
  indicator?: string; // "normal" | "warmup" | "dropset" | "failure"
  weight_kg?: number | null;
  reps?: number | null;
  rpe?: number | null;
  distance_meters?: number | string | null;
  duration_seconds?: number | string | null;
}

export class HevyApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "HevyApiError";
  }
}

function url(baseUrl: string, path: string): string {
  return path.startsWith("/") ? `${baseUrl}${path}` : `${baseUrl}/${path}`;
}

async function fail(res: Response): Promise<never> {
  let body = `${res.status} ${res.statusText}`;
  try {
    body = (await res.text()) || body;
  } catch {
    /* ignore */
  }
  throw new HevyApiError(body, res.status);
}

function parseExpiry(raw: string | number | undefined): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number") return raw > 1e12 ? raw : raw * 1000; // s or ms
  const n = Number(raw);
  if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? undefined : ms;
}

function toTokens(data: RawAuthResponse): HevyAuthTokens {
  const accessToken = data.access_token ?? data.auth_token;
  if (!accessToken) throw new HevyApiError("Hevy auth response had no access token", 502);
  return {
    accessToken,
    refreshToken: data.refresh_token ?? "",
    expiresAtMs: parseExpiry(data.expires_at),
    userId: data.user_id,
  };
}

/** Exchange a refresh token for a fresh access token (and rotated refresh token). */
export async function refreshTokens(
  baseUrl: string,
  refreshToken: string,
  accessToken?: string,
): Promise<HevyAuthTokens> {
  const trimmed = refreshToken.trim();
  if (!trimmed) throw new HevyApiError("Missing Hevy refresh token", 400);

  const res = await fetch(url(baseUrl, "/auth/refresh_token"), {
    method: "POST",
    headers: headers(accessToken),
    body: JSON.stringify({ refresh_token: trimmed }),
  });
  if (!res.ok) return fail(res);
  return toTokens((await res.json()) as RawAuthResponse);
}

export async function getAccount(baseUrl: string, accessToken: string): Promise<HevyAccount> {
  const res = await fetch(url(baseUrl, "/user/account"), { headers: headers(accessToken) });
  if (!res.ok) return fail(res);
  return (await res.json()) as HevyAccount;
}

/** One page (≈5 workouts) of the user's history at `offset`. */
export async function getWorkoutsPage(
  baseUrl: string,
  accessToken: string,
  username: string,
  offset: number,
): Promise<HevyUserWorkout[]> {
  const params = new URLSearchParams({ username, offset: String(offset) });
  const res = await fetch(url(baseUrl, `/user_workouts_paged?${params.toString()}`), {
    headers: headers(accessToken),
  });
  if (!res.ok) return fail(res);
  const data = (await res.json()) as { workouts?: HevyUserWorkout[] };
  return data.workouts ?? [];
}
