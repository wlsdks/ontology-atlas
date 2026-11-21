'use client';

import { useEffect, useMemo, useRef } from 'react';

import { isMotionPaused, subscribeMotionPause } from '@/shared/motion/motion-pause';
import { cn } from '@/shared/lib/cn';
import { FONT_WEIGHT } from '@/shared/ui/tokens/font-weight';

import {
  branchRoute,
  bundledRelations,
  bundleRoute,
  pointAlong,
  traceRoute,
  type Point,
  type Route,
} from '../lib/closing-map';
import { buildFilmScene, labelBox, placeLabels, type FilmScene } from '../lib/film/film-scene';
import { easeInOut, easeOut, lerp } from '../lib/film/timeline/film-easing';
import { registerGatedFrameClient } from '../lib/page-motion/gateway-frame-loop';
import type { StageGraph } from '../lib/stage-graph';

const DRAW_MS = 1800;
const PULSES = 7;
const PULSE_PERIOD_MS = 4200;
const PULSE_TRAVEL_MS = 2800;
const PULSE_TRAIL = 0.14;
const BREATH_MS = 5200;
const PRESENCE_MS = 900;
const SPRITE = 256;

interface Palette {
  ink: string;
  secondary: string;
  tertiary: string;
  ground: string;
  indigo: string;
  bright: string;
  amber: string;
  sans: string;
  /** Rem-based type steps in CSS px, read once: canvas text cannot resolve `var()`. */
  title: number;
  bodyLg: number;
  body: number;
}

function readPalette(): Palette {
  const root = getComputedStyle(document.documentElement);
  const v = (name: string) => root.getPropertyValue(name).trim();
  const rem = parseFloat(root.fontSize) || 16;
  const step = (name: string) => (parseFloat(v(name)) || 1) * rem;
  return {
    ink: v('--color-text-primary'),
    secondary: v('--color-text-secondary'),
    tertiary: v('--color-text-tertiary'),
    ground: v('--color-canvas'),
    indigo: v('--map-indigo'),
    bright: v('--map-indigo-bright'),
    amber: v('--map-amber-hub'),
    sans: getComputedStyle(document.body).fontFamily,
    title: step('--text-title'),
    bodyLg: step('--text-body-lg'),
    body: step('--text-body'),
  };
}

function softSprite(color: string): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = SPRITE;
  sprite.height = SPRITE;
  const ctx = sprite.getContext('2d');
  if (!ctx) return sprite;
  const c = SPRITE / 2;
  for (const [reach, alpha] of [
    [1, 0.34],
    [0.6, 0.4],
    [0.28, 0.5],
  ] as const) {
    const g = ctx.createRadialGradient(c, c, 0, c, c, c * reach);
    g.addColorStop(0, color);
    g.addColorStop(1, 'transparent');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SPRITE, SPRITE);
  }
  return sprite;
}

interface Sprites {
  amber: HTMLCanvasElement;
  bright: HTMLCanvasElement;
  ground: HTMLCanvasElement;
}

interface Label {
  i: number;
  x: number;
  y: number;
  align: CanvasTextAlign;
  font: string;
  color: string;
  w: number;
  h: number;
}

interface Layout {
  wide: boolean;
  root: number;
  hub: Point;
  orbit: number;
  squash: number;
  at: Point[];
  mark: number[];
  land: number[];
  branches: { route: Route; tier: 1 | 2 | 3; from: number }[];
  bundles: { route: Route; begin: number; crosses: boolean }[];
  pools: { i: number; r: number }[];
  labels: Label[];
}

function markRadius(kind: string, degree: number): number {
  if (kind === 'project') return 6.5;
  if (kind === 'domain') return 5;
  if (kind === 'capability') return Math.min(4.4, 1.9 + 0.42 * Math.sqrt(degree));
  return 1.25;
}

function layoutMap(ctx: CanvasRenderingContext2D, scene: FilmScene, palette: Palette, w: number, h: number): Layout {
  const wide = w >= 520;
  const shrink = wide ? 1 : 0.85;
  const hub = { x: w / 2, y: h / 2 };
  let sx = w / 2 - (wide ? 64 : 30);
  let sy = h / 2 - (wide ? 44 : 30);
  /* Kept near round: a flattened tree reads as a smear, a stretched one as a diagram. */
  sx = Math.min(sx, sy * 1.28);
  sy = Math.min(sy, sx);
  const at = scene.nodes.map((node) => ({ x: hub.x + node.x * sx, y: hub.y + node.y * sy }));
  const mark = scene.nodes.map((node) => markRadius(node.kind, node.degree) * shrink);

  const rootIndex = scene.nodes.findIndex((node) => node.depth === 0);
  const firstRing = scene.nodes
    .map((node, i) => ({ node, i }))
    .filter(({ node }) => node.depth === 1)
    .sort((a, b) => Math.atan2(a.node.y, a.node.x) - Math.atan2(b.node.y, b.node.x))
    .map(({ i }) => i);
  const land = scene.nodes.map(() => 0);
  const byDepth = scene.nodes.map((_, i) => i).sort((a, b) => scene.nodes[a]!.depth - scene.nodes[b]!.depth);
  for (const i of byDepth) {
    const node = scene.nodes[i]!;
    if (node.depth === 0) land[i] = 0;
    else if (node.depth === 1) land[i] = 0.12 + 0.05 * firstRing.indexOf(i);
    else land[i] = land[node.parent]! + (node.depth === 2 ? 0.15 : 0.12) + node.seed * 0.08;
  }

  const branches = scene.nodes.flatMap((node, i) =>
    node.depth === 0 ? [] : [{ route: branchRoute(i, node.parent, at, hub, node.depth === 1 ? 0 : 0.42), tier: Math.min(3, node.depth) as 1 | 2 | 3, from: node.parent }],
  );
  const bundles = bundledRelations(scene).map(({ from, to, path, crosses }) => ({
    route: bundleRoute(from, to, path.map((i) => at[i]!)),
    begin: Math.min(0.68, Math.max(land[from]!, land[to]!) + 0.06),
    crosses,
  }));

  const pools = firstRing.map((d) => {
    let reach = 0;
    scene.nodes.forEach((node, i) => {
      if (node.cluster === d && i !== d) reach = Math.max(reach, Math.hypot(at[i]!.x - at[d]!.x, at[i]!.y - at[d]!.y));
    });
    return { i: d, r: Math.max(40, reach * 1.35) };
  });

  const nameSize = wide ? palette.title : palette.bodyLg;
  const strong = `${FONT_WEIGHT.strong} ${nameSize}px ${palette.sans}`;
  const quiet = `${FONT_WEIGHT.signature} ${palette.body}px ${palette.sans}`;
  const hubs = rootIndex >= 0 ? [rootIndex, ...firstRing] : firstRing;
  ctx.font = strong;
  const requests = hubs.map((i) => {
    const p = at[i]!;
    const ox = p.x - hub.x;
    const oy = p.y - hub.y;
    const n = Math.hypot(ox, oy) || 1;
    return {
      x: p.x,
      y: p.y,
      r: mark[i]! + 6,
      w: ctx.measureText(scene.nodes[i]!.label).width,
      h: nameSize + 4,
      out: n < 1 ? { x: 0, y: 1 } : { x: ox / n, y: oy / n },
    };
  });
  const spots = placeLabels(requests, { gap: 8, bounds: { l: 6, t: 4, r: w - 6, b: h - 4 } });
  const labels: Label[] = hubs.map((i, k) => ({
    i,
    x: at[i]!.x + spots[k]!.dx,
    y: at[i]!.y + spots[k]!.dy,
    align: spots[k]!.align as CanvasTextAlign,
    font: strong,
    color: palette.ink,
    w: requests[k]!.w,
    h: requests[k]!.h,
  }));

  /*
   * On a wide map, one capability per domain is named, on the side away from its domain, so the
   * two names never read as one phrase; the busiest whose name lands clear of every other wins.
   */
  if (wide) {
    ctx.font = quiet;
    const gap = 12;
    const boxes = labels.map((l) => labelBox(l.x, l.y, l.w, l.h, l.align as 'start' | 'center' | 'end'));
    const clear = (box: { l: number; t: number; r: number; b: number }) =>
      box.l > 6 && box.r < w - 6 && box.t > 4 && box.b < h - 4 &&
      boxes.every((o) => box.r + gap < o.l || box.l - gap > o.r || box.b + gap < o.t || box.t - gap > o.b) &&
      hubs.every((i) => Math.max(box.l - at[i]!.x, 0, at[i]!.x - box.r) ** 2 + Math.max(box.t - at[i]!.y, 0, at[i]!.y - box.b) ** 2 > (mark[i]! + 10) ** 2);
    for (const d of firstRing) {
      const candidates = scene.nodes
        .map((node, i) => ({ node, i }))
        .filter(({ node }) => node.depth === 2 && node.cluster === d && node.kind === 'capability')
        .sort((x, y) => y.node.degree - x.node.degree || x.node.id.localeCompare(y.node.id))
        .slice(0, 4);
      for (const { i } of candidates) {
        const ox = at[i]!.x - at[d]!.x;
        const oy = at[i]!.y - at[d]!.y;
        const n = Math.hypot(ox, oy) || 1;
        const dx = ox / n;
        const dy = oy / n;
        const align: CanvasTextAlign = dx > 0.4 ? 'start' : dx < -0.4 ? 'end' : 'center';
        const lw = ctx.measureText(scene.nodes[i]!.label).width;
        const lh = palette.body + 4;
        const reach = mark[i]! + 8;
        const x = at[i]!.x + dx * reach;
        const y = at[i]!.y + dy * reach + (align === 'center' ? Math.sign(dy) * (lh / 2) : 0);
        const box = labelBox(x, y, lw, lh, align as 'start' | 'center' | 'end');
        if (!clear(box)) continue;
        boxes.push(box);
        labels.push({ i, x, y, align, font: quiet, color: palette.tertiary, w: lw, h: lh });
        break;
      }
    }
  }

  const orbit = firstRing.length > 1 ? firstRing.reduce((sum, d) => sum + Math.hypot(scene.nodes[d]!.x, scene.nodes[d]!.y), 0) / firstRing.length * sy : 0;
  return { wide, root: rootIndex, hub, orbit, squash: sx / sy, at, mark, land, branches, bundles, pools, labels };
}

function drawMap(ctx: CanvasRenderingContext2D, scene: FilmScene, L: Layout, P: Palette, S: Sprites, scratch: Point, w: number, h: number, u: number) {
  ctx.clearRect(0, 0, w, h);
  const root = L.root;

  ctx.globalCompositeOperation = 'lighter';
  const core = easeOut(u / 0.3);
  if (core > 0) {
    const r = Math.min(w, h) * 0.34;
    ctx.globalAlpha = 0.3 * core;
    ctx.drawImage(S.amber, L.hub.x - r, L.hub.y - r, r * 2, r * 2);
  }
  for (let k = 0; k < L.pools.length; k += 1) {
    const { i, r } = L.pools[k]!;
    const a = easeOut((u - L.land[i]!) / 0.4);
    if (a <= 0) continue;
    ctx.globalAlpha = 0.3 * a;
    ctx.drawImage(S.bright, L.at[i]!.x - r, L.at[i]!.y - r, r * 2, r * 2);
  }

  ctx.lineWidth = 1;
  ctx.strokeStyle = P.bright;
  for (let k = 0; k < L.bundles.length; k += 1) {
    const { route, begin, crosses } = L.bundles[k]!;
    const g = easeInOut((u - begin) / 0.3);
    if (g <= 0) continue;
    ctx.globalAlpha = crosses ? 0.13 : 0.1;
    ctx.beginPath();
    traceRoute(ctx, route, 0, g, scratch);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  const orbit = easeInOut((u - 0.1) / 0.5);
  if (orbit > 0 && L.orbit > 0) {
    ctx.globalAlpha = 0.09;
    ctx.strokeStyle = P.secondary;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(L.hub.x, L.hub.y, L.orbit * L.squash, L.orbit, 0, -Math.PI / 2, -Math.PI / 2 + orbit * Math.PI * 2);
    ctx.stroke();
  }

  for (let pass = 0; pass < 5; pass += 1) {
    const tier = pass < 2 ? 1 : pass < 4 ? 2 : 3;
    const under = pass === 0 || pass === 2;
    ctx.strokeStyle = tier === 1 ? P.amber : tier === 2 ? P.bright : P.secondary;
    ctx.globalAlpha = under ? 0.08 : tier === 1 ? 0.55 : tier === 2 ? 0.46 : 0.15;
    ctx.lineWidth = under ? (tier === 1 ? 5 : 3.5) : tier === 1 ? 1.4 : tier === 2 ? 1.1 : 0.8;
    ctx.beginPath();
    for (let k = 0; k < L.branches.length; k += 1) {
      const b = L.branches[k]!;
      if (b.tier !== tier) continue;
      const start = L.land[b.from]! + 0.02;
      const g = easeInOut((u - start) / Math.max(0.08, L.land[b.route.to]! - start));
      if (g > 0) traceRoute(ctx, b.route, 0, g, scratch);
    }
    ctx.stroke();
  }

  for (let depth = 3; depth >= 0; depth -= 1) {
    for (let i = 0; i < scene.nodes.length; i += 1) {
      const node = scene.nodes[i]!;
      if (Math.min(3, node.depth) !== depth) continue;
      const a = easeOut((u - L.land[i]!) / 0.16);
      if (a <= 0) continue;
      const { x, y } = L.at[i]!;
      const r = L.mark[i]! * lerp(0.35, 1, a);
      if (node.kind === 'element') {
        ctx.globalAlpha = 0.62 * a;
        ctx.fillStyle = P.secondary;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const project = i === root;
      const hubMark = node.depth <= 1;
      ctx.globalCompositeOperation = 'lighter';
      const halo = project ? 52 : hubMark ? 38 : r * 5.5;
      ctx.globalAlpha = (project ? 0.85 : hubMark ? 0.7 : 0.4) * a;
      ctx.drawImage(project ? S.amber : S.bright, x - halo, y - halo, halo * 2, halo * 2);
      ctx.globalCompositeOperation = 'source-over';
      if (hubMark) {
        ctx.globalAlpha = 0.42 * a;
        ctx.strokeStyle = project ? P.amber : P.bright;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r + (project ? 7 : 5), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = project ? P.amber : P.bright;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (hubMark || node.degree >= 8) {
        ctx.fillStyle = P.ink;
        ctx.beginPath();
        ctx.arc(x, y, r * (hubMark ? 0.42 : 0.38), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.textBaseline = 'middle';
  for (let k = 0; k < L.labels.length; k += 1) {
    const label = L.labels[k]!;
    const a = easeOut((u - L.land[label.i]! - 0.1) / 0.22);
    if (a <= 0) continue;
    const y = label.y + (1 - a) * 6;
    const cx = label.align === 'center' ? label.x : label.align === 'start' ? label.x + label.w / 2 : label.x - label.w / 2;
    ctx.globalAlpha = 0.92 * a;
    ctx.drawImage(S.ground, cx - label.w * 0.9, y - label.h * 1.6, label.w * 1.8, label.h * 3.2);
    ctx.globalAlpha = a;
    ctx.font = label.font;
    ctx.textAlign = label.align;
    ctx.fillStyle = label.color;
    ctx.fillText(scene.nodes[label.i]!.label, label.x, y);
  }
  ctx.textAlign = 'start';
  ctx.globalAlpha = 1;
}

function drawSignals(ctx: CanvasRenderingContext2D, scene: FilmScene, L: Layout, P: Palette, S: Sprites, scratch: Point, w: number, h: number, clock: number, presence: number) {
  ctx.clearRect(0, 0, w, h);
  if (presence <= 0.002 || L.bundles.length === 0) return;
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < scene.nodes.length; i += 1) {
    const node = scene.nodes[i]!;
    if (node.depth > 1) continue;
    const breath = 0.5 + 0.5 * Math.sin((clock / BREATH_MS) * Math.PI * 2 + i * 1.7);
    const r = node.depth === 0 ? 64 : 46;
    ctx.globalAlpha = presence * 0.22 * breath;
    ctx.drawImage(node.depth === 0 ? S.amber : S.bright, L.at[i]!.x - r, L.at[i]!.y - r, r * 2, r * 2);
  }

  ctx.strokeStyle = P.bright;
  for (let k = 0; k < PULSES; k += 1) {
    const local = clock / PULSE_PERIOD_MS + k / PULSES;
    const cycle = Math.floor(local);
    const f = ((local - cycle) * PULSE_PERIOD_MS) / PULSE_TRAVEL_MS;
    if (f >= 1) continue;
    const pick = L.bundles[((cycle * PULSES + k) * 7919 + k * 31) % L.bundles.length]!;
    const t = easeInOut(f);
    const fade = presence * Math.sin(Math.PI * f);
    for (let s = 1; s <= 3; s += 1) {
      ctx.globalAlpha = 0.3 * fade;
      ctx.lineWidth = 0.9 + s * 0.5;
      ctx.beginPath();
      traceRoute(ctx, pick.route, Math.max(0, t - (PULSE_TRAIL * s) / 3), t, scratch);
      ctx.stroke();
    }
    pointAlong(pick.route, t, scratch);
    ctx.globalAlpha = fade;
    ctx.drawImage(S.bright, scratch.x - 14, scratch.y - 14, 28, 28);
    ctx.fillStyle = P.ink;
    ctx.beginPath();
    ctx.arc(scratch.x, scratch.y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/**
 * The film's last wide frame beside the closing headline: this repository's real map. The core
 * lights, the containment tree grows outward to every concept, and the remaining relations
 * gather into bundles along it; then signals travel those bundles while the hubs breathe. The
 * signal layer is a second, 1x canvas, so a living frame redraws only light, never the map.
 * Under reduced motion the rested map is drawn once; with the page's motion paused the map rests
 * and the signals stop. The headline says the same thing in words, so it is hidden from
 * assistive technology.
 */
export function ClosingMap({ graph, className }: { graph: StageGraph; className?: string }) {
  const scene = useMemo(() => buildFilmScene(graph), [graph]);
  const mapCanvas = useRef<HTMLCanvasElement>(null);
  const signalCanvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasElement = mapCanvas.current;
    const glowElement = signalCanvas.current;
    const ctx = canvasElement?.getContext('2d');
    const glow = glowElement?.getContext('2d');
    if (!canvasElement || !glowElement || !ctx || !glow || scene.nodes.length === 0) return;
    const palette = readPalette();
    const sprites: Sprites = { amber: softSprite(palette.amber), bright: softSprite(palette.bright), ground: softSprite(palette.ground) };
    const scratch: Point = { x: 0, y: 0 };
    const still =
      (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) ||
      typeof IntersectionObserver === 'undefined';
    let elapsed = still || isMotionPaused() ? DRAW_MS : 0;
    let clock = 0;
    let presence = 0;
    let w = 0;
    let h = 0;
    let layout: Layout | null = null;

    const paintMap = () => {
      if (layout && w > 0 && h > 0) drawMap(ctx, scene, layout, palette, sprites, scratch, w, h, elapsed / DRAW_MS);
    };
    const paintSignals = () => {
      if (layout && w > 0 && h > 0) drawSignals(glow, scene, layout, palette, sprites, scratch, w, h, clock, presence);
    };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvasElement.clientWidth;
      h = canvasElement.clientHeight;
      canvasElement.width = Math.round(w * dpr);
      canvasElement.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* Soft light only, so one device pixel per CSS pixel is enough and costs a quarter. */
      glowElement.width = Math.round(w);
      glowElement.height = Math.round(h);
      layout = layoutMap(ctx, scene, palette, w, h);
      paintMap();
      paintSignals();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvasElement);
    resize();
    if (still) {
      paintMap();
      return () => observer.disconnect();
    }

    let stopDraw = () => {};
    const finishDraw = () => {
      elapsed = DRAW_MS;
      paintMap();
      stopDraw();
    };
    if (elapsed < DRAW_MS) {
      stopDraw = registerGatedFrameClient(
        canvasElement,
        ({ dtMs }) => {
          elapsed = Math.min(DRAW_MS, elapsed + dtMs);
          paintMap();
          if (elapsed >= DRAW_MS) stopDraw();
        },
        undefined,
        /* It finishes its draw-in and rests itself, so a still visitor never keeps a half-drawn map. */
        { keepAwake: true },
      );
    }
    const stopSignals = registerGatedFrameClient(
      glowElement,
      ({ dtMs, factor }) => {
        if (elapsed < DRAW_MS) return;
        clock += dtMs * factor;
        presence = Math.min(factor, presence + dtMs / PRESENCE_MS);
        paintSignals();
      },
      (live) => {
        if (!live) presence = 0;
      },
    );
    const offPause = subscribeMotionPause(() => {
      if (!isMotionPaused()) return;
      finishDraw();
      presence = 0;
      paintSignals();
    });
    return () => {
      observer.disconnect();
      stopDraw();
      stopSignals();
      offPause();
    };
  }, [scene]);

  return (
    <div aria-hidden data-testid="gateway-closing-map" className={cn('relative min-w-0', className)}>
      <canvas ref={mapCanvas} className="absolute inset-0 h-full w-full" />
      <canvas ref={signalCanvas} className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}
