import usersJson from "../users.json";

/**
 * The "users" concept: a hardcoded, in-repo registry of who can use the
 * platform and their per-user config ("all things related to this user").
 * Initially a single default user (Billy). The auth system
 * ([[@billynorris/api-auth]]) validates HTTP Basic credentials against this, and
 * services read per-user service config (e.g. ThirdSpace creds) from it.
 */

/** Per-user ThirdSpace credentials/preferences. */
export interface ThirdSpaceConfig {
  /** Pre-built x-fisikal-token, or supply id + sig instead. */
  token?: string;
  id?: string;
  sig?: string;
  /** Optional allow-list narrowing which clubs are ever queried; empty = all. */
  clubIds?: number[];
  /** The club pre-selected in the UI's filter. */
  defaultClubId?: number;
}

/**
 * Per-user Hevy (consumer "user API") credentials. This is the seed only: a
 * long-lived `refreshToken` captured once. Rotated access/refresh tokens are
 * persisted at runtime in DynamoDB (users.json is bundled read-only), so once
 * seeded this file is no longer the source of truth for the live tokens.
 *
 * Distinct from the global Hevy **Pro API key** (env `HEVY_API_KEY`), which the
 * lifting app falls back to when a user has no `hevy` config.
 */
export interface HevyConfig {
  /** Long-lived Hevy refresh token (seed). Rotated copies live in DynamoDB. */
  refreshToken?: string;
  /** Hevy username — required by the user API's `/user_workouts_paged`. */
  username?: string;
  /** Hevy numeric/string user id, if known (otherwise resolved via /user/account). */
  userId?: string;
}

/**
 * Per-user lifting (Lift Coach) access. A coach is just a user whose
 * `viewUserId` points at the person they coach: the lifting app then serves
 * that person's (read-only) data instead of the coach's own.
 */
export interface LiftingConfig {
  /** If set, this user views another user's lifting data (read-only). */
  viewUserId?: string;
}

export interface UserConfig {
  thirdspace?: ThirdSpaceConfig;
  hevy?: HevyConfig;
  lifting?: LiftingConfig;
  [key: string]: unknown;
}

export interface User {
  id: string;
  username: string;
  password: string;
  displayName?: string;
  config?: UserConfig;
}

export interface UsersConfig {
  users: User[];
}

export const usersConfig: UsersConfig = usersJson as UsersConfig;

export function findUser(username: string): User | undefined {
  return usersConfig.users.find((u) => u.username === username);
}

export function findUserById(id: string): User | undefined {
  return usersConfig.users.find((u) => u.id === id);
}

export function getThirdspaceConfig(userId: string): ThirdSpaceConfig | undefined {
  return findUserById(userId)?.config?.thirdspace;
}

export function getHevyConfig(userId: string): HevyConfig | undefined {
  return findUserById(userId)?.config?.hevy;
}

/**
 * The user whose lifting data should be served to `viewer`: the person they
 * coach (when `config.lifting.viewUserId` resolves), otherwise themselves.
 * `viewing` is true in the coach case.
 */
export function resolveLiftingSubject(viewer: User): { subject: User; viewing: boolean } {
  const viewUserId = viewer.config?.lifting?.viewUserId;
  if (viewUserId) {
    const subject = findUserById(viewUserId);
    if (subject && subject.id !== viewer.id) return { subject, viewing: true };
  }
  return { subject: viewer, viewing: false };
}
