import { useEffect, useState } from "react";

/**
 * `prefers-reduced-motion: reduce` 를 React state 로 노출하는 SSR-안전 훅.
 *
 * CSS 애니메이션/트랜지션은 `app/globals.css` base 레이어의 전역 규칙이 이미
 * 무력화하지만, **JS 로 구동되는 모션**(FLIP transform, 숫자 카운트업 등)은
 * 스스로 판단해 즉시 최종 상태로 건너뛰어야 한다. 그 단일 출처.
 *
 * 정적 export(SSR) 에서는 `matchMedia` 가 없으므로 초기값 false(모션 허용)로
 * 시작하고, 클라이언트 첫 렌더에서는 동기적으로 실제 선호를 읽는다 —
 * 마운트 시 한 번 도는 JS 모션(카운트업 등)이 첫 프레임부터 올바르게
 * 게이트되도록.
 */
function readReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    // Initial value already read synchronously in useState; here we only
    // subscribe to later changes (avoids a redundant setState in the effect body).
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
