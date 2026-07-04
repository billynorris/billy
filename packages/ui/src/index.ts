/**
 * Shared design-system helpers for the billynorris platform.
 *
 * The `.gay` domain is the SAME site in a pride skin. The theme is decided
 * purely client-side from the hostname — no server/edge logic. For zero flash,
 * each app's index.html sets `data-theme` in an inline <head> script before
 * paint (see the apps' index.html). {@link applyTheme} is the runtime fallback.
 */
import { isLocalhost, rootDomain } from "./auth";

/** True when the page is being served from a *.gay host. */
export function isPride(): boolean {
  return typeof location !== "undefined" && location.hostname.endsWith(".gay");
}

/** Apply the theme by setting `data-theme` on <html>. Safe to call anytime. */
export function applyTheme(): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = isPride() ? "pride" : "default";
}

/** URL for another app on the platform, preserving the current TLD/theme. */
export function appUrl(app: string): string {
  if (typeof location === "undefined") return `/`;
  if (isLocalhost()) return `/`; // single-host dev; real routing is host-based in prod
  return `${location.protocol}//${app}.${rootDomain()}`;
}

export { PrideRibbon } from "./PrideRibbon";
export { LoginGate } from "./LoginGate";
export { AuthGuard } from "./AuthGuard";
export * from "./auth";
