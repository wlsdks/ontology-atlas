import { describe, expect, it, vi } from "vitest";

import {
  hasPendingRouteViewTransition,
  navigateWithViewTransition,
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
    const setTimeoutFn = vi.fn((fn: () => void, ms: number) => {
      expect(ms).toBe(ROUTE_VIEW_TRANSITION_SETTLE_TIMEOUT_MS);
      scheduled = fn;
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
