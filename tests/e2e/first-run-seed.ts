import type { Page } from "@playwright/test";
import { FIRST_RUN_SEEN_ENTRIES } from "../../src/shared/lib/preferences/first-run-seen";

/**
 * First-visit surfaces raise a scrim that swallows clicks in specs of a returning user.
 * The keys come from `first-run-seen.ts`, which lists the remaining folder and Library first-visit surfaces.
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
