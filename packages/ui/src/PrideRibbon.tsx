import { isPride } from "./index";

/**
 * A rainbow accent bar. Renders only on the pride (.gay) skin, so the same
 * component is safe to drop into every app unconditionally.
 */
export function PrideRibbon() {
  if (!isPride()) return null;
  return <div className="pride-ribbon" aria-hidden="true" />;
}
