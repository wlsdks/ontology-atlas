'use client';

import { useTranslations } from 'next-intl';

/**
 * 화면이 아직 오지 않았을 때 그 사실만 말하는 표면.
 *
 * 왜 필요한가 — 이 앱의 전체 화면 라우트는 전부 `useSearchParams()` 를 쓰는
 * 클라이언트 뷰다. 정적 export 는 그런 뷰를 프리렌더하지 못하고 가장 가까운
 * Suspense fallback 을 대신 HTML 에 굽는다. 그 fallback 이 `null` 이면 배포된
 * `index.html` 본문에는 **아무것도, `#main` 조차 없다**. 번들이 내려와
 * 하이드레이트할 때까지 사용자는 레일만 남은 검은 화면을 본다 — 빠른 기기에선
 * 120ms 라 안 보이지만, CPU·네트워크가 눌리면 초 단위로 늘어나고 그동안
 * "고장" 과 "빈 볼트" 와 "불러오는 중" 이 전부 같은 그림이 된다.
 *
 * 무엇을 하지 않는가 — 스피너도, 진행바도, 퍼센트도 없다. 모르는 진행을
 * 아는 척하지 않는다. 아는 사실은 하나뿐이다: 이 화면은 아직 오는 중이다.
 * 그 한 문장만 쓴다.
 *
 * 왜 400ms 뒤에 보이는가 — 대부분의 진입은 그보다 빨리 끝난다. 즉시 그리면
 * 정상 진입마다 자막이 한 번 번쩍이고, 그건 고치려던 것보다 나쁘다. 지연은
 * duration 이 아니라 CSS `animation-delay` 라서 `prefers-reduced-motion`
 * 전역 규칙(duration 만 0.01ms)에도 살아남는다 — 감속 사용자도 깜빡임 없이
 * 400ms 뒤 즉시 본다.
 *
 * `data-route-loading` 은 `RouteFocusManager` 가 이 임시 `#main` 을 목적지로
 * 착각해 포커스를 흘리지 않게 하는 표식이다.
 */
export function RouteLoadingFallback() {
  const t = useTranslations('nav');
  return (
    <main
      id="main"
      data-route-loading="true"
      data-testid="route-loading-fallback"
      aria-busy="true"
      // 뷰포트 높이는 셸이 소유한다 — 페이지 루트는 슬롯을 채우기만 한다.
      className="flex h-full min-h-full flex-1 items-center justify-center bg-[color:var(--color-canvas)] p-6"
    >
      <p
        role="status"
        className="route-loading-in text-label text-[color:var(--color-text-quaternary)]"
      >
        {t('surfaceLoading')}
      </p>
    </main>
  );
}
