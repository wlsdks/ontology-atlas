'use client';

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { withBasePath } from '@/shared/lib/base-path';
import {
  type DemoClip,
  availableDemoClips,
  demoCaptions,
  demoPoster,
  demoSources,
} from '../model/demo-clips';

/**
 * 첫 페이지 시연 절 — **2클립 2탭 · 무컷 · 루프 없음 · 무음.**
 *
 * 원장: `docs/DECISIONS.md` 2026-07-29 두 기록(배치 + 시나리오). 이 컴포넌트는
 * 그 시나리오의 **재생 계약**만 구현한다 — 무엇을 찍는지는 촬영이, 어떤 자산이
 * 붙었는지는 `model/demo-clips.ts` 가 정한다.
 *
 * ## 자막을 굽지 않는 이유
 *
 * `.vtt` 가 진실원이고 DOM 이 그린다(원장 확정). 구우면 ① 로케일마다 마스터가
 * 갈라지고 ② `prefers-reduced-motion` 사용자가 영상 대신 포스터를 볼 때 자막이
 * 함께 사라지고 ③ 글자를 고치려면 재인코딩이다. `<track>` 을 브라우저 기본
 * 렌더러에 맡기지도 않는다 — 그 모양이 브라우저마다 다르고 이 페이지의 타입
 * 램프를 안 따른다.
 *
 * ## 탭 이음새 — 원장이 규정한 네 가지
 *
 * ① 이탈 시 `pause()` + `currentTime = 0` — 돌아왔을 때 중간부터 시작하면 무컷의
 *    의미가 없다. ② 전환은 **포스터↔포스터** 크로스페이드(`--motion-base`);
 *    비디오 프레임끼리 크로스페이드하면 두 클립이 한 장면처럼 섞인다. ③ 도착 탭
 *    재생은 **포스터가 그려진 다음 프레임**에 — 그래야 주인공(도착 포스터)이 첫
 *    프레임 델타를 갖는다. ④ 탭 크롬 전이는 `--motion-fast`(확인), 표면 이동은
 *    `--motion-base`(이동). 같은 입력이 낳은 두 단계라 **같은 프레임에 시작**한다.
 *
 * ## reduced-motion 은 빈 자리가 아니다
 *
 * 영상을 죽이고 **포스터를 남기고 자막 첫 줄을 남긴다**. 자막이 DOM 이라 이게
 * 가능하다 — 구웠다면 포스터에는 글자가 없어 정보가 통째로 사라진다.
 */
export function DemoStage({ available }: { available?: readonly DemoClip['id'][] }) {
  const t = useTranslations('download');
  const clips = availableDemoClips(available);
  const [activeId, setActiveId] = useState<DemoClip['id'] | null>(clips[0]?.id ?? null);
  const tablistId = useId();

  if (clips.length === 0) return null;
  const active = clips.find((clip) => clip.id === activeId) ?? clips[0];

  return (
    <section data-testid="demo-stage" aria-labelledby={`${tablistId}-heading`} className="min-w-0">
      <h2
        id={`${tablistId}-heading`}
        className="text-body-lg leading-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
      >
        {t('demoHeading')}
      </h2>

      {clips.length > 1 ? (
        <div
          role="tablist"
          aria-label={t('demoHeading')}
          data-testid="demo-tablist"
          className="mt-3 flex min-w-0 flex-wrap gap-2"
        >
          {clips.map((clip) => {
            const selected = clip.id === active.id;
            return (
              <button
                key={clip.id}
                type="button"
                role="tab"
                id={`${tablistId}-tab-${clip.id}`}
                aria-selected={selected}
                aria-controls={`${tablistId}-panel-${clip.id}`}
                data-testid={`demo-tab-${clip.id}`}
                onClick={() => setActiveId(clip.id)}
                /* 탭 크롬은 **확인**이라 `--motion-fast` 다. Tailwind 기본 전이가
                   그 토큰을 타므로 duration 클래스를 쓰지 않는다(`design.md`). */
                className={cn(
                  'touch-hit-expand rounded-chip border px-3 py-1.5 text-body leading-body transition-colors',
                  selected
                    ? 'border-[color:var(--color-indigo-accent)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-primary)]'
                    : 'border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]',
                )}
              >
                {t(clip.tabKey)}
              </button>
            );
          })}
        </div>
      ) : null}

      {clips.map((clip) => (
        <DemoPanel
          key={clip.id}
          clip={clip}
          hidden={clip.id !== active.id}
          panelId={`${tablistId}-panel-${clip.id}`}
          tabId={`${tablistId}-tab-${clip.id}`}
          singleClip={clips.length === 1}
        />
      ))}
    </section>
  );
}

interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

function DemoPanel({
  clip,
  hidden,
  panelId,
  tabId,
  singleClip,
}: {
  clip: DemoClip;
  hidden: boolean;
  panelId: string;
  tabId: string;
  singleClip: boolean;
}) {
  const t = useTranslations('download');
  const locale = useDocumentLocale();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cues, setCues] = useState<CaptionCue[]>([]);
  const [caption, setCaption] = useState('');
  const [started, setStarted] = useState(false);
  const reduced = usePrefersReducedMotion();

  /** `.vtt` 를 직접 파싱한다 — 브라우저 기본 자막 렌더러의 모양을 쓰지 않으므로. */
  useEffect(() => {
    let cancelled = false;
    fetch(withBasePath(demoCaptions(clip, locale)))
      .then((res) => (res.ok ? res.text() : ''))
      .then((text) => {
        if (!cancelled) setCues(parseVtt(text));
      })
      .catch(() => {
        /* 자막이 없어도 영상은 돈다 — 자막은 더하는 것이지 조건이 아니다. */
      });
    return () => {
      cancelled = true;
    };
  }, [clip, locale]);

  /**
   * **이탈하면 멈추고 처음으로 되돌린다** (원장 탭 이음새 ①). 돌아왔을 때 중간부터
   * 재생되면 "무컷 한 테이크" 라는 주장 자체가 깨진다.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hidden) return;
    video.pause();
    video.currentTime = 0;
    setStarted(false);
    setCaption(cues[0]?.text ?? '');
  }, [hidden, cues]);

  /**
   * 도착 탭 재생은 **포스터가 그려진 다음 프레임**에 (원장 ③). 같은 프레임에
   * 재생하면 주인공이 도착 포스터가 아니라 비디오 첫 프레임이 되어, 주목 승자가
   * 흐려진다.
   */
  useEffect(() => {
    if (hidden || reduced || !clip.autoplay) return;
    const video = videoRef.current;
    if (!video) return;
    const raf = requestAnimationFrame(() => {
      // `play()` 가 Promise 를 안 돌려줄 수 있다 — jsdom 이 그렇고(처리되지 않은
      // 예외로 새어 CI 를 빨갛게 만들었다), 구형 브라우저도 그랬다. 옵셔널 체이닝이
      // 없으면 그 환경에서 `.then` 이 undefined 접근이 된다.
      void video
        .play()
        ?.then(() => setStarted(true))
        .catch(() => setStarted(false));
    });
    return () => cancelAnimationFrame(raf);
  }, [hidden, reduced, clip.autoplay]);

  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const at = video.currentTime;
    // **동시 노출 0** (원장) — 겹치는 큐가 있으면 나중에 시작한 것만 남긴다.
    const current = cues.filter((cue) => at >= cue.start && at < cue.end).at(-1);
    setCaption(current?.text ?? '');
  }, [cues]);

  const play = useCallback(() => {
    void videoRef.current?.play()?.then(() => setStarted(true));
  }, []);

  const firstLine = cues[0]?.text ?? '';

  return (
    <div
      role={singleClip ? undefined : 'tabpanel'}
      id={panelId}
      aria-labelledby={singleClip ? undefined : tabId}
      hidden={hidden}
      /* 나가는 프레임은 상호작용을 받지 않는다 — 보이지 않는 재생 버튼에 Tab 이
         닿으면 키보드 사용자만 유령 컨트롤을 만난다. */
      inert={hidden || undefined}
      data-testid={`demo-panel-${clip.id}`}
      /*
       * **영상은 이 절의 열을 그대로 쓴다** — 별도 상한도, 가운데 정렬도 없다
       * (2026-07-30). 제목·탭과 같은 x 에서 시작해 같은 x 에서 끝난다.
       *
       * 앞서 `mx-auto max-w-4xl` 이었다. 상한은 영상이 관문 첫 화면을 먹지 않게
       * 하려던 것인데, **그 걱정은 이 절이 사는 주소의 것이 아니었다** — 「첫 화면이
       * 스크롤 없이 끝난다」 게이트는 `/download` 를 보고 그 주소에는 시연 절이
       * 없다(같은 날 `/` 로 되돌렸다). 그리고 `mx-auto` 는 제목·탭이 원점에 선 채
       * **영상만 188px 안쪽으로 들여** 한 절을 두 그리드로 갈랐다(1512 실측).
       * 2026-07-29 평결 ③("모든 원소가 같은 x 에 선다")이 히어로에서 없앤 그
       * 결함이고, 영상도 그 "모든" 에 든다.
       *
       * **뷰포트 높이로 상한을 두는 안은 시도했다가 되돌렸다** (2026-07-30, 같은
       * 날 두 번째 정정). `max-w: (100svh − 12rem) × 1512/918` 로 잠갔더니 1920
       * 에서 영상이 1520 → 1176 으로 **344px 좁아져** 절 제목과 오른끝이 어긋났다.
       * 소유자: *"가로길이가 안맞아? 영상이 또 작아졌는데?"*
       *
       * 그 상한의 근거였던 "1920 에서 아래 130px 이 잘린다" 는 **재는 자세가
       * 틀린 수였다** — 절 제목을 화면 맨 위에 붙인 상태의 값이다. 영상 **자체**만
       * 보면 1920×907 에서 넘치는 양은 **16px**(923 − 907)이고, 2560 에서도 64px
       * 이다. 스크롤 한 번에 사라지는 양을 막자고 폭을 344px 깎은 셈이라 대가가
       * 훨씬 컸다.
       *
       * 교훈: **"한 화면에 들어와라" 는 이 영상의 제약이 아니었다.** 페이지 중간의
       * 영상이 뷰포트보다 조금 큰 것은 웹에서 흔하고 스크롤이 답이다. 반면 열 폭이
       * 어긋나는 것은 2026-07-29 평결 ③ 이 금지한 그것이라 매번 눈에 걸린다.
       * 둘 중 지켜야 하는 쪽은 그리드다.
       */
      className="mt-4 min-w-0"
    >
      <div className="relative min-w-0 overflow-hidden rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)]">
        {/*
         * `preload="none"` — 관문의 첫 바이트는 지도와 받기 버튼의 것이다. 두
         * 클립을 미리 받으면 정작 사람이 누를 것이 늦게 온다.
         * `muted` + `playsInline` 은 무음 자동재생의 조건이고, 소리는 원장이
         * **BGM 포함 0** 으로 못박았다.
         */}
        <video
          ref={videoRef}
          data-testid={`demo-video-${clip.id}`}
          poster={withBasePath(demoPoster(clip))}
          preload="none"
          muted
          playsInline
          controls={false}
          onTimeUpdate={onTimeUpdate}
          onEnded={() => setStarted(false)}
          className="block h-auto w-full"
        >
          {demoSources(clip).map((source) => (
            <source key={source.src} src={withBasePath(source.src)} type={source.type} />
          ))}
        </video>

        {/* 자동재생이 아닌 클립(B)과 reduced-motion 은 재생 버튼으로 사람이 시작한다. */}
        {!started && (!clip.autoplay || reduced) ? (
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

      {/*
       * 자막은 영상 **밖**에 산다. 안에 얹으면 ① 화면이 좁을 때 그림을 가리고
       * ② 스크린리더가 영상 컨트롤과 섞어 읽고 ③ reduced-motion 에서 포스터
       * 위에 떠 있어야 하는 이유가 사라진다.
       *
       * `aria-live="polite"` — 자막이 바뀌는 것은 사용자가 부른 사건이 아니라
       * 재생의 부산물이라, 읽는 흐름을 끊지 않는 쪽이 맞다.
       */}
      <p
        aria-live="polite"
        data-testid={`demo-caption-${clip.id}`}
        className="mt-2 min-h-[2.5rem] break-keep text-body leading-body text-[color:var(--color-text-secondary)]"
      >
        {reduced && !started ? firstLine : caption}
      </p>
    </div>
  );
}

/** `WEBVTT` 최소 파서 — 큐 사이 빈 줄, `hh:mm:ss.mmm --> …` 만 읽는다. */
export function parseVtt(text: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const timing = lines.find((line) => line.includes('-->'));
    if (!timing) continue;
    const [rawStart, rawEnd] = timing.split('-->').map((part) => part.trim());
    const body = lines.slice(lines.indexOf(timing) + 1).join(' ').trim();
    if (!body) continue;
    cues.push({ start: toSeconds(rawStart), end: toSeconds(rawEnd), text: body });
  }
  return cues.sort((a, b) => a.start - b.start);
}

function toSeconds(stamp: string): number {
  const parts = stamp.split(':').map((part) => Number.parseFloat(part.replace(',', '.')));
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/**
 * 로케일은 `<html lang>` 에서 읽는다 — 이 컴포넌트가 라우터에 매이지 않게.
 *
 * `useEffect` + `setState` 가 아니라 `useSyncExternalStore` 다. 이유는 lint 회피가
 * 아니라 **서버 스냅샷이 명시된다**는 것이다: 정적 export 의 첫 HTML 은 항상 `en`
 * 으로 굳고, 하이드레이트에서 실제 `lang` 으로 한 번 정정된다. effect 로 하면 그
 * 두 값이 코드에 안 적히고 렌더가 한 번 더 돈다.
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
