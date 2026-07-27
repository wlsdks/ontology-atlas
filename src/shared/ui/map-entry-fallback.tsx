import { getTranslations } from 'next-intl/server';

/**
 * 지도 진입 라우트(`/`, `/topology`)의 서버 렌더 표면.
 *
 * 왜 별도로 필요한가 — 이 라우트의 뷰는 클라이언트 컴포넌트라 정적 export 는
 * 가장 가까운 Suspense fallback 을 HTML 에 굽는다. 일반 `RouteLoadingFallback`
 * 은 "이 화면은 아직 오는 중" 한 문장만 쓰도록 **의도적으로** 설계된 표면이라
 * 다른 라우트에는 옳지만, 여기서는 그 한 문장이 **페이지 내용의 전부**가 된다.
 *
 * 2026-07-27 실측: 배포된 `/en/topology/` 는 193KB 를 내려주는데 사람이 읽을 수
 * 있는 글자가 142자였고 그중 핵심 문장이 "화면을 불러오는 중이에요" 였다. 이
 * URL 은 README 와 런치 자산이 가리키는 데모 주소다 — JS 를 실행하지 않는
 * 것들(링크 미리보기 카드, 크롤러)과 번들이 아직 안 온 사람이 그 페이지를
 * 그렇게 본다.
 *
 * 문구는 **새로 쓰지 않는다.** 헤드라인과 리드는 README 가 이미 발행한 문장이고,
 * 이 자리에서 포지셔닝을 새로 만드는 것은 PO 카운슬 트리거다. 설치 명령어도
 * 넣지 않는다 — npm 발행 전이라 그 명령은 지금 거짓말이다.
 *
 * 지도가 하이드레이트되면 교체되므로 사람 눈에는 지금과 같고, 느린 기기에서는
 * 빈 화면 대신 읽을 것이 남는다.
 */
export async function MapEntryFallback({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'mapEntry' });

  return (
    <main
      id="main"
      data-route-loading="true"
      data-testid="map-entry-fallback"
      aria-busy="true"
      className="flex h-full min-h-full flex-1 flex-col justify-center gap-6 bg-[color:var(--color-canvas)] px-6 py-10 md:px-12"
    >
      <div className="max-w-2xl">
        <h1 className="text-display leading-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] break-keep text-[color:var(--color-text-primary)]">
          {t('headline')}
        </h1>
        <p className="mt-3 max-w-xl break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
          {t('lede')}
        </p>
      </div>

      <p className="max-w-xl break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
        {t('demoNote')}
      </p>

      {/* 지도가 오는 중이라는 사실은 마지막에, 가장 조용하게. 이 문장이 페이지의
          주인공이 되어 있던 것이 고치려던 결함이다. */}
      <p role="status" className="text-label text-[color:var(--color-text-quaternary)]">
        {t('mapComing')}
      </p>
    </main>
  );
}
