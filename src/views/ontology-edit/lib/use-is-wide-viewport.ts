"use client";

import { useEffect, useState } from "react";

/**
 * 빌더 인스펙터 상주 사이드바(xl+) vs 시트 다이얼로그(xl 미만) 분기에
 * 쓰는 SSR-safe 뷰포트 훅. `--breakpoint-xl` (Tailwind v4 default 1280px)
 * 과 동일한 min-width 를 JS 로 미러링해 인스펙터를 DOM 에 한 벌만
 * 렌더한다 (기존엔 두 분기를 CSS `hidden xl:flex` / `xl:hidden` 로만
 * 나눠 동시에 렌더 — DOM 중복 · e2e locator 다중 매치 회귀 원인).
 *
 * 서버 + 첫 클라이언트 페인트는 항상 `true`(와이드/데스크톱) 를 반환한다.
 * 정적 export 라 서버는 뷰포트를 모르므로, 기존 CSS 분기의 default 였던
 * "xl+ 데스크톱 상주" 와 같은 값으로 맞춰야 하이드레이션 mismatch 가
 * 없다. 마운트 후에만 `matchMedia` 로 실제 뷰포트를 읽어 갱신 — 좁은
 * 화면 사용자만 마운트 직후 1회 재배치되고(수용 가능한 트레이드오프),
 * xl+ 데스크톱 사용자는 서버 값과 클라이언트 값이 항상 일치한다.
 */
const XL_MEDIA_QUERY = "(min-width: 1280px)";

export function useIsWideViewport(): boolean {
  const [isWide, setIsWide] = useState(true);

  useEffect(() => {
    const query = window.matchMedia(XL_MEDIA_QUERY);
    const sync = () => setIsWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return isWide;
}
