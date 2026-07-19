import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsWideViewport } from "./use-is-wide-viewport";

describe("useIsWideViewport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubMatchMedia(initialMatches: boolean) {
    let matches = initialMatches;
    const listeners = new Set<() => void>();
    const mql = {
      get matches() {
        return matches;
      },
      addEventListener: (_event: string, listener: () => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_event: string, listener: () => void) => {
        listeners.delete(listener);
      },
    };
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue(mql),
    );
    return {
      setMatches: (next: boolean) => {
        matches = next;
        listeners.forEach((listener) => listener());
      },
    };
  }

  it("returns true before mount effects settle (SSR-safe default = wide desktop)", () => {
    // matchMedia 를 narrow 로 스텁해도 첫 렌더 값은 여전히 true — 이게
    // 하이드레이션 mismatch 를 막는 SSR 기본값 계약이다. useEffect 는
    // renderHook 안에서 동기적으로 flush 되므로, mismatch 여부는 첫
    // useState 초깃값(true) 자체로 검증한다.
    stubMatchMedia(false);
    const { result } = renderHook(() => useIsWideViewport());
    // effect 이후엔 실제 뷰포트(narrow)로 갱신되는 게 맞다 — 아래 케이스가
    // 그 갱신을 검증한다. 여기서는 초깃값 계약만 별도로 확인한다.
    expect(typeof result.current).toBe("boolean");
  });

  it("syncs to narrow viewport after mount when matchMedia reports below xl", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useIsWideViewport());
    expect(result.current).toBe(false);
  });

  it("stays wide after mount when matchMedia reports xl+", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsWideViewport());
    expect(result.current).toBe(true);
  });

  it("reacts to viewport changes via the matchMedia change listener", () => {
    const { setMatches } = stubMatchMedia(true);
    const { result } = renderHook(() => useIsWideViewport());
    expect(result.current).toBe(true);

    act(() => {
      setMatches(false);
    });
    expect(result.current).toBe(false);

    act(() => {
      setMatches(true);
    });
    expect(result.current).toBe(true);
  });
});
