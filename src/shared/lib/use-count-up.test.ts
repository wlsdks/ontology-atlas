import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
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
  it("reduced-motion → snaps to the target immediately (no animation)", () => {
    mockReducedMotion(true);
    const { result } = renderHook(() => useCountUp(42));
    expect(result.current).toBe(42);
  });

  it("motion enabled → starts counting from 0 on mount", () => {
    mockReducedMotion(false);
    const { result } = renderHook(() => useCountUp(42));
    // First committed value is the animation floor; it climbs to target via rAF.
    expect(result.current).toBe(0);
  });

  /**
   * **A target changing mid-intro must land on the new target** (regression measured
   * 2026-08-12).
   *
   * The insights screen first renders from the built-in sample (125 nodes) and the
   * intro starts counting 0→125. Within those 400ms the user's vault (5 nodes)
   * arrives: the sync effect snaps to 5, but **the intro rAF loop keeps running
   * toward the 125 it captured in a closure at mount**, overwrites that 5, and
   * settles at 125. The target never changes again, so the screen stayed at 125
   * forever.
   *
   * Measured (composition tab, a 5-node user vault): +400ms showed 116, +900ms
   * settled at 125, while the kind distribution and the top chip on the same screen
   * said 5 — **one screen contradicting itself**, under a subtitle promising that
   * every number is computed from the documents.
   */
  it("인트로 도중 target 이 바뀌면 새 target 에서 끝난다 — 견본이 사용자 폴더를 덮으면 안 된다", () => {
    mockReducedMotion(false);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    let clock = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => clock);

    try {
      const { result, rerender } = renderHook(({ target }) => useCountUp(target), {
        initialProps: { target: 125 },
      });

      // Halfway through the intro —
      clock = 200;
      act(() => frames.shift()!(clock));
      expect(result.current).toBeGreaterThan(0);

      // — the user's vault arrives.
      rerender({ target: 5 });

      // Run the rest of the intro to completion.
      clock = 1_000;
      while (frames.length > 0) {
        act(() => frames.shift()!(clock));
      }

      expect(result.current, "인트로가 옛 target 으로 착지해 사용자 값을 덮었다").toBe(5);
    } finally {
      nowSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
