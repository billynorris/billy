/**
 * Per-user Hevy token manager. Bridges the read-only seed (`config.hevy` in the
 * users registry) and the rotating live tokens persisted in DynamoDB:
 *
 *   1. load the user's live tokens from DynamoDB (seeded from config on first use),
 *   2. hand back the access token if it's still fresh,
 *   3. otherwise refresh from the refresh token, persist the rotated pair, and
 *      resolve the username (via /user/account) if we don't have it yet.
 *
 * Returns the access token + Hevy username the workouts endpoint needs.
 */
import type { User } from "@billynorris/config";
import type { Env } from "../env";
import { getAccount, refreshTokens, HevyApiError } from "./userApi";
import { getAuthRecord, putAuthRecord, type HevyAuthRecord } from "./store";

/** Refresh this far before the token actually expires. */
const EXPIRY_BUFFER_MS = 60_000;

export class HevyNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HevyNotConfiguredError";
  }
}

export interface HevySession {
  accessToken: string;
  username: string;
}

/** True if this user can use the consumer ("user") API at all. */
export function hasHevyUserConfig(user: User, env: Env): boolean {
  return Boolean(env.hevyTable && user.config?.hevy?.refreshToken);
}

export async function getHevySession(
  user: User,
  env: Env,
  opts: { force?: boolean } = {},
): Promise<HevySession> {
  const table = env.hevyTable;
  const seed = user.config?.hevy;
  if (!table) throw new HevyNotConfiguredError("HEVY_TABLE is not configured");
  if (!seed?.refreshToken) throw new HevyNotConfiguredError("User has no config.hevy.refreshToken");

  const record = await getAuthRecord(table, user.id);
  const refreshToken = record?.refreshToken || seed.refreshToken;
  let username = record?.username || seed.username;

  const fresh =
    record?.accessToken &&
    record.expiresAtMs &&
    Date.now() < record.expiresAtMs - EXPIRY_BUFFER_MS;

  if (!opts.force && fresh && username) {
    return { accessToken: record!.accessToken, username };
  }

  // Refresh (rotates the refresh token) and persist the new pair.
  const tokens = await refreshTokens(env.providerBaseUrl, refreshToken, record?.accessToken);

  if (!username) {
    const account = await getAccount(env.providerBaseUrl, tokens.accessToken);
    username = account.username;
  }
  if (!username) {
    throw new HevyApiError("Could not resolve Hevy username for user", 502);
  }

  const next: HevyAuthRecord = {
    accessToken: tokens.accessToken,
    // Hevy may not return a new refresh token; keep the working one if so.
    refreshToken: tokens.refreshToken || refreshToken,
    expiresAtMs: tokens.expiresAtMs,
    username,
    hevyUserId: tokens.userId ?? record?.hevyUserId ?? seed.userId,
    updatedAt: new Date().toISOString(),
  };
  await putAuthRecord(table, user.id, next);

  return { accessToken: tokens.accessToken, username };
}
