import type { Page } from "@playwright/test";
import { FIRST_RUN_SEEN_ENTRIES } from "../../src/features/guided-tour/model/first-run-seen";

/**
 * Starts a session as "a user who has already seen the first-visit surfaces".
 *
 * Why it is needed: the map and the five destinations (docs, studio, insights,
 * projects, history) automatically raise a scrim-plus-card guide on first visit. That
 * is intended behaviour, but in a spec verifying **a returning user's screen** the
 * overlay swallows clicks and becomes a timeout that only fires on slow runners
 * (measured in CI 2026-07-26: the docs-list expand button was covered by the docs
 * guide, 60 s timeout).
 *
 * `features/guided-tour/model/first-run-seen.ts` is the single source for the key
 * list — it derives directly from `DESTINATION_TOURS`, so adding a guide grows the
 * seed with it. The same list carries the URL entry point (`?guides=off`), so audit
 * tools other than Playwright (chrome-devtools, the app's built-in browser) can reach
 * the same state.
 *
 * Regressions in the guides themselves are verified by `guided-tour.spec.ts` (manual
 * entry) and `responsive-overflow-audit.spec.ts` (overlay exclusivity on automatic
 * entry).
 */
export { FIRST_RUN_SEEN_ENTRIES };

export async function seedFirstRunSeen(page: Page): Promise<void> {
  await page.addInitScript((entries: readonly (readonly [string, string])[]) => {
    for (const [key, value] of entries) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* private mode */
      }
    }
  }, FIRST_RUN_SEEN_ENTRIES);
}
