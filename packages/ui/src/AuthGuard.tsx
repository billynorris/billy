import { useEffect, useState, type ReactNode } from "react";
import { getCredential, isLocalhost, redirectToHub, UNAUTHORIZED_EVENT } from "./auth";
import { LoginGate } from "./LoginGate";

/**
 * Gate for the subdomain apps. Sign-in lives at the hub, so an app never
 * prompts: if there's no shared credential we send the user to the hub
 * (remembering this page to return to), and a 401 from any API call does the
 * same (marked as expired). On localhost there's no hub subdomain to bounce to,
 * so we fall back to a local {@link LoginGate} for standalone dev.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(() => !!getCredential());

  useEffect(() => {
    if (!authed && !isLocalhost()) redirectToHub();
  }, [authed]);

  useEffect(() => {
    const onUnauthorized = () => {
      if (isLocalhost()) setAuthed(false);
      else redirectToHub({ expired: true });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (authed) return <>{children}</>;
  if (isLocalhost()) return <LoginGate>{children}</LoginGate>;
  return (
    <div className="login-wrap">
      <p className="login-note">Redirecting to sign in…</p>
    </div>
  );
}
