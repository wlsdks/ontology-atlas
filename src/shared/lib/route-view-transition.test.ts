import { describe, expect, it, vi } from "vitest";

import {
  hasPendingRouteViewTransition,
  hasPendingRouteViewTransitionBound,
  navigateWithViewTransition,
  readCrossfadeBudgetMs,
  ROUTE_VIEW_TRANSITION_CROSSFADE_FALLBACK_MS,
  ROUTE_VIEW_TRANSITION_SETTLE_TIMEOUT_MS,
  settleRouteViewTransition,
} from "./route-view-transition";

describe("route view transition — the old screen is held until the new route commits", () => {
  it("navigates directly when the browser has no view transitions", () => {
    const navigate = vi.fn();
    expect(navigateWithViewTransition(navigate, { startViewTransition: null })).toBe("direct");
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(hasPendingRouteViewTransition()).toBe(false);
  });

  it("runs the navigation inside the transition and releases it on settle", async () => {
    const navigate = vi.fn();
    let updatePromise: Promise<void> | undefined;
    const start = vi.fn((update: () => Promise<void> | void) => {
      updatePromise = update() as Promise<void>;
    });
    const setTimeoutFn = vi.fn(() => 0) as unknown as typeof setTimeout;
    expect(navigateWithViewTransition(navigate, { startViewTransition: start, setTimeoutFn })).toBe("transition");
    expect(start).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(hasPendingRouteViewTransition()).toBe(true);
    let resolved = false;
    void updatePromise!.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    settleRouteViewTransition();
    await Promise.resolve();
    expect(resolved).toBe(true);
    expect(hasPendingRouteViewTransition()).toBe(false);
  });

  it("a safety timeout releases a transition whose route never commits", () => {
    const start = vi.fn((update: () => Promise<void> | void) => {
      void update();
    });
    let scheduled: (() => void) | null = null;
    // Only the first schedule is the safety net; settling then arms the crossfade budget
    // (see "the hold is bounded from the commit" below), which schedules its own callback.
    const setTimeoutFn = vi.fn((fn: () => void, ms: number) => {
      if (scheduled === null) {
        expect(ms).toBe(ROUTE_VIEW_TRANSITION_SETTLE_TIMEOUT_MS);
        scheduled = fn;
      }
      return 0;
    }) as unknown as typeof setTimeout;
    navigateWithViewTransition(() => undefined, { startViewTransition: start, setTimeoutFn });
    expect(hasPendingRouteViewTransition()).toBe(true);
    scheduled!();
    expect(hasPendingRouteViewTransition()).toBe(false);
  });

  it("a second click releases the first transition instead of chaining two holds", () => {
    const start = vi.fn((update: () => Promise<void> | void) => {
      void update();
    });
    const setTimeoutFn = vi.fn(() => 0) as unknown as typeof setTimeout;
    navigateWithViewTransition(() => undefined, { startViewTransition: start, setTimeoutFn });
    navigateWithViewTransition(() => undefined, { startViewTransition: start, setTimeoutFn });
    expect(start).toHaveBeenCalledTimes(2);
    settleRouteViewTransition();
    expect(hasPendingRouteViewTransition()).toBe(false);
  });

  it("the settle timeout is short enough to never read as a frozen app", () => {
    expect(ROUTE_VIEW_TRANSITION_SETTLE_TIMEOUT_MS).toBeLessThanOrEqual(1000);
  });

  /**
   * **A hidden document skips the transition, and that is not an error.** The browser
   * rejects `ready` (and can reject `finished`/`updateCallbackDone`) with "View
   * transition was skipped because document visibility state is hidden."; nothing
   * awaited them, so the installed app logged it as
   * `webview unhandledrejection` on a plain background navigation.
   */
  it("a skipped transition's rejected promises never reach unhandledrejection", async () => {
    const rejections: unknown[] = [];
    const onUnhandled = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      rejections.push(event.reason);
    };
    globalThis.addEventListener?.("unhandledrejection", onUnhandled as EventListener);
    // The DOM event and Node's process event are both watched: which one fires
    // depends on the environment the suite runs in, and a gate that watches only
    // the silent one is no gate.
    const onProcessUnhandled = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onProcessUnhandled);
    try {
      const skipped = () =>
        Promise.reject(
          new Error("View transition was skipped because document visibility state is hidden."),
        );
      const start = vi.fn((update: () => Promise<void> | void) => {
        void update();
        return {
          ready: skipped(),
          finished: skipped(),
          updateCallbackDone: skipped(),
        };
      });
      const setTimeoutFn = vi.fn(() => 0) as unknown as typeof setTimeout;
      const navigate = vi.fn();
      expect(navigateWithViewTransition(navigate, { startViewTransition: start, setTimeoutFn })).toBe(
        "transition",
      );
      expect(navigate).toHaveBeenCalledTimes(1);
      settleRouteViewTransition();
      // Two macrotask turns — a rejection with no handler is reported after the
      // microtask queue drains.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(rejections, "a skipped transition escaped as an unhandled rejection").toEqual([]);
    } finally {
      globalThis.removeEventListener?.("unhandledrejection", onUnhandled as EventListener);
      process.off("unhandledRejection", onProcessUnhandled);
    }
  });

  it("a transition handle without promises is left alone", () => {
    const start = vi.fn((update: () => Promise<void> | void) => {
      void update();
      return undefined;
    });
    const setTimeoutFn = vi.fn(() => 0) as unknown as typeof setTimeout;
    expect(() =>
      navigateWithViewTransition(() => undefined, { startViewTransition: start, setTimeoutFn }),
    ).not.toThrow();
    settleRouteViewTransition();
  });
});

/**
 * **The bound on how long the arriving screen may refuse input.**
 *
 * While a view transition runs, the captured document is not painted and therefore not
 * hit-tested: a press lands on nothing. Measured on the static export at 1512x901, the
 * Library's own first render pushed the crossfade's start out to 229-239 ms, so the
 * transition finished at 480-489 ms and a press at +300 ms landed on `HTML` instead of
 * the door. One crossfade's worth of time after the route commits, a fade that has not
 * begun never will, and the transition is skipped.
 *
 * The pixel proof is `tests/e2e/route-transition-input.spec.ts`; this layer pins the
 * decision — *when* the budget starts, and that a fade already running is never cut.
 */
describe("route view transition — the hold is bounded from the commit, not from the click", () => {
  /** A fake `startViewTransition` that hands back a handle whose skip is observable. */
  const fakeTransition = () => {
    const skipTransition = vi.fn();
    const start = (update: () => Promise<void> | void) => {
      void update();
      return { skipTransition };
    };
    return { start, skipTransition };
  };

  /** Collects the callbacks scheduled at each delay, so a test can fire exactly one. */
  const recorder = () => {
    const calls: { fn: () => void; ms: number }[] = [];
    const setTimeoutFn = ((fn: () => void, ms: number) => {
      calls.push({ fn, ms });
      return 0;
    }) as unknown as typeof setTimeout;
    return { calls, setTimeoutFn };
  };

  it("arms the budget only once the route has committed", () => {
    const { start, skipTransition } = fakeTransition();
    const { calls, setTimeoutFn } = recorder();
    navigateWithViewTransition(() => undefined, {
      startViewTransition: start,
      setTimeoutFn,
      crossfadeMs: 180,
      animations: () => [],
    });
    // Only the settle safety net is scheduled while the old screen is still held: a budget
    // started at the click would spend itself on the route's own render.
    expect(calls.map((call) => call.ms)).toEqual([ROUTE_VIEW_TRANSITION_SETTLE_TIMEOUT_MS]);
    expect(hasPendingRouteViewTransitionBound()).toBe(false);
    settleRouteViewTransition();
    expect(calls.map((call) => call.ms)).toEqual([ROUTE_VIEW_TRANSITION_SETTLE_TIMEOUT_MS, 180]);
    expect(hasPendingRouteViewTransitionBound()).toBe(true);
    expect(skipTransition).not.toHaveBeenCalled();
  });

  it("skips a crossfade that never began", () => {
    const { start, skipTransition } = fakeTransition();
    const { calls, setTimeoutFn } = recorder();
    navigateWithViewTransition(() => undefined, {
      startViewTransition: start,
      setTimeoutFn,
      crossfadeMs: 180,
      // Pseudo-element animations exist but none has a start time — the browser never got
      // a frame in which to begin them.
      animations: () => [{ pseudo: "::view-transition-new(root)", startTime: null }],
    });
    settleRouteViewTransition();
    calls.find((call) => call.ms === 180)!.fn();
    expect(skipTransition).toHaveBeenCalledTimes(1);
    expect(hasPendingRouteViewTransitionBound()).toBe(false);
  });

  it("never cuts a crossfade that is already running", () => {
    const { start, skipTransition } = fakeTransition();
    const { calls, setTimeoutFn } = recorder();
    navigateWithViewTransition(() => undefined, {
      startViewTransition: start,
      setTimeoutFn,
      crossfadeMs: 180,
      animations: () => [{ pseudo: "::view-transition-old(root)", startTime: 12 }],
    });
    settleRouteViewTransition();
    calls.find((call) => call.ms === 180)!.fn();
    expect(skipTransition, "돌고 있는 페이드를 잘랐다").not.toHaveBeenCalled();
  });

  it("ignores animations that are not the transition's own", () => {
    const { start, skipTransition } = fakeTransition();
    const { calls, setTimeoutFn } = recorder();
    navigateWithViewTransition(() => undefined, {
      startViewTransition: start,
      setTimeoutFn,
      crossfadeMs: 180,
      // A running animation somewhere else on the page is not evidence that the crossfade
      // began, and reading it as such would leave the hold unbounded.
      animations: () => [{ pseudo: null, startTime: 4 }],
    });
    settleRouteViewTransition();
    calls.find((call) => call.ms === 180)!.fn();
    expect(skipTransition).toHaveBeenCalledTimes(1);
  });

  it("a second navigation disarms the first budget instead of skipping the new transition", () => {
    const first = fakeTransition();
    const second = fakeTransition();
    const { calls, setTimeoutFn } = recorder();
    const options = { setTimeoutFn, crossfadeMs: 180, animations: () => [] };
    navigateWithViewTransition(() => undefined, { ...options, startViewTransition: first.start });
    settleRouteViewTransition();
    const staleBound = calls.find((call) => call.ms === 180)!.fn;
    navigateWithViewTransition(() => undefined, { ...options, startViewTransition: second.start });
    staleBound();
    expect(first.skipTransition, "지난 전환의 예산이 새 전환을 끊었다").not.toHaveBeenCalled();
    expect(second.skipTransition).not.toHaveBeenCalled();
  });
});

/**
 * The budget is read from `--motion-base` so the stylesheet and this module cannot drift.
 * ⚠️ The computed value arrives in **seconds** (`0.18s`) rather than as authored
 * (`180ms`), which is why the unit is parsed rather than assumed.
 */
describe("the crossfade budget is the stylesheet's own number", () => {
  it("reads seconds and milliseconds alike", () => {
    expect(readCrossfadeBudgetMs(() => "0.18s")).toBe(180);
    expect(readCrossfadeBudgetMs(() => " 180ms ")).toBe(180);
    expect(readCrossfadeBudgetMs(() => "0.24s")).toBe(240);
  });

  it("falls back to the shipped number rather than to zero", () => {
    // Zero would skip every crossfade at once; an unreadable token must cost nothing.
    expect(readCrossfadeBudgetMs(() => "")).toBe(ROUTE_VIEW_TRANSITION_CROSSFADE_FALLBACK_MS);
    expect(readCrossfadeBudgetMs(() => "fast")).toBe(ROUTE_VIEW_TRANSITION_CROSSFADE_FALLBACK_MS);
    expect(readCrossfadeBudgetMs(null)).toBe(ROUTE_VIEW_TRANSITION_CROSSFADE_FALLBACK_MS);
    expect(ROUTE_VIEW_TRANSITION_CROSSFADE_FALLBACK_MS).toBeGreaterThan(0);
  });
});
