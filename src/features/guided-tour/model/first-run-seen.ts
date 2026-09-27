import { DESTINATION_TOURS } from "./tour-steps";
import { destinationTourStatusKey } from "./tour-storage";

/**
 * localStorage keys that mark every first-visit automatic surface as seen, the single source.
 * Measuring work (motion, dimension, responsive audits) needs them off, so
 * `tests/e2e/first-run-seed.ts` and `?guides=off` share this list, derived from
 * `DESTINATION_TOURS`.
 */
export const FIRST_RUN_SEEN_ENTRIES: readonly (readonly [string, string])[] = [
  // The folder-first guidance sheet; this key alone reads '1'.
  ["vault-open-guide:auto:v1", "1"],
  // The map's multi-step journey.
  ["guided-tour:v1", "done"],
  /*
   * The Library home guide is an automatic first-visit surface too; its own behaviour is
   * pinned by `library-home.spec.ts`.
   */
  ["atlas.library.guide-seen", "on"],
  ...Object.keys(DESTINATION_TOURS).map(
    (id) => [destinationTourStatusKey(id), "done"] as const,
  ),
];

/** Two values; anything else is ignored. */
export type GuideOverride = "off" | "reset";

/**
 * Parses `?guides=`; an unknown value returns `null`, so a typo does not disable guidance.
 */
export function resolveGuideOverride(search: string): GuideOverride | null {
  let value: string | null = null;
  try {
    value = new URLSearchParams(search).get("guides");
  } catch {
    return null;
  }
  return value === "off" || value === "reset" ? value : null;
}

/** Marks every first-visit guide as already seen. */
export function applyFirstRunSeen(): void {
  if (typeof window === "undefined") return;
  for (const [key, value] of FIRST_RUN_SEEN_ENTRIES) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* Private mode: skip. */
    }
  }
}

/**
 * Restores first-visit state for reviewing the guidance itself.
 */
export function clearFirstRunSeen(): void {
  if (typeof window === "undefined") return;
  for (const [key] of FIRST_RUN_SEEN_ENTRIES) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* Private mode: skip. */
    }
  }
}

/**
 * Applies `?guides=` and returns what it did, or `null`. Must run before the guidance surfaces
 * read localStorage, so it lives in `AppShell`'s lazy state initialization; a parent effect
 * is too late.
 */
export function applyGuideOverride(search: string): GuideOverride | null {
  const override = resolveGuideOverride(search);
  if (override === "off") applyFirstRunSeen();
  else if (override === "reset") clearFirstRunSeen();
  return override;
}
