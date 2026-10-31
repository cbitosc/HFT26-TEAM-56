/**
 * Scroll timing for the How it works journey, shared by the component and
 * the WebGL scene. Kept free of three.js so the page can use it before the
 * scene loads.
 */

/** Matches the sticky navbar height (h-14). */
export const STICKY_TOP = 56;
/** Pinned scroll distance, in svh, for the whole journey. */
export const JOURNEY_SCROLL = 380;
/** Index of the last shape (the score ring). */
export const LAST = 4;
/** Morph progress at the moment the stage pins: the knot is still intact, so
 * it unravels while the viewer watches. */
const PIN_START = 0.3;
/** Extra pinned scroll, as a share of the journey, that holds the final ring. */
const HOLD = 0.12;

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

/** Morph progress (0–LAST) for the approach (0–1) and pinned scroll (0–1). */
export function progressFor(intro: number, pinned: number) {
  if (intro < 1) return PIN_START * intro * intro;
  return Math.min(PIN_START + pinned * (LAST - PIN_START) * (1 + HOLD), LAST);
}

/** Pinned scroll progress at which step `index` (0–3) is fully formed. */
export function pinnedForStep(index: number) {
  const p = index + 1.1;
  return clamp01((p - PIN_START) / ((LAST - PIN_START) * (1 + HOLD)));
}

/** The step (−1 before the first scene, then 0–3) shown at morph progress `p`. */
export function stepFor(p: number) {
  if (p < 0.75) return -1;
  return Math.min(Math.max(Math.floor(p + 0.3) - 1, 0), 3);
}
