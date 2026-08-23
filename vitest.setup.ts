import '@testing-library/jest-dom/vitest';

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
