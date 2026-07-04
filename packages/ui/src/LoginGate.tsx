import { useEffect, useState, type ReactNode } from "react";
import { getCredential, setCredential, rootDomain } from "./auth";

/**
 * The platform's single sign-in point, rendered by the **hub**. Shows a
 * username/password form until a credential is stored, then renders the hub.
 *
 * Apps send unauthenticated users here with a `?return=<their-url>` param (and
 * `?expired=1` if a credential was just rejected); on success we bounce straight
 * back to that app. Username defaults to "billy".
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(() => !!getCredential());
  const [username, setUsername] = useState("billy");
  const [password, setPassword] = useState("");

  const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : null;
  const expired = params?.get("expired") === "1";

  // If we're already signed in but an app sent us here to sign in, go back.
  useEffect(() => {
    if (authed) {
      const target = returnTarget();
      if (target) location.assign(target);
    }
  }, [authed]);

  if (authed && !returnTarget()) return <>{children}</>;

  return (
    <div className="login-wrap">
      <form
        className="card login-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!password) return;
          setCredential(username.trim(), password);
          setPassword("");
          const target = returnTarget();
          if (target) location.assign(target);
          else setAuthed(true);
        }}
      >
        <h1>Sign in</h1>
        {expired && (
          <p className="login-note">Your session expired — please sign in again.</p>
        )}
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
          />
        </label>
        <button className="btn" type="submit">
          Continue
        </button>
      </form>
    </div>
  );
}

/** The `?return=` URL, but only if it's same-site (guards against open redirects). */
function returnTarget(): string | null {
  if (typeof location === "undefined") return null;
  const raw = new URLSearchParams(location.search).get("return");
  if (!raw) return null;
  try {
    const url = new URL(raw, location.href);
    const root = rootDomain();
    if (url.hostname === root || url.hostname.endsWith(`.${root}`)) return url.toString();
  } catch {
    /* malformed return param — ignore */
  }
  return null;
}
