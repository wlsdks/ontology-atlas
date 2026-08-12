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
   * **인트로 도중 target 이 바뀌면 새 target 에서 끝난다** (2026-08-12 실측 회귀).
   *
   * 분석 화면의 첫 렌더는 내장 견본(125 노드)으로 그려지고, 인트로가 0→125 로
   * 세기 시작한다. 그 400ms 안에 사용자 볼트(5 노드)가 도착한다 — 동기화
   * 이펙트가 5 로 스냅하지만, **인트로 rAF 루프는 마운트 때 클로저에 잡은 125 를
   * 향해 계속 달려** 그 5 를 덮어쓰고 125 에 정착했다. 그 뒤 target 은 다시 안
   * 바뀌므로 화면은 영원히 125 였다.
   *
   * 실측(구성 탭, 사용자 볼트 5 노드): +400ms 「개념 116」 → +900ms 「개념 125」
   * 정착 · 같은 화면의 종류 분포와 상단 칩은 5 — **한 화면에서 숫자가 모순**됐고,
   * 그 화면의 부제가 "모든 숫자는 문서에서 자동으로 계산돼요" 다.
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

      // 인트로가 절반쯤 달린 시점 —
      clock = 200;
      act(() => frames.shift()!(clock));
      expect(result.current).toBeGreaterThan(0);

      // — 사용자 볼트가 도착한다.
      rerender({ target: 5 });

      // 남은 인트로를 끝까지 돌린다.
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
