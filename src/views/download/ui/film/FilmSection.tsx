import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { isMotionPaused, subscribeMotionPause } from '@/shared/motion/motion-pause';
import { readFlatGraphTokens } from '@/widgets/ontology-map';

import { ACT_MS, ACT_SPANS, ACT_START, FADE_MS, FILM_MS, HOLD_MS, SEEK_FADE_MS, seamLight } from '../../lib/film/timeline/film-acts';
import { createFilmClock } from '../../lib/film/timeline/film-clock';
import { lightSprite } from '../../lib/film/film-light-sprite';
import { clamp01, easeInOut, easeOut } from '../../lib/film/timeline/film-easing';
import type { LabelSegment } from '../../lib/film/map/film-map-labels';
import { layoutFilmMap } from '../../lib/film/map/film-map-layout';
import type { FilmCopy, FilmMapLayout } from '../../lib/film/map/film-map-shapes';
import type { FilmMarkTokens } from '../../lib/film/map/film-map-sizes';
import { layoutOpen, type OpenLayout } from '../../lib/film/film-open';
import { pickFilmConcept, readFilmVault, type FilmVault } from '../../lib/film/film-vault';
import { layoutWall, type WallLayout } from '../../lib/film/film-wall';
import type { Rect } from '../../lib/film/film-geometry';
import { registerGatedFrameClient } from '../../lib/page-motion/gateway-frame-loop';
import type { StageGraph } from '../../lib/stage-graph';
import { FilmActBar } from './FilmActBar';
import { mix } from './film-colors';
import { paintFilm } from './film-paint';
import { buildFilmPaintScene, type FilmInks, type FilmPaintScene } from './film-paint-scene';
import { TextStamps } from './text-stamps';
import { mountFilmProbe, type FilmProbe } from './film-probe';

const ACTS = [1, 2, 3, 4] as const;
const SETTLE = 0.97;
const CYCLE_MS = FILM_MS + HOLD_MS + FADE_MS;

function readInks(probe: CanvasRenderingContext2D, restHue: number): FilmInks {
  const root = getComputedStyle(document.documentElement);
  const v = (name: string) => {
    probe.fillStyle = '#000';
    probe.fillStyle = root.getPropertyValue(name).trim() || '#000';
    return String(probe.fillStyle);
  };
  const graph = readFlatGraphTokens().inks;
  const norm = (value: string) => {
    probe.fillStyle = '#000';
    probe.fillStyle = value;
    return String(probe.fillStyle);
  };
  const ground = v('--color-canvas');
  const name = norm(graph.name);
  return {
    ground,
    halo: norm(graph.halo),
    discFill: norm(graph.discFill),
    name,
    strong: norm(graph.nameStrong),
    project: norm(graph.project),
    arc: norm(graph.arc),
    reach: norm(graph.reach),
    agent: v('--map-amber-hub'),
    primary: v('--color-text-primary'),
    secondary: v('--color-text-secondary'),
    tertiary: v('--color-text-tertiary'),
    panel: v('--color-panel'),
    border: v('--color-border-strong'),
    borderSoft: v('--color-border-soft'),
    rest: mix(name, ground, restHue),
  };
}

function readMarkTokens(): FilmMarkTokens {
  const P = readFlatGraphTokens().paint;
  const root = getComputedStyle(document.documentElement);
  const readNumber = (name: string, fallback: number) => {
    const value = Number(root.getPropertyValue(name).trim());
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    domainDiscPx: P.domainDiscPx,
    domainCorePx: P.domainCorePx,
    domainRimPx: P.domainRimPx,
    projectDiscPx: P.projectDiscPx,
    projectCorePx: P.projectCorePx,
    capDiscMinPx: P.capDiscMinPx,
    capDiscGainPx: P.capDiscGainPx,
    capDiscMaxPx: P.capDiscMaxPx,
    capRimPx: P.capRimPx,
    capCoreInsetPx: P.capCoreInsetPx,
    capCoreMinPx: P.capCoreMinPx,
    elementDotPx: P.elementDotPx,
    selectedDiscPx: P.selectedDiscPx,
    selectedRingGapPx: P.selectedRingGapPx,
    selectedRingPx: P.selectedRingPx,
    lineTaperPx: P.lineTaperPx,
    lineTaperGainPx: P.lineTaperGainPx,
    lineTaperMaxPx: P.lineTaperMaxPx,
    lineDotPx: P.lineDotPx,
    lineDotGapPx: P.lineDotGapPx,
    lightAlpha: P.lightAlpha,
    lightReach: P.lightReach,
    restHue: P.restHue,
    growth: readNumber('--map-graph-film-growth', 1),
    sink: readNumber('--map-graph-film-sink', P.sinkInk),
  };
}

type LaidOut = {
  key: string;
  vault: FilmVault;
  pick: string | null;
  locale: string;
  copy: FilmCopy;
  map: FilmMapLayout;
  wall: WallLayout;
  open: OpenLayout | null;
};

const rectKey = (r: Rect) => `${Math.round(r.l)},${Math.round(r.t)},${Math.round(r.r)},${Math.round(r.b)}`;

function textRect(domElement: Element, stage: DOMRect): Rect {
  const range = document.createRange();
  range.selectNodeContents(domElement);
  const r = range.getBoundingClientRect();
  return { l: r.left - stage.left, t: r.top - stage.top, r: r.right - stage.left, b: r.bottom - stage.top };
}

function aroundNumber(text: string, count: number, locale: string, ink: LabelSegment['ink']): LabelSegment[] {
  const number = new Intl.NumberFormat(locale).format(count);
  const at = text.indexOf(number);
  if (at < 0) return [{ text, ink: 'secondary' }];
  return [
    { text: text.slice(0, at), ink: 'secondary' as const },
    { text: number, ink },
    { text: text.slice(at + number.length), ink: 'secondary' as const },
  ].filter((seg) => seg.text.length > 0);
}

export function FilmSection({ graph }: { graph: StageGraph }) {
  const t = useTranslations('download.film');
  const dial = useTranslations('mapDial');
  const locale = useLocale();
  const vault = useMemo(() => readFilmVault(graph), [graph]);
  const pick = useMemo(() => pickFilmConcept(vault), [vault]);
  const counts = { concepts: graph.nodes.length, relations: graph.edges.length, count: graph.nodes.length };
  const copy = useMemo<FilmCopy>(
    () => ({
      units: (capabilities, elements) => dial('units', { capabilities, elements }),
      reach: (needs, neededBy) => [
        ...aroundNumber(dial('reachNeeds', { count: needs }), needs, locale, 'arc'),
        { text: ' · ', ink: 'secondary' },
        ...aroundNumber(dial('reachNeededBy', { count: neededBy }), neededBy, locale, 'reach'),
      ],
      agent: 'Claude Code',
      tool: 'get_concepts',
    }),
    [dial, locale],
  );
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const column = useRef<HTMLHeadingElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const captions = useRef<(HTMLLIElement | null)[]>([]);
  const heads = useRef<(HTMLHeadingElement | null)[]>([]);
  const bodies = useRef<(HTMLParagraphElement | null)[]>([]);
  const fills = useRef<(HTMLSpanElement | null)[]>([]);
  const bar = useRef<HTMLDivElement>(null);
  const seek = useRef<(act: number) => void>(() => {});
  /* The film's layout searches hundreds of placements; it outlives the effect, which runs again once the film starts. */
  const laid = useRef<LaidOut | null>(null);
  const [film, setFilm] = useState(false);

  useEffect(() => {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') return;
    const id = requestAnimationFrame(() => setFilm(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const canvasElement = canvas.current;
    const host = stage.current;
    const ctx = canvasElement?.getContext('2d');
    if (!canvasElement || !host || !ctx || vault.domains.length === 0) return;
    const marks = readMarkTokens();
    const inks = readInks(ctx, marks.restHue);
    const sans = getComputedStyle(document.body).fontFamily;
    const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'ui-monospace, monospace';
    const sprites = new Map([inks.rest, inks.project].map((ink) => [ink, lightSprite(ink)]));
    const widths = new Map<string, number>();
    const measure = (text: string, font: string) => {
      const key = `${font}|${text}`;
      let w = widths.get(key);
      if (w === undefined) {
        ctx.font = font;
        w = ctx.measureText(text).width;
        widths.set(key, w);
      }
      return w;
    };
    let scene: FilmPaintScene | null = null;
    let sceneFrom: LaidOut | null = null;
    let size = { w: 0, h: 0, dpr: 1 };
    let stopWarm = () => {};
    let shown = film ? 0 : FILM_MS;
    let veil = 1;
    let pendingSeek: number | null = null;
    const time = createFilmClock(ACT_SPANS, [...ACT_MS], { holdMs: HOLD_MS, fadeMs: FADE_MS });
    let probe: FilmProbe | null = null;
    let frozen: number | null = null;

    const paint = () => {
      if (!scene) return;
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      scene.record = probe ? probe.recorder : null;
      paintFilm(ctx, scene, shown, size.w, size.h);
      scene.record = null;
      const light = film ? (isMotionPaused() || frozen !== null ? 1 : seamLight(time.elapsed(), CYCLE_MS) * veil) : 1;
      canvasElement.style.opacity = String(light);
      probe?.frame(shown, light);
      if (!film) return;
      const T = Math.min(shown, FILM_MS);
      captions.current.forEach((caption, i) => {
        const head = heads.current[i];
        const body = bodies.current[i];
        if (!caption || !head) return;
        const start = ACT_START[i]!;
        const end = start + ACT_MS[i]!;
        const out = i === ACT_MS.length - 1 ? 0 : easeInOut(clamp01((T - (end - 200)) / 200));
        const into = T < start ? 0 : easeOut(clamp01((T - start) / 240));
        const intoBody = T < start ? 0 : easeOut(clamp01((T - start - 40) / 240));
        const fade = (1 - out) * light;
        head.style.opacity = String(into * fade);
        head.style.transform = `translateY(${(1 - into) * 12}px)`;
        if (body) {
          body.style.opacity = String(intoBody * fade);
          body.style.transform = `translateY(${(1 - intoBody) * 12}px)`;
        }
        caption.style.visibility = Math.max(into, intoBody) * fade > 0.01 ? 'visible' : 'hidden';
      });
      const act = time.act();
      fills.current.forEach((fill, i) => {
        if (!fill) return;
        fill.style.transform = `scaleX(${i < act ? 1 : i > act ? 0 : clamp01((T - ACT_START[i]!) / ACT_MS[i]!)})`;
      });
    };

    const relayout = () => {
      const w = canvasElement.clientWidth;
      const h = canvasElement.clientHeight;
      if (w === 0 || h === 0) return;
      /* The backing store stays under six million pixels, so a large screen draws as fast as a laptop. */
      const dpr = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(6e6 / Math.max(1, w * h)));
      const box = host.getBoundingClientRect();
      const title = column.current ? column.current.getBoundingClientRect() : null;
      const titleRect: Rect = title
        ? { l: title.left - box.left, t: title.top - box.top, r: title.right - box.left, b: title.bottom - box.top }
        : { l: 0, t: 0, r: w, b: 96 };
      let caption: Rect = { l: titleRect.l, t: h, r: titleRect.l, b: h };
      const texts = [...heads.current, ...bodies.current].filter((node): node is HTMLHeadingElement | HTMLParagraphElement => node != null);
      /* Measured where the captions rest, not where an entrance has them for a moment. */
      const moved = texts.map((node) => node.style.transform);
      texts.forEach((node) => (node.style.transform = ''));
      const parts = texts.map((node) => textRect(node, box));
      texts.forEach((node, i) => (node.style.transform = moved[i]!));
      const nav = bar.current?.getBoundingClientRect();
      if (nav && nav.width > 0) parts.push({ l: nav.left - box.left, t: nav.top - box.top, r: nav.right - box.left, b: nav.bottom - box.top });
      if (parts.length) {
        caption = parts.reduce((a, b) => ({ l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) }));
      }
      /* A resize, a font arriving or a new graph lays the map out again; anything else repaints the layout it has. */
      const key = [w, h, dpr, document.fonts?.status ?? '', rectKey(titleRect), rectKey(caption)].join('|');
      const kept = laid.current;
      const same = kept !== null && kept.key === key && kept.vault === vault && kept.pick === pick && kept.locale === locale && kept.copy === copy;
      if (same && sceneFrom === kept) return;
      canvasElement.width = Math.round(w * dpr);
      canvasElement.height = Math.round(h * dpr);
      size = { w, h, dpr };
      const next = same ? kept : layOut(w, h, titleRect, caption, key);
      laid.current = next;
      sceneFrom = next;
      scene = buildFilmPaintScene(vault, next.map, next.wall, next.open, inks, new TextStamps(dpr), sprites, { sink: marks.sink, mono });
      probe?.layout(scene);
      stopWarm();
      if (film) {
        const warmed = scene;
        stopWarm = warmFilm((scratch, T) => paintFilm(scratch, warmed, T, w, h));
      }
      paint();
    };

    const layOut = (w: number, h: number, titleRect: Rect, caption: Rect, key: string): LaidOut => {
      widths.clear();
      const map: FilmMapLayout = layoutFilmMap({ vault, pick, w, h, locale, title: titleRect, caption, measure, sans, mono, tokens: marks, copy });
      const wall = layoutWall({
        vault,
        pick: map.pick,
        w,
        wide: map.sizes.wide,
        safe: map.sizes.safe,
        titleBox: map.titleBox,
        captionBox: map.captionBox,
        columnLeft: titleRect.l,
        measure,
        mono,
      });
      const open = map.pick ? layoutOpen({ vault, pick: map.pick, map, locale, columnLeft: titleRect.l, measure, sans, mono }) : null;
      return { key, vault, pick, locale, copy, map, wall, open };
    };

    if (new URLSearchParams(window.location.search).has('e2e')) {
      probe = mountFilmProbe(
        root.current,
        () => scene,
        (T) => {
          frozen = T;
          if (T !== null) {
            shown = T;
            paint();
          }
        },
      );
    }
    const observer = new ResizeObserver(relayout);
    observer.observe(canvasElement);
    relayout();
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) relayout();
    });
    if (!film) {
      return () => {
        alive = false;
        observer.disconnect();
        probe?.unmount();
      };
    }

    const unregister = registerGatedFrameClient(
      host,
      ({ dtMs, factor }) => {
        /* A visitor who stopped moving sees the film to its end, where it rests on the last frame. */
        if (factor < 1 && time.resting()) return;
        if (frozen !== null) return;
        const started = performance.now();
        if (pendingSeek !== null) {
          veil = Math.max(0, veil - dtMs / SEEK_FADE_MS);
          if (veil <= 0) {
            time.seek(pendingSeek);
            pendingSeek = null;
          } else time.advance(dtMs);
        } else {
          time.advance(dtMs);
          veil = Math.min(1, veil + dtMs / SEEK_FADE_MS);
        }
        shown = time.elapsed();
        paint();
        probe?.cost(performance.now() - started);
      },
      undefined,
      { keepAwake: true },
    );
    const settle = (act: number) => {
      time.seek(act);
      time.advance(ACT_MS[act]! * SETTLE - (act === 0 ? FADE_MS : 0));
      return time.elapsed();
    };
    seek.current = (act) => {
      if (isMotionPaused()) {
        shown = settle(act);
        veil = 1;
        paint();
        return;
      }
      pendingSeek = act;
    };
    const offPause = subscribeMotionPause(() => {
      if (!isMotionPaused()) return;
      /* A film paused before it began would hold a dark first frame: show its first act instead. */
      if (time.elapsed() === 0) shown = settle(0);
      paint();
    });
    if (isMotionPaused()) {
      shown = settle(0);
      paint();
    }
    return () => {
      alive = false;
      observer.disconnect();
      stopWarm();
      unregister();
      offPause();
      probe?.unmount();
      seek.current = () => {};
    };
  }, [film, vault, pick, locale, copy]);

  const lastAct = ACTS[ACTS.length - 1];

  return (
    <div
      ref={root}
      role="region"
      aria-labelledby="gateway-film-title"
      data-testid="gateway-film"
      data-gateway-film={film ? 'playing' : 'still'}
      className="relative mt-[var(--gateway-section-gap)] w-full"
    >
      <div ref={stage} className="relative h-[100svh] max-h-[60rem] min-h-[36rem] w-full overflow-hidden">
        <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" />
        <div className={cn(PAGE_GUTTER, 'pointer-events-none absolute inset-x-0 top-[4.5rem]')}>
          <h2
            ref={column}
            id="gateway-film-title"
            className={cn(PAGE_COLUMN, 'text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]')}
          >
            {t('label')}
          </h2>
        </div>
        <div aria-hidden={film ? undefined : true} className={cn(PAGE_GUTTER, 'pointer-events-none absolute inset-x-0 bottom-[5svh]')}>
          <div className={cn(PAGE_COLUMN, 'flex flex-col items-start')}>
            <ol className="grid w-full">
              {ACTS.map((act, i) => (
                <li
                  key={act}
                  ref={(node) => {
                    captions.current[i] = node;
                  }}
                  className={cn('flex max-w-[40rem] flex-col self-end [grid-area:1/1]', film || act !== lastAct ? 'invisible' : null)}
                >
                  <h3
                    ref={(node) => {
                      heads.current[i] = node;
                    }}
                    className={cn(
                      '[text-wrap:balance] text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)] sm:text-hero-lg',
                      film ? 'opacity-0' : null,
                    )}
                  >
                    {t(`acts.${act}.title`, counts)}
                  </h3>
                  {act === lastAct ? (
                    <p
                      ref={(node) => {
                        bodies.current[i] = node;
                      }}
                      className={cn('mt-3 max-w-[30rem] text-title leading-title text-[color:var(--color-text-secondary)]', film ? 'opacity-0' : null)}
                    >
                      {t(`acts.${lastAct}.caption`, counts)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
            <div ref={bar} className={cn('mt-6', film ? 'pointer-events-auto' : 'invisible')}>
              <FilmActBar
                titles={ACTS.map((act) => t(`acts.${act}.title`, counts))}
                label={t('actsLabel')}
                fills={fills}
                onSeek={(act) => seek.current(act)}
                align="start"
              />
            </div>
          </div>
        </div>
      </div>
      {film ? null : (
        <div className={PAGE_GUTTER}>
          <ol className={cn(PAGE_COLUMN, 'mt-8 grid gap-6 @container sm:grid-cols-2 lg:grid-cols-4')}>
            {ACTS.map((act) => (
              <li key={act} className="min-w-0">
                <h3 className="text-title leading-title text-[color:var(--color-text-primary)]">{t(`acts.${act}.title`, counts)}</h3>
                <p className="mt-2 text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
                  {t(`acts.${act}.body`, counts)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function warmFilm(draw: (ctx: CanvasRenderingContext2D, T: number) => void): () => void {
  const scratch = document.createElement('canvas');
  scratch.width = 300;
  scratch.height = 300;
  const ctx = scratch.getContext('2d');
  if (!ctx) return () => {};
  let T = 0;
  let handle = 0;
  const idle = typeof requestIdleCallback === 'function';
  const slice = (deadline?: IdleDeadline) => {
    const until = performance.now() + 6;
    while (T <= FILM_MS && (deadline ? deadline.timeRemaining() > 2 : performance.now() < until)) {
      draw(ctx, T);
      T += 100;
    }
    if (T <= FILM_MS) handle = idle ? requestIdleCallback(slice, { timeout: 400 }) : window.setTimeout(slice, 16);
  };
  handle = idle ? requestIdleCallback(slice, { timeout: 400 }) : window.setTimeout(slice, 16);
  return () => (idle ? cancelIdleCallback(handle) : window.clearTimeout(handle));
}
