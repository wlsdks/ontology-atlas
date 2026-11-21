'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { isMotionPaused, subscribeMotionPause } from '@/shared/motion/motion-pause';

import { createFilmClock } from '../../lib/film/film-clock';
import { clamp01 as clamp, easeInOut as inOut } from '../../lib/film/film-kit';
import { registerGatedFrameClient } from '../../lib/page-motion/gateway-frame-loop';
import type { Director } from '../../lib/harness-film/harness-director';
import type { ExampleRead } from '../../lib/harness-film/harness-example';
import {
  ACT_MS,
  EXAMPLE_REPO,
  MIN_PLAY_SCALE,
  PHONE_STILL,
  STARTS,
  phoneStillName,
  TOTAL,
  stillSrc,
  WINDOW,
  pictureZone,
  windowFrame,
  type WindowFrame,
} from '../../lib/harness-film/harness-scene';
import { FilmActBar } from './FilmActBar';

const ACTS = [1, 2, 3, 4] as const;
const ACT_SPANS = [
  [0, 0.25],
  [0.25, 0.5],
  [0.5, 0.75],
  [0.75, 1],
] as const;
const CLOCK = { holdMs: 1800, fadeMs: 260 } as const;
const SETTLE = [0.85, 0.8, 0.7, 0.9] as const;
const FILM_MIN_WIDTH = 768;
/** The Setup view's own `lg:` rules are viewport queries, so the film plays only where they hold. */
const PLAY_MIN_WIDTH = 1024;
const SEEK_FADE = 300;

/* Captions: out in 120ms, in over 160ms with a 12px rise, the last act's line 40ms after its headline. */
const CAPTION_OUT = 120;
const CAPTION_IN = 160;
const CAPTION_LAG = 40;
const CAPTION_RISE = 12;

const STILL = { w: WINDOW.w, h: WINDOW.h } as const;

const SHOT_FADE = 320;
const SHOT_PUSH = 0.035;

function filmTime(p: number): number {
  if (p >= 1) return TOTAL;
  const act = Math.min(3, Math.max(0, Math.floor(p * 4)));
  return STARTS[act] + (p - act * 0.25) * 4 * ACT_MS[act];
}

function captionAt(i: number, T: number) {
  const start = STARTS[i]!;
  const end = i + 1 < STARTS.length ? STARTS[i + 1]! : Infinity;
  const out = 1 - inOut((T - (end - CAPTION_OUT)) / CAPTION_OUT);
  return {
    head: inOut((T - start) / CAPTION_IN) * out,
    body: inOut((T - start - CAPTION_LAG) / CAPTION_IN) * out,
  };
}

function shotAt(i: number, T: number) {
  const start = STARTS[i]!;
  const end = i + 1 < STARTS.length ? STARTS[i + 1]! : Infinity;
  return {
    lit: inOut((T - start) / SHOT_FADE) * (1 - inOut((T - end) / SHOT_FADE)),
    scale: 1 + SHOT_PUSH * clamp((T - start) / (ACT_MS[i]! + SHOT_FADE)),
  };
}

function setRise(el: HTMLElement | null | undefined, lit: number) {
  if (!el) return;
  el.style.opacity = String(lit);
  el.style.transform = `translateY(${(1 - lit) * CAPTION_RISE}px)`;
}

type WindowComponent = ComponentType<{ example: ExampleRead; scale: () => number; onReady: (director: Director | null) => void }>;

type Mode = 'list' | 'still' | 'detail' | 'phone' | 'playing';

export function HarnessFilm() {
  const t = useTranslations('download.harnessFilm');
  const locale = useLocale();
  const stage = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const captionBlock = useRef<HTMLDivElement>(null);
  const captions = useRef<(HTMLLIElement | null)[]>([]);
  const heads = useRef<(HTMLHeadingElement | null)[]>([]);
  const bodies = useRef<(HTMLParagraphElement | null)[]>([]);
  const fills = useRef<(HTMLSpanElement | null)[]>([]);
  const shots = useRef<(HTMLImageElement | null)[]>([]);
  const shotStage = useRef<HTMLDivElement>(null);
  const seek = useRef<(act: number) => void>(() => {});
  const frame = useRef<WindowFrame>({ x: 0, y: 0, s: 1 });
  const [mode, setMode] = useState<Mode>('list');
  const [loaded, setLoaded] = useState<{ Window: WindowComponent; example: ExampleRead } | null>(null);
  const [director, setDirector] = useState<Director | null>(null);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const wide = matchMedia(`(min-width: ${FILM_MIN_WIDTH}px)`);
    const playable = matchMedia(`(min-width: ${PLAY_MIN_WIDTH}px)`);
    let id = 0;
    const decide = () => {
      cancelAnimationFrame(id);
      const next: Mode = !wide.matches
        ? reduced.matches
          ? 'detail'
          : 'phone'
        : reduced.matches || !playable.matches || typeof IntersectionObserver === 'undefined'
          ? 'still'
          : 'playing';
      id = requestAnimationFrame(() => setMode(next));
    };
    decide();
    wide.addEventListener('change', decide);
    playable.addEventListener?.('change', decide);
    reduced.addEventListener?.('change', decide);
    /* A stage too short for legible type shows the still; a larger window may play again. */
    let size = `${innerWidth}x${innerHeight}`;
    const onResize = () => {
      const next = `${innerWidth}x${innerHeight}`;
      if (next === size) return;
      size = next;
      decide();
    };
    addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(id);
      wide.removeEventListener('change', decide);
      playable.removeEventListener?.('change', decide);
      reduced.removeEventListener?.('change', decide);
      removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    const host = stage.current;
    if (mode !== 'playing' || !host) return;
    const place = () => {
      const box = host.getBoundingClientRect();
      const titleBox = label.current?.getBoundingClientRect();
      const block = captionBlock.current?.getBoundingClientRect();
      /* Read without transforms: the captions rise by transform, their box does not move. */
      const zone = pictureZone(
        box.width,
        block ? { left: block.left - box.left, right: block.right - box.left } : { left: 24, right: box.width - 24 },
        titleBox ? titleBox.bottom - box.top : 100,
        block ? block.top - box.top : box.height - 200,
      );
      const next = windowFrame(zone);
      if (next.s < MIN_PLAY_SCALE) {
        setMode('still');
        return;
      }
      frame.current = next;
      if (holder.current) holder.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.s})`;
      if (glow.current) {
        const w = WINDOW.w * next.s * 1.4;
        glow.current.style.width = `${w}px`;
        glow.current.style.height = `${w * 0.5}px`;
        glow.current.style.transform = `translate(${next.x + (WINDOW.w * next.s) / 2 - w / 2}px, ${next.y - w * 0.25}px)`;
      }
    };
    const observer = new ResizeObserver(place);
    observer.observe(host);
    if (label.current) observer.observe(label.current);
    if (captionBlock.current) observer.observe(captionBlock.current);
    place();

    let live = true;
    const scroller = host.closest<HTMLElement>('[data-app-shell-pane]');
    const near = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        near.disconnect();
        void Promise.all([import('./HarnessFilmWindow'), import('../../lib/harness-film/harness-example').then((module) => module.readExample())]).then(
          ([module, example]) => {
            if (live) setLoaded({ Window: module.HarnessFilmWindow, example });
          },
        );
      },
      { root: scroller, rootMargin: '100% 0px' },
    );
    near.observe(host);
    return () => {
      live = false;
      observer.disconnect();
      near.disconnect();
    };
  }, [mode]);

  useEffect(() => {
    const host = stage.current;
    const phone = mode === 'phone';
    const shown = phone ? shotStage.current : holder.current;
    if (!(phone || (mode === 'playing' && director)) || !host || !shown) return;
    const time = createFilmClock(ACT_SPANS, ACT_MS, CLOCK);
    let veil = 1;
    let p = 0;
    const paint = (jump = false) => {
      const T = filmTime(p);
      if (jump) director?.seek(T);
      else director?.at(T);
      shots.current.forEach((shot, i) => {
        if (!shot) return;
        const { lit, scale } = shotAt(i, T);
        shot.style.opacity = String(lit);
        shot.style.transform = `scale(${scale})`;
      });
      const light = isMotionPaused() ? 1 : time.fade() * veil;
      shown.style.opacity = String(light);
      if (glow.current) glow.current.style.opacity = String(light);
      captions.current.forEach((caption, i) => {
        if (!caption) return;
        const { head, body } = captionAt(i, T);
        setRise(heads.current[i], head * light);
        setRise(bodies.current[i], body * light);
        caption.style.visibility = Math.max(head, body) * light > 0.01 ? 'visible' : 'hidden';
      });
      const act = time.act();
      fills.current.forEach((fill, i) => {
        if (!fill) return;
        const [start, end] = ACT_SPANS[i]!;
        fill.style.transform = `scaleX(${i < act ? 1 : i > act ? 0 : clamp((p - start) / (end - start))})`;
      });
    };
    const unregister = registerGatedFrameClient(
      host,
      ({ dtMs, factor }) => {
        /* A visitor who stopped moving sees the film to its end, where it rests on the whole screen. */
        if (factor < 1 && time.resting()) return;
        p = time.advance(dtMs);
        veil = Math.min(1, veil + dtMs / SEEK_FADE);
        paint();
      },
      undefined,
      { keepAwake: true },
    );
    const settle = (act: number) => time.advance(ACT_MS[act]! * SETTLE[act]!);
    seek.current = (act) => {
      time.seek(act);
      const paused = isMotionPaused();
      p = paused ? settle(act) : time.progress();
      veil = paused ? 1 : 0;
      paint(true);
    };
    const offPause = subscribeMotionPause(() => {
      if (!isMotionPaused()) return;
      /* A film paused before it began would hold a dark first frame: show its first act instead. */
      if (time.progress() === 0) p = settle(0);
      paint(true);
    });
    if (isMotionPaused()) p = settle(0);
    /* The first frame waits for a frame of its own: a press commits React work, which an effect may not. */
    const first = requestAnimationFrame(() => paint(true));
    return () => {
      cancelAnimationFrame(first);
      unregister();
      offPause();
      seek.current = () => {};
    };
  }, [mode, director]);

  const title = (
    <div ref={label} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 id="gateway-harness-title" className="text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
        {t('label')}
      </h2>
      {mode === 'list' ? null : (
        <p className="text-body-lg leading-body-lg text-[color:var(--color-text-tertiary)]">
          {t('example')} <code className="font-mono text-[color:var(--color-text-secondary)]">{EXAMPLE_REPO}</code>
        </p>
      )}
    </div>
  );

  const list = (
    <ol className="mt-6 grid gap-8 @container sm:grid-cols-2 lg:grid-cols-4">
      {ACTS.map((act) => (
        <li key={act} className="min-w-0">
          <h3 className="text-title leading-title text-[color:var(--color-text-primary)]">{t(`acts.${act}.title`)}</h3>
          <p className="mt-2 text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">{t(`acts.${act}.body`)}</p>
        </li>
      ))}
    </ol>
  );

  const Window = mode === 'playing' ? loaded?.Window : undefined;

  return (
    <div
      role="region"
      aria-labelledby="gateway-harness-title"
      data-testid="gateway-harness"
      data-gateway-harness={mode === 'playing' || mode === 'phone' ? mode : 'still'}
      className="relative mt-[var(--gateway-section-gap)] w-full"
    >
      {mode === 'playing' ? (
        <div ref={stage} className="relative h-[100svh] max-h-[60rem] min-h-[36rem] w-full overflow-hidden">
          <div
            ref={glow}
            aria-hidden
            data-harness-film-glow
            className="pointer-events-none absolute left-0 top-0 opacity-0"
            style={{ background: 'radial-gradient(closest-side, var(--color-indigo-a16), transparent)' }}
          />
          <div ref={holder} data-harness-film-frame className="absolute left-0 top-0 origin-top-left opacity-0">
            {Window && loaded ? (
              <Window example={loaded.example} scale={() => frame.current.s} onReady={setDirector} />
            ) : null}
          </div>
          <div className={cn(PAGE_GUTTER, 'pointer-events-none absolute inset-x-0 top-[4.5rem]')}>
            <div className={PAGE_COLUMN}>{title}</div>
          </div>
          <div className={cn(PAGE_GUTTER, 'absolute inset-x-0 bottom-[5svh]')}>
            <div ref={captionBlock} className={PAGE_COLUMN}>
              <ol className="grid items-end">
                {ACTS.map((act, i) => (
                  <li
                    key={act}
                    ref={(node) => {
                      captions.current[i] = node;
                    }}
                    className="invisible flex min-w-0 max-w-[56rem] flex-col items-start text-left [grid-area:1/1]"
                  >
                    <h3
                      ref={(node) => {
                        heads.current[i] = node;
                      }}
                      className="[text-wrap:balance] text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)] opacity-0 sm:text-hero-lg"
                    >
                      {t(`acts.${act}.title`)}
                    </h3>
                    {act === 4 ? (
                      <p
                        ref={(node) => {
                          bodies.current[i] = node;
                        }}
                        className="mt-3 max-w-[30rem] text-title leading-title text-[color:var(--color-text-secondary)] opacity-0"
                      >
                        {t('acts.4.caption')}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
              <FilmActBar
                titles={ACTS.map((act) => t(`acts.${act}.title`))}
                label={t('actsLabel')}
                fills={fills}
                onSeek={(act) => seek.current(act)}
                align="start"
                className="mt-6"
              />
            </div>
          </div>
        </div>
      ) : mode === 'phone' ? (
        <div ref={stage} className={PAGE_GUTTER}>
          <div className={PAGE_COLUMN}>
            {title}
            <div
              ref={shotStage}
              aria-hidden
              data-harness-film-phone
              className="harness-phone-shots mt-6 grid overflow-hidden opacity-0 [&>*]:[grid-area:1/1]"
            >
              {ACTS.map((act, i) => (
                <Image
                  key={act}
                  ref={(node) => {
                    shots.current[i] = node;
                  }}
                  src={withBasePath(stillSrc(phoneStillName(act), locale))}
                  unoptimized
                  width={PHONE_STILL.w}
                  height={PHONE_STILL.h}
                  loading="lazy"
                  alt=""
                  className="block h-auto w-full opacity-0"
                />
              ))}
            </div>
            <ol className="mt-5 grid [&>*]:[grid-area:1/1]">
              {ACTS.map((act, i) => (
                <li
                  key={act}
                  ref={(node) => {
                    captions.current[i] = node;
                  }}
                  className="invisible min-w-0"
                >
                  <h3
                    ref={(node) => {
                      heads.current[i] = node;
                    }}
                    className="text-title leading-title text-[color:var(--color-text-primary)] opacity-0"
                  >
                    {t(`acts.${act}.title`)}
                  </h3>
                  <p
                    ref={(node) => {
                      bodies.current[i] = node;
                    }}
                    className="mt-2 text-body-lg leading-body-lg text-[color:var(--color-text-secondary)] opacity-0"
                  >
                    {t(`acts.${act}.body`)}
                  </p>
                </li>
              ))}
            </ol>
            <FilmActBar
              titles={ACTS.map((act) => t(`acts.${act}.title`))}
              label={t('actsLabel')}
              fills={fills}
              onSeek={(act) => seek.current(act)}
              align="start"
              className="mt-5"
            />
          </div>
        </div>
      ) : (
        <>
          <div className={PAGE_GUTTER}>
            <div className={PAGE_COLUMN}>{title}</div>
          </div>
          {mode === 'still' || mode === 'detail' ? (
            <div className={PAGE_GUTTER}>
              <div className={cn(PAGE_COLUMN, 'mt-6')}>
                <Image
                  data-harness-film-still={mode}
                  src={withBasePath(stillSrc(mode === 'detail' ? phoneStillName(3) : 'harness-film', locale))}
                  unoptimized
                  width={mode === 'detail' ? PHONE_STILL.w : STILL.w}
                  height={mode === 'detail' ? PHONE_STILL.h : STILL.h}
                  loading="lazy"
                  alt=""
                  className={cn('block h-auto', mode === 'detail' ? 'harness-phone-shots w-full' : 'max-w-full')}
                />
              </div>
            </div>
          ) : null}
          <div className={PAGE_GUTTER}>
            <div className={PAGE_COLUMN}>{list}</div>
          </div>
        </>
      )}
    </div>
  );
}
