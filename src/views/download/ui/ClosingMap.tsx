'use client';

import { useEffect, useMemo, useRef } from 'react';

import { isMotionPaused, subscribeMotionPause } from '@/shared/motion/motion-pause';
import { cn } from '@/shared/lib/cn';
import { FONT_WEIGHT } from '@/shared/ui/tokens/font-weight';

import { crossesClusters, buildFilmScene, type FilmScene } from '../lib/film-scene';
import { drawHitRing, drawKeyLight, easeInOut, easeOut, lerp, lightSprite } from '../lib/film-kit';
import { registerGatedFrameClient } from '../lib/gateway-frame-loop';
import type { StageGraph } from '../lib/stage-graph';

/** The whole drawing, from the hub's beat to the last name. */
const DRAW_MS = 1200;
/** Shares of the drawing: when the outermost mark starts, how long a mark and a line take. */
const REACH_SPAN = 0.6;
const MARK_SPAN = 0.22;
const LINE_SPAN = 0.26;
const NAME_LAG = 0.1;
const NAME_SPAN = 0.2;
const RISE_PX = 8;
const LINE_ALPHA = 0.3;
const KEY_LIGHT_ALPHA = 0.12;

interface Palette {
  ink: string;
  secondary: string;
  ground: string;
  indigo: string;
  amber: string;
  sans: string;
}

function readPalette(): Palette {
  const root = getComputedStyle(document.documentElement);
  const v = (name: string) => root.getPropertyValue(name).trim();
  return {
    ink: v('--color-text-primary'),
    secondary: v('--color-text-secondary'),
    ground: v('--color-canvas'),
    indigo: v('--map-indigo-bright'),
    amber: v('--map-amber-hub'),
    sans: getComputedStyle(document.body).fontFamily,
  };
}

interface Point {
  x: number;
  y: number;
}

interface Spot extends Point {
  align: CanvasTextAlign;
}

interface MapLayout {
  text: number;
  hub: Point;
  at: Point[];
  mark: number[];
  /** When each mark starts to land, 0..1 of the drawing, outward from the hub. */
  start: number[];
  names: { i: number; spot: Spot }[];
}

function markRadius(kind: string): number {
  return kind === 'project' ? 7 : kind === 'domain' ? 5.5 : kind === 'capability' ? 3.6 : 2.6;
}

/**
 * Where each name goes: under its mark if that space is free and inside the canvas, else above
 * or beside it. The film's own placement, kept small enough to copy.
 */
function placeNames(
  ctx: CanvasRenderingContext2D,
  order: readonly number[],
  at: readonly Point[],
  mark: readonly number[],
  text: number,
  nameOf: (i: number) => string,
  w: number,
  h: number,
): { i: number; spot: Spot }[] {
  const taken: { x: number; y: number; w: number; h: number }[] = [];
  const out: { i: number; spot: Spot }[] = [];
  for (const i of order) {
    const { x, y } = at[i]!;
    const r = mark[i]!;
    const bw = ctx.measureText(nameOf(i)).width;
    const bh = text + 4;
    const down = y + r + 6 + text / 2;
    const up = y - r - 6 - text / 2;
    const side = r + 8;
    const options: Spot[] = [
      { x, y: down, align: 'center' },
      { x, y: up, align: 'center' },
      { x: x + side, y, align: 'start' },
      { x: x - side, y, align: 'end' },
      { x: x + side, y: down, align: 'start' },
      { x: x - side, y: down, align: 'end' },
      { x: x + side, y: up, align: 'start' },
      { x: x - side, y: up, align: 'end' },
    ];
    const boxOf = (o: Spot) => ({
      x: o.align === 'center' ? o.x : o.align === 'start' ? o.x + bw / 2 : o.x - bw / 2,
      y: o.y,
      w: bw,
      h: bh,
    });
    const cost = (o: Spot) => {
      const b = boxOf(o);
      const outside =
        Math.max(0, 6 - (b.x - b.w / 2)) + Math.max(0, b.x + b.w / 2 - (w - 6)) +
        Math.max(0, 4 - (b.y - b.h / 2)) + Math.max(0, b.y + b.h / 2 - (h - 4));
      return (
        outside * 1000 +
        taken.reduce((sum, o2) => {
          const ox = (o2.w + b.w + 8) / 2 - Math.abs(o2.x - b.x);
          const oy = (o2.h + b.h + 4) / 2 - Math.abs(o2.y - b.y);
          return sum + (ox > 0 && oy > 0 ? ox * oy : 0);
        }, 0)
      );
    };
    let best = options[0]!;
    let least = Infinity;
    for (const o of options) {
      const c = cost(o);
      if (c < least) {
        best = o;
        least = c;
      }
      if (c === 0) break;
    }
    taken.push(boxOf(best));
    out.push({ i, spot: best });
  }
  return out;
}

function layoutMap(ctx: CanvasRenderingContext2D, scene: FilmScene, palette: Palette, w: number, h: number): MapLayout {
  const wide = w >= 420;
  const text = wide ? 15 : 13;
  const hub = { x: w / 2, y: h / 2 };
  /* Room on every side for a name under the outermost marks. */
  const sx = w / 2 - (wide ? 40 : 24);
  const sy = h / 2 - text - 18;
  const at = scene.nodes.map((node) => ({ x: hub.x + node.x * sx, y: hub.y + node.y * sy }));
  const mark = scene.nodes.map((node) => markRadius(node.kind) * (wide ? 1 : 0.85));
  const start = scene.nodes.map((node) => Math.hypot(node.x, node.y) * REACH_SPAN);

  const root = scene.nodes.findIndex((node) => node.depth === 0);
  const ring = scene.nodes
    .map((node, i) => ({ node, i }))
    .filter(({ node }) => node.depth === 1)
    .sort((a, b) => b.node.degree - a.node.degree)
    .slice(0, wide ? 7 : 4)
    .map(({ i }) => i);
  ctx.font = `${FONT_WEIGHT.strong} ${text}px ${palette.sans}`;
  const names = placeNames(
    ctx,
    root < 0 ? ring : [root, ...ring],
    at,
    mark,
    text,
    (i) => scene.nodes[i]!.label,
    w,
    h,
  );
  return { text, hub, at, mark, start, names };
}

/** A line from `a` toward `b`, drawn to fraction `t`, bowed by `bow` of its length away from `hub`. */
function traceLine(ctx: CanvasRenderingContext2D, a: Point, b: Point, t: number, bow: number, hub: Point) {
  ctx.moveTo(a.x, a.y);
  if (bow <= 0) {
    ctx.lineTo(lerp(a.x, b.x, t), lerp(a.y, b.y, t));
    return;
  }
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ox = mx - hub.x;
  const oy = my - hub.y;
  const n = Math.hypot(ox, oy) || 1;
  const c = { x: mx + (ox / n) * len * bow, y: my + (oy / n) * len * bow };
  /* The first `t` of a quadratic curve is itself a quadratic curve. */
  const c1 = { x: lerp(a.x, c.x, t), y: lerp(a.y, c.y, t) };
  ctx.quadraticCurveTo(c1.x, c1.y, lerp(c1.x, lerp(c.x, b.x, t), t), lerp(c1.y, lerp(c.y, b.y, t), t));
}

/** One frame at progress `u` (0..1): marks land outward from the hub, each line grows from its nearer end. */
function drawMap(
  ctx: CanvasRenderingContext2D,
  scene: FilmScene,
  L: MapLayout,
  palette: Palette,
  light: HTMLCanvasElement,
  w: number,
  h: number,
  u: number,
) {
  ctx.clearRect(0, 0, w, h);
  drawKeyLight(ctx, light, L.hub.x, L.hub.y, Math.min(w, h) * 0.5, KEY_LIGHT_ALPHA * easeOut(u / 0.5));

  /* Finished lines share one path per colour; only lines still growing are stroked one by one. */
  ctx.lineWidth = 1;
  ctx.globalAlpha = LINE_ALPHA;
  for (const contains of [true, false]) {
    ctx.strokeStyle = contains ? palette.ink : palette.indigo;
    ctx.beginPath();
    for (const edge of scene.edges) {
      if (edge.contains !== contains) continue;
      const near = L.start[edge.from]! <= L.start[edge.to]! ? edge.from : edge.to;
      const far = near === edge.from ? edge.to : edge.from;
      const grow = easeInOut((u - L.start[near]!) / LINE_SPAN);
      if (grow <= 0) continue;
      traceLine(ctx, L.at[near]!, L.at[far]!, Math.min(1, grow), crossesClusters(scene, edge) ? 0.18 : 0, L.hub);
    }
    ctx.stroke();
  }

  scene.nodes.forEach((node, i) => {
    const a = easeOut((u - L.start[i]!) / MARK_SPAN);
    if (a <= 0) return;
    ctx.globalAlpha = a;
    ctx.fillStyle = node.kind === 'project' ? palette.amber : palette.indigo;
    ctx.beginPath();
    ctx.arc(L.at[i]!.x, L.at[i]!.y, L.mark[i]! * lerp(0.4, 1, a), 0, Math.PI * 2);
    ctx.fill();
  });

  drawHitRing(ctx, L.hub.x, L.hub.y, u * DRAW_MS, palette.amber, { from: 7 });

  ctx.font = `${FONT_WEIGHT.strong} ${L.text}px ${palette.sans}`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const { i, spot } of L.names) {
    const a = easeOut((u - L.start[i]! - NAME_LAG) / NAME_SPAN);
    if (a <= 0) continue;
    const y = spot.y + (1 - a) * RISE_PX;
    ctx.globalAlpha = a;
    ctx.textAlign = spot.align;
    ctx.strokeStyle = palette.ground;
    ctx.lineWidth = 5;
    ctx.strokeText(scene.nodes[i]!.label, spot.x, y);
    ctx.fillStyle = scene.nodes[i]!.kind === 'project' ? palette.ink : palette.secondary;
    ctx.fillText(scene.nodes[i]!.label, spot.x, y);
  }
  ctx.textAlign = 'start';
  ctx.globalAlpha = 1;
}

/**
 * The film's last wide frame beside the closing headline: this repository's real map, drawn once
 * outward from the project hub over 1.2s while the closing is in view, then at rest. Under reduced
 * motion, or with the page's motion paused, it is drawn whole at once. The headline says the
 * same thing in words, so the drawing is hidden from assistive technology.
 */
export function ClosingMap({ graph, className }: { graph: StageGraph; className?: string }) {
  const scene = useMemo(() => buildFilmScene(graph), [graph]);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || scene.nodes.length === 0) return;
    const palette = readPalette();
    const light = lightSprite(palette.amber);
    const still =
      (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) ||
      typeof IntersectionObserver === 'undefined' ||
      isMotionPaused();
    let elapsed = still ? DRAW_MS : 0;
    let w = 0;
    let h = 0;
    let layout: MapLayout | null = null;

    const paint = () => {
      if (layout && w > 0 && h > 0) drawMap(ctx, scene, layout, palette, light, w, h, elapsed / DRAW_MS);
    };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout = layoutMap(ctx, scene, palette, w, h);
      paint();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    if (still) return () => observer.disconnect();

    let unregister = () => {};
    const finish = () => {
      elapsed = DRAW_MS;
      paint();
      unregister();
    };
    unregister = registerGatedFrameClient(
      el,
      ({ dtMs }) => {
        elapsed = Math.min(DRAW_MS, elapsed + dtMs);
        paint();
        if (elapsed >= DRAW_MS) unregister();
      },
      undefined,
      /* It finishes its 1.2s and rests itself, so a still visitor never keeps a half-drawn map. */
      { keepAwake: true },
    );
    const offPause = subscribeMotionPause(() => {
      if (isMotionPaused()) finish();
    });
    return () => {
      observer.disconnect();
      unregister();
      offPause();
    };
  }, [scene]);

  return (
    <div aria-hidden data-testid="gateway-closing-map" className={cn('relative min-w-0', className)}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
