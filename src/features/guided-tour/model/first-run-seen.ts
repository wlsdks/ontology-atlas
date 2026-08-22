import { DESTINATION_TOURS } from "./tour-steps";
import { destinationTourStatusKey } from "./tour-storage";

/**
 * The localStorage state for "a user who has already seen the first-visit
 * automatic surfaces" — **the single source.**
 *
 * The map and the five destinations (docs, workshop, insights, projects, history)
 * automatically raise a scrim-plus-card overlay on a first visit. That is intended,
 * but for work that **measures** the screen (motion frame measurement, dimension
 * audits, responsive sweeps) that overlay covers the subject or swallows clicks and
 * makes the audit itself impossible.
 *
 * Writing the key list by hand would rot silently as destinations are added, so it
 * is derived directly from `DESTINATION_TOURS` — adding a guide grows this list too.
 *
 * **Why it must be reachable outside Playwright** (2026-07-28). This list used to
 * live inside `tests/e2e/first-run-seed.ts` and was usable only through
 * `page.addInitScript`. So audit tools that are not Playwright (chrome-devtools
 * MCP, the app's built-in browser, a hand-opened session) had to **close the
 * guidance by hand every time** before measuring. Closing itself changes the
 * screen, so for a motion audit measuring "the first frame" that approach does not
 * work at all.
 *
 * So the same list gets a URL entry point — `?guides=off`. Not a new mechanism but
 * a second door onto the same keys and the same values, and with one list there is
 * no drift.
 */
export const FIRST_RUN_SEEN_ENTRIES: readonly (readonly [string, string])[] = [
  // The folder-first guidance sheet — this key alone reads '1'.
  ["vault-open-guide:auto:v1", "1"],
  // The map's multi-step journey.
  ["guided-tour:v1", "done"],
  ...Object.keys(DESTINATION_TOURS).map(
    (id) => [destinationTourStatusKey(id), "done"] as const,
  ),
];

/** The URL switch for audit sessions. There are only two values; anything else is ignored. */
export type GuideOverride = "off" | "reset";

/**
 * Parses `?guides=` — a pure function. An unknown value returns `null`, so a typo
 * does not quietly disable the guidance.
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
      /* private mode — skip */
    }
  }
}

/**
 * Restores the first-visit state — used when reviewing the guidance **itself**.
 * With only a door to turn it off and none to turn it back on, an auditor who
 * disabled it once could never see it again.
 */
export function clearFirstRunSeen(): void {
  if (typeof window === "undefined") return;
  for (const [key] of FIRST_RUN_SEEN_ENTRIES) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* private mode — skip */
    }
  }
}

/**
 * Reads and applies `?guides=`. The return value is what it actually did — `null`
 * when it did nothing.
 *
 * **The call site is the contract**: the guidance surfaces read localStorage in
 * their own effect/state initialization, so this function must run **before** those
 * children render. `AppShell`'s lazy state initialization is that place (the order
 * is parent render > child render > child effect, so a parent effect is already too late).
 */
export function applyGuideOverride(search: string): GuideOverride | null {
  const override = resolveGuideOverride(search);
  if (override === "off") applyFirstRunSeen();
  else if (override === "reset") clearFirstRunSeen();
  return override;
}
