import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
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
});
