import type { MiddlewareHandler } from "hono";
import { findUser, type User } from "@billynorris/config";

/**
 * Shared, deliberately-weak auth for all billynorris services: standard HTTP
 * Basic (`Authorization: Basic base64(user:pass)`), validated against the
 * in-repo users config ([[@billynorris/config]]). Every app's Lambda uses the
 * same middleware, so one credential works platform-wide. Pair with
 * `authedFetch` / `AuthGuard` from `@billynorris/ui` on the frontend (sign-in is
 * centralised at the hub's `LoginGate`).
 */

/** Make the authenticated user available to handlers via `c.get("user")`. */
export type AuthVariables = { user: User };

/** Constant-time-ish string compare (the secret is weak, but avoid early-exit). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function verifyBasic(authorization: string | undefined): User | undefined {
  const match = /^Basic\s+(.+)$/i.exec(authorization ?? "");
  if (!match) return undefined;

  let decoded: string;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return undefined;
  }

  const sep = decoded.indexOf(":");
  if (sep === -1) return undefined;
  const username = decoded.slice(0, sep);
  const password = decoded.slice(sep + 1);

  const user = findUser(username);
  if (!user || !safeEqual(password, user.password)) return undefined;
  return user;
}

/**
 * Hono middleware enforcing Basic auth. Mount it after any routes you want left
 * open (health, OAuth callbacks that arrive as top-level navigations):
 *
 *   app.get("/api/x/health", ...)      // open
 *   app.use("/api/x/*", basicAuth())   // everything below is protected
 *   app.get("/api/x/data", ...)        // c.get("user") is the logged-in User
 *
 * We intentionally do NOT send `WWW-Authenticate`, so the browser's native
 * Basic-auth dialog never appears — the hub's LoginGate handles login (apps
 * bounce there via AuthGuard on a 401).
 */
export function basicAuth(): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const user = verifyBasic(c.req.header("authorization"));
    if (!user) {
      return c.json({ error: "unauthorized" }, 401);
    }
    c.set("user", user);
    await next();
    return;
  };
}
