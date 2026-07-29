import { getTranslations } from 'next-intl/server';
import { withBasePath } from '@/shared/lib/base-path';

/**
 * 루트 `/` 의 서버 렌더 표면 — **관문 버전**.
 *
 * ## 왜 `MapEntryFallback` 이 아닌가
 *
 * 정적 export 에서 이 라우트의 HTML 본문은 Suspense fallback 이 전부다. 즉
 * **JS 를 실행하지 않는 것들**(링크 미리보기 카드, 크롤러)이 보는 페이지 내용이
 * 통째로 이 컴포넌트다.
 *
 * 2026-07-29 소유자 서명으로 `/` 는 웹 방문자의 얼굴이 됐다(원장:
 * 「root-first-open」 뒤집기). 그런데 fallback 은 여전히 지도를 설명하고
 * 있었다 — 그러면 이 제품의 대표 주소를 공유했을 때 미리보기에 뜨는 글이
 * **실제로 열리는 화면과 다른 것**을 말한다. `MapEntryFallback` 은 그 설명이
 * 맞는 자리(`/topology`)에 그대로 남는다.
 *
 * ## 문구를 새로 쓰지 않는다
 *
 * 헤드라인·리드는 관문 페이지가 이미 쓰는 문장(`download.stageTitle` /
 * `stageLead`)을 그대로 가져온다. 이 자리에서 포지셔닝을 새로 만드는 것은 PO
 * 카운슬 트리거이고, 무엇보다 **fallback 과 실제 화면이 다른 말을 하면** 그게
 * 고치려던 결함 그 자체다.
 *
 * 링크 둘은 실제 목적지다 — 받는 곳과 설치 없이 보는 곳. JS 가 없어도 살아
 * 있어야 관문이다.
 */
export async function GatewayEntryFallback({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'download' });

  return (
    <main
      id="main"
      tabIndex={-1}
      data-route-loading="true"
      data-testid="gateway-entry-fallback"
      aria-busy="true"
      className="flex h-full min-h-full flex-1 flex-col justify-center gap-6 bg-[color:var(--color-canvas)] px-6 py-10 md:px-12"
    >
      <div className="max-w-2xl">
        <p className="font-mono text-label uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
          {t('eyebrow')}
        </p>
        <h1 className="mt-3 whitespace-pre-line text-display leading-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] break-keep text-[color:var(--color-text-primary)]">
          {t('stageTitle')}
        </h1>
        <p className="mt-3 max-w-xl break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
          {t('stageLead')}
        </p>
      </div>

      <p className="flex flex-wrap items-center gap-x-5 gap-y-2 text-body leading-body">
        <a
          className="text-[color:var(--color-indigo-accent)]"
          href={withBasePath(`/${locale}/download/`)}
        >
          {t('downloadSectionLabel')}
        </a>
        <a
          className="text-[color:var(--color-text-tertiary)]"
          href={withBasePath(`/${locale}/topology/`)}
        >
          {t('webCta')}
        </a>
      </p>
    </main>
  );
}
