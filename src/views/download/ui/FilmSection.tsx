'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';

import { buildFilmScene, type FilmScene } from '../lib/film-scene';
import { registerGatedFrameClient } from '../lib/gateway-frame-loop';
import type { StageGraph } from '../lib/stage-graph';

const ACTS = [1, 2, 3, 4] as const;

/** Named files while they float, and named capabilities on the finished map: the most connected. */
const LABELLED_FILES = 34;
const LABELLED_CAPABILITIES = 10;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => {
  const x = clamp(v);
  return x * x * (3 - 2 * x);
};
const inOut = (v: number) => {
  const x = clamp(v);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

interface Palette {
  ink: string;
  dim: string;
  ground: string;
  card: string;
  edge: string;
  indigo: string;
  amber: string;
  sans: string;
  mono: string;
}

function readPalette(): Palette {
  const root = getComputedStyle(document.documentElement);
  const v = (name: string) => root.getPropertyValue(name).trim();
  return {
    ink: v('--color-text-primary'),
    dim: v('--color-text-tertiary'),
    ground: v('--color-canvas'),
    card: v('--color-panel'),
    edge: v('--color-border-strong'),
    indigo: v('--map-indigo-bright'),
    amber: v('--map-amber-hub'),
    sans: getComputedStyle(document.body).fontFamily,
    mono: v('--font-mono') || 'ui-monospace, monospace',
  };
}

/** A soft round light drawn once and stamped, since a canvas shadow per mark costs every frame. */
function glowSprite(color: string): HTMLCanvasElement {
  const size = 64;
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext('2d');
  if (!ctx) return sprite;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return sprite;
}

/**
 * One frame of the film at scroll progress `p` (0..1) and clock `time` (ms). Four acts of a
 * quarter each: the files float, each folds into a mark and flies to its place, the relations
 * draw with light running them, then the camera pulls back over the whole map.
 */
function drawFilm(
  ctx: CanvasRenderingContext2D,
  scene: FilmScene,
  labelled: ReadonlySet<number>,
  namedCapabilities: ReadonlySet<number>,
  farFirst: readonly number[],
  palette: Palette,
  glow: { indigo: HTMLCanvasElement; amber: HTMLCanvasElement },
  w: number,
  h: number,
  p: number,
  time: number,
) {
  ctx.clearRect(0, 0, w, h);
  const appear = smooth((p + 0.14) / 0.22);
  const fly = clamp((p - 0.22) / 0.3);
  const link = clamp((p - 0.48) / 0.27);
  const pull = inOut((p - 0.74) / 0.22);

  const cx = w / 2;
  const cy = h * 0.42;
  const unit = Math.min(w * 0.42, h * 0.42);
  const zoom = mix(1.18, 1, inOut(fly)) * mix(1, 0.92, pull);
  const turn = (1 - inOut(fly)) * 0.5 + pull * 0.1;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const spread = Math.min(w * 0.46, unit * 2.4);

  const at = new Array<{ x: number; y: number; r: number }>(scene.nodes.length);
  const radiusOf = (kind: string) => (kind === 'project' ? 7 : kind === 'domain' ? 5.5 : kind === 'capability' ? 3.4 : 2.4);

  /* Files and flight, farthest first so nearer files lie on top. */
  farFirst.forEach((i) => {
    const node = scene.nodes[i];
    const depth = 1 / (1 + node.gz * 0.9);
    const drift = (p * 0.6 - 0.1) * node.gz * unit * 0.5;
    const perspective = 0.78 + 0.22 * depth;
    const fx = cx + node.gx * spread * perspective - drift;
    const fy = cy + node.gy * unit * 0.95 * perspective;
    const mx = cx + (node.x * cos - node.y * sin) * unit * zoom;
    const my = cy + (node.x * sin + node.y * cos) * unit * zoom;
    const e = inOut(fly * 1.6 - node.order * 0.6);
    const arc = Math.sin(Math.PI * e) * unit * 0.22 * (node.seed - 0.5);
    const dx = mx - fx;
    const dy = my - fy;
    const len = Math.hypot(dx, dy) || 1;
    const x = mix(fx, mx, e) - (dy / len) * arc;
    const y = mix(fy, my, e) + (dx / len) * arc;
    const r = radiusOf(node.kind);
    at[i] = { x, y, r };

    const shown = clamp(appear * 1.8 - node.gz * 0.8);
    if (shown <= 0) return;
    const named = labelled.has(i) && depth > 0.5;
    const fontPx = Math.round(10 + 3 * depth);
    ctx.font = `${fontPx}px ${palette.mono}`;
    const cardW = named ? ctx.measureText(node.file).width + 32 : 70 + 50 * depth;
    const cardH = fontPx + 12;
    /* The paper folds to a mark early in its flight, so no half-folded block crosses the screen. */
    const fold = smooth(e * 2.2);
    const bw = mix(cardW, r * 2, fold);
    const bh = mix(cardH, r * 2, fold);
    const tone = node.kind === 'project' ? palette.amber : node.kind === 'element' ? palette.dim : palette.indigo;

    /* A short streak behind a mark in flight. */
    if (e > 0.02 && e < 0.98) {
      const back = inOut(fly * 1.6 - node.order * 0.6 - 0.07);
      const tx = mix(fx, mx, back);
      const ty = mix(fy, my, back);
      ctx.globalAlpha = 0.35 * Math.sin(Math.PI * e);
      ctx.strokeStyle = tone;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    const ink = shown * mix(0.3 + depth * 0.7, 1, e);
    ctx.beginPath();
    ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, mix(4, r, fold));
    /* A paper is opaque, so a file behind never shows through the one in front. */
    if (fold < 0.5) {
      ctx.globalAlpha = shown;
      ctx.fillStyle = palette.ground;
      ctx.fill();
    }
    ctx.globalAlpha = ink;
    ctx.fillStyle = fold < 0.5 ? palette.card : tone;
    ctx.fill();
    if (fold < 0.6) {
      ctx.globalAlpha = ink * (1 - fold / 0.6);
      ctx.strokeStyle = palette.edge;
      ctx.lineWidth = 1;
      ctx.stroke();
      /* The file's kind as a dot, its name beside it, as a file row reads in the app. */
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.arc(x - bw / 2 + 10, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (named) {
        ctx.fillStyle = palette.ink;
        ctx.textBaseline = 'middle';
        ctx.fillText(node.file, x - bw / 2 + 20, y + 0.5);
      } else {
        /* An unnamed file shows the shape of a line of text, not an empty box. */
        ctx.fillStyle = palette.dim;
        ctx.globalAlpha *= 0.45;
        ctx.fillRect(x - bw / 2 + 20, y - 1, (bw - 30) * (0.55 + node.seed * 0.4), 2);
      }
    }
  });

  /* Relations draw outward, then light runs them. */
  if (link > 0) {
    ctx.lineWidth = 1;
    for (const edge of scene.edges) {
      const grow = clamp((link * 1.35 - edge.reveal) * 3.5);
      if (grow <= 0) continue;
      const a = at[edge.from];
      const b = at[edge.to];
      ctx.globalAlpha = (edge.contains ? 0.16 : 0.26) * mix(1, 0.8, pull);
      ctx.strokeStyle = edge.contains ? palette.ink : palette.indigo;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(mix(a.x, b.x, grow), mix(a.y, b.y, grow));
      ctx.stroke();
    }
    const lit = clamp(link * 2 - 0.5);
    if (lit > 0) {
      const runs = Math.min(36, scene.edges.length);
      for (let k = 0; k < runs; k += 1) {
        const edge = scene.edges[(k * 7) % scene.edges.length];
        const phase = (time / 2600 + k * 0.173) % 1;
        const a = at[edge.from];
        const b = at[edge.to];
        const size = 18;
        ctx.globalAlpha = lit * Math.sin(Math.PI * phase);
        ctx.drawImage(glow.indigo, mix(a.x, b.x, phase) - size / 2, mix(a.y, b.y, phase) - size / 2, size, size);
      }
    }
  }

  /* Hubs breathe once they land. */
  scene.nodes.forEach((node, i) => {
    if (node.kind !== 'project' && node.kind !== 'domain') return;
    const landed = clamp(fly * 1.6 - node.order * 0.6 - 0.6);
    if (landed <= 0) return;
    const size = (node.kind === 'project' ? 64 : 44) * (1 + 0.08 * Math.sin(time / 900 + i));
    ctx.globalAlpha = landed * 0.75;
    ctx.drawImage(node.kind === 'project' ? glow.amber : glow.indigo, at[i].x - size / 2, at[i].y - size / 2, size, size);
  });

  /* Names of the large regions arrive with the pull back. */
  if (pull > 0) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    scene.nodes.forEach((node, i) => {
      const big = node.kind === 'project' || node.kind === 'domain';
      if (!big && !(node.kind === 'capability' && namedCapabilities.has(i))) return;
      ctx.globalAlpha = big ? pull : pull * 0.7;
      ctx.font = big ? `600 13px ${palette.sans}` : `11px ${palette.sans}`;
      /* A rim of the ground behind each name, so a line passing under it does not cut it. */
      ctx.strokeStyle = palette.ground;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeText(node.label, at[i].x, at[i].y + at[i].r + 6);
      ctx.fillStyle = big ? palette.ink : palette.dim;
      ctx.fillText(node.label, at[i].x, at[i].y + at[i].r + 6);
    });
    ctx.textAlign = 'start';
  }
  ctx.globalAlpha = 1;
}

/** Each caption holds its quarter, fading across the seams; the last one stays. */
function captionLight(act: number, p: number): number {
  const start = (act - 1) * 0.25;
  const fadeIn = act === 1 ? 1 : smooth((p - start + 0.02) / 0.06);
  const fadeOut = act === 4 ? 1 : 1 - smooth((p - start - 0.21) / 0.06);
  return Math.min(fadeIn, fadeOut);
}

/**
 * The page's film: while the visitor scrolls through a tall block, its stage stays pinned and the
 * repository's real concepts go from Markdown files to the map. Without a script or under reduced
 * motion the block is short, the finished map is one still frame and the four captions are a list.
 */
export function FilmSection({ graph }: { graph: StageGraph }) {
  const t = useTranslations('download.film');
  const scene = useMemo(() => buildFilmScene(graph), [graph]);
  const labelled = useMemo(() => {
    const ranked = graph.nodes.map((node, i) => ({ i, d: node.fullDegree })).sort((a, b) => b.d - a.d);
    return new Set(ranked.slice(0, LABELLED_FILES).map((entry) => entry.i));
  }, [graph]);
  const namedCapabilities = useMemo(() => {
    const ranked = graph.nodes
      .map((node, i) => ({ i, d: node.fullDegree, kind: node.kind }))
      .filter((entry) => entry.kind === 'capability')
      .sort((a, b) => b.d - a.d);
    return new Set(ranked.slice(0, LABELLED_CAPABILITIES).map((entry) => entry.i));
  }, [graph]);
  const block = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const captions = useRef<(HTMLLIElement | null)[]>([]);
  const [film, setFilm] = useState(false);

  useEffect(() => {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') return;
    const id = requestAnimationFrame(() => setFilm(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const el = canvas.current;
    const host = stage.current;
    const ctx = el?.getContext('2d');
    if (!el || !host || !ctx || scene.nodes.length === 0) return;
    const palette = readPalette();
    const farFirst = scene.nodes.map((_, i) => i).sort((a, b) => scene.nodes[b].gz - scene.nodes[a].gz);
    const glow = { indigo: glowSprite(palette.indigo), amber: glowSprite(palette.amber) };
    let w = 0;
    let h = 0;
    let shown = film ? 0 : 1;
    let clock = 0;

    const progress = () => {
      const outer = block.current;
      if (!film || !outer) return 1;
      const rect = outer.getBoundingClientRect();
      const travel = outer.offsetHeight - host.offsetHeight;
      return travel > 0 ? clamp(-rect.top / travel) : 1;
    };
    const paint = () => {
      drawFilm(ctx, scene, labelled, namedCapabilities, farFirst, palette, glow, w, h, shown, clock);
      if (!film) return;
      captions.current.forEach((caption, i) => {
        if (!caption) return;
        const light = captionLight(i + 1, shown);
        caption.style.opacity = String(light);
        caption.style.transform = `translateY(${(1 - light) * 12}px)`;
        caption.style.visibility = light > 0.01 ? 'visible' : 'hidden';
      });
    };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      shown = progress();
      paint();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    if (!film) return () => observer.disconnect();

    const unregister = registerGatedFrameClient(host, ({ t: now, dtMs }) => {
      clock = now;
      shown += (progress() - shown) * Math.min(1, dtMs / 110);
      paint();
    });
    return () => {
      observer.disconnect();
      unregister();
    };
  }, [film, scene, labelled, namedCapabilities]);

  const counts = { concepts: graph.nodes.length, relations: graph.edges.length };

  return (
    <div
      ref={block}
      role="region"
      aria-labelledby="gateway-film-title"
      data-testid="gateway-film"
      data-gateway-film={film ? 'playing' : 'still'}
      className={cn('relative mt-[var(--gateway-section-gap)] w-full', film && 'h-[380svh]')}
    >
      <h2 id="gateway-film-title" className="sr-only">
        {t('label')}
      </h2>
      <div
        ref={stage}
        className={cn(
          'relative w-full overflow-hidden',
          film ? 'sticky top-0 h-[100svh]' : cn(PAGE_GUTTER, 'h-[34rem]'),
        )}
      >
        <canvas ref={canvas} aria-hidden className="gateway-film-canvas absolute inset-0 h-full w-full" />
        {film ? <div aria-hidden className="gateway-film-vignette pointer-events-none absolute inset-0" /> : null}
        {film ? (
        <ol className="absolute inset-x-0 bottom-[9svh] grid place-items-center px-6">
          {ACTS.map((act, i) => (
            <li
              key={act}
              ref={(node) => {
                captions.current[i] = node;
              }}
              className="invisible flex max-w-[40rem] flex-col items-center text-center opacity-0 [grid-area:1/1]"
            >
              <span className="font-mono text-caption uppercase leading-caption tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-tertiary)]">
                {String(act).padStart(2, '0')} / 04
              </span>
              <h3 className="mt-3 [text-wrap:balance] text-hero-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">
                {t(`acts.${act}.title`)}
              </h3>
              <p className="mt-3 text-title leading-title text-[color:var(--color-text-secondary)]">
                {t(`acts.${act}.body`, counts)}
              </p>
            </li>
          ))}
        </ol>
        ) : null}
      </div>
      {film ? null : (
        <div className={PAGE_GUTTER}>
          <ol className={cn(PAGE_COLUMN, 'mt-8 grid gap-6 @container sm:grid-cols-2 lg:grid-cols-4')}>
            {ACTS.map((act) => (
              <li key={act} className="min-w-0">
                <span className="font-mono text-caption leading-caption text-[color:var(--color-text-tertiary)]">
                  {String(act).padStart(2, '0')}
                </span>
                <h3 className="mt-2 text-title leading-title text-[color:var(--color-text-primary)]">
                  {t(`acts.${act}.title`)}
                </h3>
                <p className="mt-1 text-body leading-body text-[color:var(--color-text-tertiary)]">
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
