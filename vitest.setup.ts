import { configure } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

import { clearArrivalMemory } from './src/shared/lib/route-arrival-memory-store';

/**
 * One condition-wait ceiling for the whole suite, instead of a millisecond number
 * per call site.
 *
 * `waitFor` and `findBy*` poll until the condition holds; the ceiling only decides
 * how long a *failure* takes to report. Testing Library's default is 1,000 ms, so
 * every test that legitimately needed longer had been raising it by hand — eight
 * call sites at 1,500-2,000 ms as of 2026-09-12. Those hand-raised numbers are what
 * starved on 2026-08-28, when eleven parallel pre-push lanes shared one machine and
 * two ordinary React state-transition tests missed their own ceiling. The hook's
 * answer then was to cap Vitest at two workers, which cost the unit lane 377.7 s
 * against 124.3 s at the normal pool (measured 2026-09-12).
 *
 * The ceiling is generous on purpose: it is not a budget, and nothing is asserted
 * about it. A test that needs a *product* timing budget measures it and says so,
 * with headroom — see `.claude/rules/testing.md`, "The timing rule".
 *
 * It sits **below** `testTimeout` (30 s, set in `vitest.config.ts`) on purpose. When
 * the two are equal the test dies first and what CI prints is a bare "Test timed out
 * in 5000ms" pointing at the `it(...)` line instead of the element the wait was
 * looking for. That is what run 34693905255 printed for the two `FirstRunStarter`
 * modal-close cases, which cost 152 ms and 15 ms run alone.
 */
configure({ asyncUtilTimeout: 15_000 });

/**
 * jsdom lacks `ResizeObserver` — this is **a hole in the environment**, not a product constraint,
 * so stubbing it per component using it means duplicating the same file three times (there were
 * actually 3 copies). We place it here once.
 *
 * **It does not simulate observation** — it's an empty stub that doesn't call callbacks. What happens
 * during actual size changes is verified in places with layout (browser e2e);
 * here we only establish that "components subscribing to observation render." Faking
 * callbacks would claim the unit test verifies dimensions it actually can't verify.
 */
if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}

/**
 * `window.matchMedia` — **a browser API missing in jsdom**. Same category as the ResizeObserver stub above.
 *
   * ## Why put it in the common setup
   *
   * Failure modes **trigger in unexpected places.** When the demo section of `/download` was enabled,
   * two **unrelated tests** in `DownloadPage.test.tsx` («Delete download node» ·
   * «Delete go back to map») turned red — because that section renders a child reading
   * `prefers-reduced-motion`. Duplicating stubs per test means the next person hits the same
   * wall again, and the cause looks like their own change.
   *
   * **No risk to the product.** The consumer passes `() => false` as the server snapshot for
   * `useSyncExternalStore`, so pre-render doesn't traverse this path, and real browsers
   * have `matchMedia` without exception. The hole is only in jsdom.
   *
   * Default is **"not reduced"** — since enabling animation is the verification target, that's the default.
   * To test reduced motion, the specific test overrides this stub (the existing two locations already do).
   */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/**
 * **Route-arrival memory is forgotten between cases** (2026-09-12).
 *
 * `src/shared/lib/route-arrival-memory.ts` keeps what a pane resolved for the life of the tab,
 * so a returning screen arrives painted instead of loading. In a test file the "tab" is the whole
 * module, so one case's resolved value is the next case's starting value — and two
 * `AtlasGitPanel` cases that assert the *loading* stage went red the moment the memory landed,
 * having inherited a workspace an earlier case had read.
 *
 * ## Why here rather than in those two files
 *
 * Same reason as the stubs above: the failure lands somewhere unrelated to the change that
 * caused it. Any component that adopts this memory later would silently leak state into its
 * neighbours, and the next person would read the red as their own doing. React state is already
 * torn down between cases by Testing Library; this is the one store that is not, so it is the
 * one that needs saying once.
 *
 * ⚠️ Imported from the **store** file, not the hook's. Importing the hook's module put React in
 * every test file's setup graph — 128 ms of setup per file against 101 ms, roughly +27 ms ×
 * 1026 files on CI, which is pressure on the one resource an oversubscribed runner lacks.
 */
beforeEach(() => {
  clearArrivalMemory();
});
