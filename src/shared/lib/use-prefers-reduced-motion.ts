import { useEffect, useState } from "react";

/**
 * `prefers-reduced-motion: reduce` 를 React state 로 노출하는 SSR-안전 훅.
 *
 * CSS 애니메이션/트랜지션은 `app/globals.css` base 레이어의 전역 규칙이 이미
 * 무력화하지만, **JS 로 구동되는 모션**(FLIP transform, 숫자 카운트업 등)은
 * 스스로 판단해 즉시 최종 상태로 건너뛰어야 한다. 그 단일 출처.
 *
 * 정적 export(SSR) 에서는 `matchMedia` 가 없으므로 초기값 false(모션 허용)로
 * 시작하고, 마운트 후 실제 선호를 읽어 동기화한다.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
