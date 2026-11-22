import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LG_BREAKPOINT_PX, useViewportBelow } from "./use-viewport-below";

type Listener = () => void;

function installMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches,
    addEventListener: (_: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
  };
  const queries: string[] = [];
  window.matchMedia = vi.fn((q: string) => {
    queries.push(q);
    return mql;
  }) as unknown as typeof window.matchMedia;
  return {
    queries,
    emit(next: boolean) {
      mql.matches = next;
      for (const listener of listeners) listener();
    },
    listenerCount: () => listeners.size,
  };
}

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

describe("useViewportBelow", () => {
  it("without matchMedia it answers wide screen, the safe value for static prerender", () => {
    // @ts-expect-error — reproduces the static-export prerender environment.
    window.matchMedia = undefined;
    const { result } = renderHook(() => useViewportBelow(LG_BREAKPOINT_PX));
    expect(result.current).toBe(false);
  });

  it("a caller whose wide layout is rare can prerender narrow", () => {
    // @ts-expect-error — reproduces the static-export prerender environment.
    window.matchMedia = undefined;
    const { result } = renderHook(() => useViewportBelow(1792, true));
    expect(result.current).toBe(true);
  });

  it("answers the real width from the first render, without catching up after a wrong frame", () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useViewportBelow(LG_BREAKPOINT_PX));
    expect(result.current).toBe(true);
  });

  it("the boundary matches CSS: true only below min-width", () => {
    const media = installMatchMedia(false);
    renderHook(() => useViewportBelow(LG_BREAKPOINT_PX));
    expect(media.queries[0]).toBe("(max-width: 1023.98px)");
  });

  it("follows window size changes", () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useViewportBelow(LG_BREAKPOINT_PX));
    expect(result.current).toBe(false);
    act(() => media.emit(true));
    expect(result.current).toBe(true);
  });

  it("releases the subscription on unmount", () => {
    const media = installMatchMedia(true);
    const { unmount } = renderHook(() => useViewportBelow(LG_BREAKPOINT_PX));
    expect(media.listenerCount()).toBe(1);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });
});
