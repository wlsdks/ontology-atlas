import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { easeMotion } from "@/shared/motion/ease";
import { MOTION } from "@/shared/motion/tokens";
import { useCountUp } from "./use-count-up";

function mockReducedMotion(matches: boolean) {
  const mql = {
    matches,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList;
  window.matchMedia = vi.fn(() => mql) as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("useCountUp — insights count-up (#3)", () => {
  it("renders the exact target on the server and hydrates without a recoverable mismatch", async () => {
    mockReducedMotion(false);
    const frames: FrameRequestCallback[] = [];
    const recoverable: string[] = [];
    const container = document.createElement("div");
    let root: Root | null = null;

    function CountText({ target }: { target: number }) {
      return createElement("span", null, useCountUp(target));
    }

    try {
      vi.stubGlobal("requestAnimationFrame", undefined);
      const serverHtml = renderToString(createElement(CountText, { target: 42 }));
      expect(serverHtml).toContain(">42<");
      container.innerHTML = serverHtml;

      vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      });
      vi.stubGlobal("cancelAnimationFrame", () => {});

      await act(async () => {
        root = hydrateRoot(container, createElement(CountText, { target: 42 }), {
          onRecoverableError: (error) => recoverable.push(String(error)),
        });
        await Promise.resolve();
      });

      expect(recoverable).toEqual([]);
    } finally {
      if (root) act(() => root?.unmount());
      vi.unstubAllGlobals();
    }
  });

  it("reduced-motion → snaps to the target immediately (no animation)", () => {
    mockReducedMotion(true);
    const { result } = renderHook(() => useCountUp(42));
    expect(result.current).toBe(42);
  });

  it("motion enabled → starts counting from 0 on mount", () => {
    mockReducedMotion(false);
    const { result } = renderHook(() => useCountUp(42));
    expect(result.current).toBe(0);
  });

  it("a target too small to count renders its own value on the first frame", () => {
    mockReducedMotion(false);
    expect(renderHook(() => useCountUp(1)).result.current).toBe(1);
    expect(renderHook(() => useCountUp(2)).result.current).toBe(2);
    expect(renderHook(() => useCountUp(3)).result.current).toBe(0);
  });

  it("if the target changes mid-intro it ends at the new target, since a sample must not overwrite the user folder", () => {
    mockReducedMotion(false);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    let clock = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => clock);

    try {
      const { result, rerender } = renderHook(({ target }) => useCountUp(target), {
        initialProps: { target: 125 },
      });

      clock = 200;
      act(() => frames.shift()!(clock));
      expect(result.current).toBeGreaterThan(0);

      rerender({ target: 5 });

      clock = 1_000;
      while (frames.length > 0) {
        act(() => frames.shift()!(clock));
      }

      expect(result.current, "the intro landed on the old target and overwrote the user value").toBe(5);
    } finally {
      nowSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("animates a later change only when asked, and snaps otherwise", () => {
    mockReducedMotion(false);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    let clock = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => clock);
    const settle = (result: { current: number }) => {
      clock += 1_000;
      while (frames.length > 0) act(() => frames.shift()!(clock));
      return result.current;
    };
    try {
      const animated = renderHook(({ target }) => useCountUp(target, undefined, { animateChanges: true }), {
        initialProps: { target: 20 },
      });
      expect(settle(animated.result)).toBe(20);
      animated.rerender({ target: 0 });
      clock += MOTION.settle.duration * 250;
      act(() => frames.shift()!(clock));
      expect(animated.result.current, "a marked visit should fall, not jump").toBeGreaterThan(0);
      expect(animated.result.current).toBeLessThan(20);
      expect(settle(animated.result)).toBe(0);

      const snapped = renderHook(({ target }) => useCountUp(target), { initialProps: { target: 20 } });
      expect(settle(snapped.result)).toBe(20);
      snapped.rerender({ target: 0 });
      expect(snapped.result.current).toBe(0);
    } finally {
      nowSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("without an intro starts at its target and moves a change from the value last drawn", () => {
    mockReducedMotion(false);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    let clock = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => clock);
    try {
      const share = renderHook(({ target }) => useCountUp(target, undefined, { animateChanges: true, intro: false }), {
        initialProps: { target: 62 },
      });
      expect(share.result.current, "the first draw is the value itself, not a count from zero").toBe(62);
      expect(frames).toHaveLength(0);
      share.rerender({ target: 70 });
      clock += MOTION.settle.duration * 500;
      act(() => frames.shift()!(clock));
      expect(share.result.current).toBeGreaterThan(62);
      expect(share.result.current).toBeLessThan(70);
      clock += MOTION.settle.duration * 1000;
      while (frames.length > 0) act(() => frames.shift()!(clock));
      expect(share.result.current).toBe(70);
    } finally {
      nowSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

describe("useCountUp on the settle clock", () => {
  it("reaches the target exactly at MOTION.settle and not a frame before", () => {
    mockReducedMotion(false);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    let clock = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => clock);
    const settleMs = MOTION.settle.duration * 1000;
    try {
      const { result } = renderHook(() => useCountUp(1000));
      clock = settleMs - 1;
      act(() => frames.shift()!(clock));
      expect(result.current).toBe(Math.round(1000 * easeMotion((settleMs - 1) / settleMs)));
      expect(frames).toHaveLength(1);
      clock = settleMs;
      act(() => frames.shift()!(clock));
      expect(result.current).toBe(1000);
      expect(frames).toHaveLength(0);
    } finally {
      nowSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
