import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * "지금 뷰포트가 이 폭보다 좁은가" 를 React 값으로 노출하는 훅.
 *
 * 왜 CSS 만으로 안 되나: 폭이 안 되는 표면을 **숨기는** 것과 **안 만드는**
 * 것은 다르다. `display:none` 으로 가린 표면도 마운트되어 효과·포커스·측정을
 * 계속 돌리고, 화면이 "여긴 못 온다" 고 말하는 동안 그 밑에서 살아 있는 것이
 * 정직하지 않다. 강등은 대체지, 은폐가 아니다.
 *
 * 왜 `useState` + `useEffect` 가 아닌가: matchMedia 는 React 밖의 저장소라
 * 구독의 정석이 `useSyncExternalStore` 다. effect 안에서 setState 로 초기값을
 * 따라잡는 형태는 cascading render 를 만들고(`react-hooks/set-state-in-effect`)
 * 첫 프레임이 항상 틀린 값으로 그려진다. 서버 스냅샷을 따로 주면 정적 export
 * 의 prerender 와 hydration 이 갈라지지도 않는다 — 서버는 "넓다"로 그리고,
 * 하이드레이션 직후 실제 폭으로 한 번에 정착한다.
 *
 * `minWidthPx` 는 Tailwind 브레이크포인트와 **같은 수**를 넣는다 (`lg` =
 * 1024). 경계도 CSS 와 동일하게 "min-width 미만" — 1023.98px 로 질의해 소수
 * 픽셀 배율에서도 `lg:` 유틸리티와 어긋나지 않게 한다.
 */
export function useViewportBelow(minWidthPx: number): boolean {
  const query = useMemo(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
    return window.matchMedia(`(max-width: ${minWidthPx - 0.02}px)`);
  }, [minWidthPx]);

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!query) return () => undefined;
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => query?.matches ?? false, [query]);
  // 서버/prerender 에는 폭이 없다 — "넓다" 가 안전값이다(강등은 실제 폭을 확인한
  // 뒤에만 한다).
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Tailwind `lg` 브레이크포인트 — 데스크톱 레일(`lg:flex`) 이 서는 최소 폭. */
export const LG_BREAKPOINT_PX = 1024;
