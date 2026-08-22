import type { Page } from '@playwright/test';

/** Where the first-run card's sample choice is stored — the same key as `src/shared/lib/sample-source.ts`. */
const SAMPLE_SOURCE_KEY = 'demo:sample-source:v1';

/**
 * Declares that this spec must run against the **dogfood sample** (this app's own code
 * map).
 *
 * On 2026-07-26 the default sample changed from dogfood to an example business, and
 * three specs broke at once — all of them pinned dogfood-only data (document titles,
 * project names, `?p=` deep-link slugs) while **quietly relying on that being the
 * default**. A test's subject is not "the default is dogfood" but "this works on
 * dogfood data", so it selects explicitly instead of relying on it.
 *
 * Must be called before `goto` — the app reads this value on first render.
 */
export async function useDogfoodSample(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* Private mode — it falls back to the default and the spec fails on its own */
      }
    },
    [SAMPLE_SOURCE_KEY, 'dogfood'] as const,
  );
}
