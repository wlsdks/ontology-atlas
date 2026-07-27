import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LG_BREAKPOINT_PX, useViewportBelow } from "./use-viewport-below";

type Listener = () => void;

function installMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches,
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
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
      for (const fn of listeners) fn();
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
  it("matchMedia 가 없으면 넓은 화면으로 답한다 — 정적 prerender 안전값", () => {
    // @ts-expect-error — 정적 export prerender 환경 재현.
    window.matchMedia = undefined;
    const { result } = renderHook(() => useViewportBelow(LG_BREAKPOINT_PX));
    expect(result.current).toBe(false);
  });

  it("첫 렌더부터 실제 폭을 답한다 — 틀린 프레임을 그린 뒤 따라잡지 않는다", () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useViewportBelow(LG_BREAKPOINT_PX));
    expect(result.current).toBe(true);
  });

  it("경계는 CSS 와 같다 — min-width 미만만 참", () => {
    const media = installMatchMedia(false);
    renderHook(() => useViewportBelow(LG_BREAKPOINT_PX));
    expect(media.queries[0]).toBe("(max-width: 1023.98px)");
  });

  it("창 크기가 바뀌면 따라간다", () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useViewportBelow(LG_BREAKPOINT_PX));
    expect(result.current).toBe(false);
    act(() => media.emit(true));
    expect(result.current).toBe(true);
  });

  it("언마운트하면 구독을 놓는다", () => {
    const media = installMatchMedia(true);
    const { unmount } = renderHook(() => useViewportBelow(LG_BREAKPOINT_PX));
    expect(media.listenerCount()).toBe(1);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });
});
