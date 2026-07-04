/**
 * Client-side auth shared by every app. Login happens once, at the **hub**; the
 * credential is stored in a cookie scoped to the registrable domain
 * (`.billynorris.co.uk` / `.billynorris.gay`) so every subdomain app can read it
 * without re-entry. Apps never prompt: if the credential is missing or rejected
 * (401), they bounce the user back to the hub to sign in (see `AuthGuard`). One
 * credential is valid everywhere (validated server-side by `@billynorris/api-auth`).
 *
 * The cookie is per registrable domain, so `.co.uk` and `.gay` are independent —
 * consistent with the rest of the platform keeping you on one TLD (and theme).
 */

const STORAGE_KEY = "billynorris.auth"; // cookie name; value = base64("user:pass")
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** Fired by {@link authedFetch} on a 401 so the gate can react (re-login). */
export const UNAUTHORIZED_EVENT = "billynorris:unauthorized";

/** Single-host dev: no hub subdomain to bounce to, no cross-site cookie. */
export function isLocalhost(): boolean {
  return (
    typeof location !== "undefined" &&
    (location.hostname === "localhost" || location.hostname === "127.0.0.1")
  );
}

/**
 * The registrable root domain as seen by the browser ("billynorris.co.uk" or
 * "billynorris.gay"), so cross-app links and the shared auth cookie stay on the
 * same TLD (and therefore keep the pride theme). Falls back to the full host.
 */
export function rootDomain(): string {
  if (typeof location === "undefined") return "";
  const host = location.hostname;
  for (const tld of [".co.uk", ".gay"]) {
    const idx = host.indexOf(`billynorris${tld}`);
    if (idx !== -1) return host.slice(idx);
  }
  return host;
}

/** Cookie `Domain` so every subdomain shares the credential — null on localhost. */
function cookieDomain(): string | null {
  if (isLocalhost()) return null;
  const root = rootDomain();
  return root.includes(".") ? `.${root}` : null;
}

export function getCredential(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${STORAGE_KEY}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length)) || null;
  }
  return null;
}

export function setCredential(username: string, password: string): void {
  writeCookie(btoa(`${username}:${password}`), MAX_AGE_SECONDS);
}

export function clearCredential(): void {
  writeCookie("", 0); // Max-Age=0 expires it immediately
}

function writeCookie(value: string, maxAge: number): void {
  if (typeof document === "undefined") return;
  const domain = cookieDomain();
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${STORAGE_KEY}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax` +
    (domain ? `; Domain=${domain}` : "") +
    secure;
}

/** Absolute URL of the hub (apex) on the current TLD; "/" in single-host dev. */
export function hubUrl(): string {
  if (typeof location === "undefined") return "/";
  if (isLocalhost()) return "/";
  return `${location.protocol}//${rootDomain()}/`;
}

/**
 * Send the user to the hub to sign in, remembering this page so the hub can
 * return them here afterwards. `expired` marks that a stored credential was just
 * rejected, so the hub can say so rather than looking like a fresh visit.
 */
export function redirectToHub(opts: { expired?: boolean } = {}): void {
  if (typeof location === "undefined") return;
  const url = new URL(hubUrl(), location.href);
  url.searchParams.set("return", location.href);
  if (opts.expired) url.searchParams.set("expired", "1");
  location.assign(url.toString());
}

/** `fetch` with the stored Basic credential attached; signals on 401. */
export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const cred = getCredential();
  const headers = new Headers(init.headers);
  if (cred) headers.set("Authorization", `Basic ${cred}`);

  const res = await fetch(input, { ...init, headers });

  if (res.status === 401) {
    clearCredential();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
  }
  return res;
}
