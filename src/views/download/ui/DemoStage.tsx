'use client';

import { useCallback, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { withBasePath } from '@/shared/lib/base-path';
import { type DemoClip, availableDemoClips, demoPoster, demoSources } from '../model/demo-clips';

/**
 * 첫 페이지 시연 절 — **한 클립 · 무컷 · 루프 없음 · 무음.**
 *
 * 이 컴포넌트는 시나리오의 **재생 계약**만 구현한다. 무엇을 찍는지는 촬영이,
 * 어떤 자산이 붙었는지는 `model/demo-clips.ts` 가 정한다.
 *
 * ## 2026-08-03 개정 — 탭과 자막을 걷어냈다
 *
 * **탭이 사라진 이유**: 클립이 하나다. 첫인상 자리에서 «무엇을 볼지 고르기»는
 * 비용이지 값이 아니고, 대부분은 첫 탭만 보고 떠나므로 두 번째 클립은 만들었지만
 * 아무도 안 보는 것이 된다(소유자 확정).
 *
 * **자막이 사라진 이유**: 로케일별 영상을 따로 찍는다 — 화면 안의 글자가 이미
 * 그 언어다. 자막이 더할 정보가 없는데 `.vtt` 배관을 남겨 두면 빈 트랙과 빈
 * 자리(`min-h-[2.5rem]`)만 남는다. 종전 구조는 «한 마스터 + 언어별 자막»이라
 * 그 배관이 옳았고, **전제가 바뀌었으므로 배관도 바뀐다.**
 *
 * ## reduced-motion 은 빈 자리가 아니다
 *
 * 영상을 죽이고 **포스터를 남긴다** — 재생 버튼으로 사람이 시작한다. 자동재생만
 * 끄고 내용을 빼앗지 않는 것이 감속의 뜻이다.
 */
export function DemoStage({ available }: { available?: readonly DemoClip['id'][] }) {
  const t = useTranslations('download');
  const headingId = useId();
  const clip = availableDemoClips(available)[0];

  // 자산이 없으면 절 자체가 없다 — 재생할 것 없는 플레이어는 죽은 UI 다.
  if (!clip) return null;

  return (
    <section data-testid="demo-stage" aria-labelledby={headingId} className="min-w-0">
      <h2
        id={headingId}
        className="text-body-lg leading-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
      >
        {t('demoHeading')}
      </h2>
      <DemoPlayer clip={clip} />
    </section>
  );
}

function DemoPlayer({ clip }: { clip: DemoClip }) {
  const t = useTranslations('download');
  const locale = useDocumentLocale();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [started, setStarted] = useState(false);
  const reduced = usePrefersReducedMotion();

  const play = useCallback(() => {
    // `play()` 가 Promise 를 안 돌려줄 수 있다 — jsdom 이 그렇고(처리되지 않은
    // 예외로 새어 CI 를 빨갛게 만들었다), 구형 브라우저도 그랬다.
    void videoRef.current
      ?.play()
      ?.then(() => setStarted(true))
      .catch(() => setStarted(false));
  }, []);

  return (
    <div
      data-testid={`demo-panel-${clip.id}`}
      /*
       * **영상은 이 절의 열을 그대로 쓴다** — 별도 상한도, 가운데 정렬도 없다
       * (2026-07-30). 제목과 같은 x 에서 시작해 같은 x 에서 끝난다.
       *
       * 앞서 `mx-auto max-w-4xl` 이었는데, 그러면 제목이 원점에 선 채 **영상만
       * 188px 안쪽으로 들어가** 한 절이 두 그리드로 갈렸다(1512 실측). 뷰포트
       * 높이로 상한을 두는 안도 시도했다가 되돌렸다 — 1920 에서 영상이 344px
       * 좁아져 오른끝이 어긋났고, 정작 막으려던 넘침은 16px 이었다. 스크롤 한
       * 번에 사라지는 양을 막자고 폭을 깎은 셈이라 대가가 훨씬 컸다.
       */
      className="mt-4 min-w-0"
    >
      <div className="relative min-w-0 overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)]">
        {/*
         * `preload="none"` — 관문의 첫 바이트는 지도와 받기 버튼의 것이다.
         * `muted` + `playsInline` 은 무음 자동재생의 조건이고, 소리는 **BGM 포함
         * 0** 이다. 재생이 시작된 뒤에만 `controls` 를 켠다: 클립이 45초라 되감아
         * 다시 보고 싶은 구간이 생기지만, 시작 전 포스터 위에 컨트롤 바가 얹히면
         * 그게 첫인상의 잉크를 가져간다.
         */}
        <video
          ref={videoRef}
          data-testid={`demo-video-${clip.id}`}
          poster={withBasePath(demoPoster(clip, locale))}
          preload="none"
          muted
          playsInline
          controls={started}
          autoPlay={!reduced}
          onPlay={() => setStarted(true)}
          onEnded={() => setStarted(false)}
          className="block h-auto w-full"
        >
          {demoSources(clip, locale).map((source) => (
            <source key={source.src} src={withBasePath(source.src)} type={source.type} />
          ))}
        </video>

        {/* 감속 사용자와 자동재생이 막힌 브라우저는 사람이 시작한다. */}
        {!started ? (
          <button
            type="button"
            onClick={play}
            data-testid={`demo-play-${clip.id}`}
            className="absolute inset-0 flex items-center justify-center bg-[color:var(--color-backdrop-medium)] text-body leading-body text-[color:var(--color-text-primary)] transition-colors"
          >
            <span className="rounded-chip border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] px-4 py-2">
              {t('demoPlay')}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 로케일은 `<html lang>` 에서 읽는다 — 이 컴포넌트가 라우터에 매이지 않게.
 *
 * `useSyncExternalStore` 인 이유는 lint 회피가 아니라 **서버 스냅샷이 명시된다**는
 * 것이다: 정적 export 의 첫 HTML 은 항상 `en` 으로 굳고, 하이드레이트에서 실제
 * `lang` 으로 한 번 정정된다.
 */
function useDocumentLocale(): string {
  return useSyncExternalStore(
    () => () => undefined, // `lang` 은 리마운트 없이 바뀌지 않는다 — 구독할 것이 없다.
    () => document.documentElement.lang || 'en',
    () => 'en',
  );
}

/** 같은 이유로 외부 스토어 — 서버에서는 "줄이지 않음"(false)이 유일하게 옳은 값이다. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
}

function reducedMotionQuery(): MediaQueryList {
  return window.matchMedia('(prefers-reduced-motion: reduce)');
}

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = reducedMotionQuery();
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getReducedMotion(): boolean {
  return reducedMotionQuery().matches;
}
