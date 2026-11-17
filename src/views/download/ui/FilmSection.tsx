'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { FONT_WEIGHT } from '@/shared/ui/tokens/font-weight';

import {
  buildFilmScene,
  crossesClusters,
  pickCloseUp,
  pickNamedFiles,
  type FilmCloseUp,
  type FilmScene,
} from '../lib/film-scene';
import { registerGatedFrameClient } from '../lib/gateway-frame-loop';
import { isMotionPaused, subscribeMotionPause } from '@/shared/motion/motion-pause';
import { createFilmClock } from '../lib/film-clock';
import { FilmActBar } from './FilmActBar';
import type { StageGraph } from '../lib/stage-graph';

const ACTS = [1, 2, 3, 4, 5] as const;

/** Each act's span of the choreography: the files, one file opened, the flight, the lines, the map. */
const ACT_SPANS: readonly (readonly [number, number])[] = [
  [0, 0.18],
  [0.18, 0.4],
  [0.4, 0.58],
  [0.58, 0.78],
  [0.78, 1],
];
/** How long each act plays: the opened file is typed line by line, so it gets the longest. */
const ACT_MS = [3450, 7300, 3850, 4600, 5000];
/** Where a still frame of the finished map is taken: the region names are in, nothing is dimmed. */
const STILL_P = 0.78 + 0.22 * 0.36;

/** An entrance: opacity and a 12px rise over 360ms. */
const ENTER_MS = 360;
const RISE_PX = 12;
/** The hairline from a finished frontmatter line to what it became. */
const HAIRLINE_MS = 300;
/** One file's flight to its place. */
const FLIGHT_MS = 1100;
/** One relation's stroke in the left-to-right wipe. */
const STROKE_MS = 420;

/** One line of the opened file's frontmatter; `role` ties it to what it becomes on the map. */
interface FrontmatterLine {
  key: string | null;
  value: string;
  role: 'kind' | 'domain' | 'title' | 'dependency' | null;
  /** For a dependency's own list item, which dependency it names. */
  dep?: number;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const inOut = (v: number) => {
  const x = clamp(v);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

interface Palette {
  ink: string;
  secondary: string;
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
    secondary: v('--color-text-secondary'),
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

interface Point {
  x: number;
  y: number;
}
interface Box extends Point {
  w: number;
  h: number;
}

/** Everything about the stage that depends on its size, worked out once per resize. */
interface Layout {
  wide: boolean;
  /** Body size of the canvas: 15px, 13px on a phone. */
  text: number;
  /** Map centre, which is the hub's place. */
  hub: Point;
  /** Each concept's file in the floating field (centre), its size and corner. */
  field: Box[];
  fieldRadius: number[];
  named: Map<number, number>;
  /** Each concept's place on the finished map and its mark's radius. */
  map: Point[];
  mark: number[];
  mapLeft: number;
  mapWidth: number;
  panel: Box & { font: number; lineH: number; barH: number; padX: number };
  /** Where the opened file's concept, its domain and its dependencies sit beside the file. */
  self: Point;
  parent: Point;
  deps: Point[];
}

/** Three depth layers of the floating field: how far each drifts and how slowly. */
const DRIFT_PX = [6, 10, 16];
const DRIFT_MS = [7000, 8000, 9000];
/** Grid cells of the twelve named files, so the opened file sits in the second row. */
const CARD_CELLS = [5, 0, 10, 3, 6, 9, 1, 11, 4, 8, 2, 7];

function markRadius(kind: string, wide: boolean): number {
  const r = kind === 'project' ? 7 : kind === 'domain' ? 5.5 : kind === 'capability' ? 3.6 : 2.6;
  return wide ? r : r * 0.85;
}

function layoutFilm(
  ctx: CanvasRenderingContext2D,
  scene: FilmScene,
  pick: FilmCloseUp | null,
  lines: number,
  palette: Palette,
  w: number,
  h: number,
  column: { left: number; width: number },
  film: boolean,
): Layout {
  const wide = w >= 768;
  const text = wide ? 15 : 13;
  const zone = {
    l: column.left,
    r: column.left + column.width,
    t: wide ? 112 : 104,
    b: film ? h * (wide ? 0.667 : 0.557) : h - 40,
  };
  const zoneW = zone.r - zone.l;
  const zoneH = zone.b - zone.t;
  const hub = { x: zone.l + zoneW / 2, y: zone.t + zoneH / 2 };

  /* Twelve files keep their names (six on a phone); the rest are blank slips. */
  ctx.font = `${text}px ${palette.mono}`;
  const cols = wide ? 4 : 1;
  const rows = wide ? 3 : 6;
  const cellW = zoneW / cols;
  const cellH = zoneH / rows;
  const cardW = wide ? Math.min(248, cellW - 12) : Math.min(260, zoneW - 48);
  const cardH = wide ? 56 : 40;
  const fits = (file: string) => ctx.measureText(file).width + 44 <= cardW;
  const named = pickNamedFiles(scene, pick?.index ?? null, cols * rows, fits);
  const namedAt = new Map(named.map((i, k) => [i, k]));
  const cards: Box[] = named.map((i, k) => {
    const node = scene.nodes[i];
    const jx = node.seed * 2 - 1;
    const jy = node.gy * 2 - 1;
    if (wide) {
      const cell = CARD_CELLS[k] ?? k;
      return {
        x: zone.l + ((cell % cols) + 0.5) * cellW + jx * ((cellW - cardW) / 2) * 0.9,
        y: zone.t + (Math.floor(cell / cols) + 0.5) * cellH + jy * ((cellH - cardH) / 2) * 0.6,
        w: cardW,
        h: cardH,
      };
    }
    /* One column on a phone, each file stepping left and right of the one above. */
    const room = zoneW - cardW;
    const across = k % 2 === 0 ? 0.08 + 0.22 * node.seed : 0.7 + 0.22 * node.seed;
    return { x: zone.l + cardW / 2 + room * across, y: zone.t + (k + 0.5) * cellH, w: cardW, h: cardH };
  });

  const slab = wide ? { w: 28, h: 8 } : { w: 22, h: 6 };
  const field: Box[] = [];
  const fieldRadius: number[] = [];
  scene.nodes.forEach((node, i) => {
    const k = namedAt.get(i);
    if (k !== undefined) {
      field.push(cards[k]!);
      fieldRadius.push(8);
      return;
    }
    let x = zone.l + node.gx * zoneW;
    let y = zone.t + node.gy * zoneH;
    /* A slip never sits under a named file, so no edge peeks out from behind one. */
    for (const card of cards) {
      const clearX = card.w / 2 + slab.w / 2 + 10;
      const clearY = card.h / 2 + slab.h / 2 + 10;
      if (Math.abs(x - card.x) < clearX && Math.abs(y - card.y) < clearY) {
        y = card.y + Math.sign(y - card.y || 1) * clearY;
        x = Math.min(zone.r - slab.w / 2, Math.max(zone.l + slab.w / 2, x));
      }
    }
    field.push({ x, y, w: slab.w, h: slab.h });
    fieldRadius.push(2);
  });

  /* The map fills the picture: x by 0.36 of the stage, y by 0.27 (0.42 and 0.24 on a phone). */
  const sx = Math.min(w * (wide ? 0.36 : 0.42), zoneW / 2 - 8);
  const sy = Math.min(h * (wide ? 0.27 : 0.24), zoneH / 2 - 14);
  const map = scene.nodes.map((node) => ({ x: hub.x + node.x * sx, y: hub.y + node.y * sy }));
  const mark = scene.nodes.map((node) => markRadius(node.kind, wide));

  /* The opened file: on the left of a split stage, or on top on a phone with its fragment below. */
  const font = wide ? 17 : 13;
  const lineH = Math.round(font * (wide ? 1.75 : 1.65));
  const barH = wide ? 46 : 36;
  const padX = wide ? 24 : 16;
  const panelW = wide ? Math.min(480, zoneW * 0.46) : zoneW;
  const panelH = barH + (wide ? 16 : 10) * 2 + lines * lineH;
  const panel = {
    x: zone.l,
    y: wide ? Math.max(zone.t, hub.y - panelH / 2) : zone.t,
    w: panelW,
    h: panelH,
    font,
    lineH,
    barH,
    padX,
  };
  const depCount = pick?.dependencies.length ?? 0;
  let self: Point;
  let parent: Point;
  let deps: Point[];
  if (wide) {
    const fx = mix(panel.x + panelW, zone.r, 0.5);
    const rise = Math.min(150, zoneH * 0.3);
    self = { x: fx, y: hub.y };
    parent = { x: fx, y: hub.y - rise };
    /* Mirrored: the first list item reaches the farthest mark, so no two hairlines cross. */
    deps = Array.from({ length: depCount }, (_, k) => ({
      x: fx + ((depCount - 1) / 2 - k) * Math.min(160, (zone.r - panel.x - panelW) / Math.max(1, depCount)),
      y: hub.y + rise,
    }));
  } else {
    const row = panel.y + panelH + 36;
    parent = { x: zone.l + zoneW * 0.22, y: row };
    self = { x: zone.l + zoneW * 0.66, y: row };
    deps = Array.from({ length: depCount }, (_, k) => ({
      x: zone.l + ((k + 0.5) / Math.max(1, depCount)) * zoneW,
      y: row + 60,
    }));
  }

  const xs = map.map((m) => m.x);
  const mapLeft = Math.min(...xs);
  return {
    wide,
    text,
    hub,
    field,
    fieldRadius,
    named: namedAt,
    map,
    mark,
    mapLeft,
    mapWidth: Math.max(1, Math.max(...xs) - mapLeft),
    panel,
    self,
    parent,
    deps,
  };
}

/** The progress of act `act` (1-based) at choreography progress `p`, 0..1. */
function actAt(act: number, p: number): number {
  const [start, end] = ACT_SPANS[act - 1]!;
  return clamp((p - start) / (end - start));
}

/** A label with a rim of the ground behind it, so a line passing under it never cuts it. */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, ground: string, fill: string) {
  ctx.strokeStyle = ground;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** A line from `a` to `b` drawn to fraction `t`, bowed by `bow` (a fraction of its length) away from `hub`. */
function stroke(ctx: CanvasRenderingContext2D, a: Point, b: Point, t: number, bow: number, hub: Point) {
  if (t <= 0) return;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  if (bow <= 0) {
    ctx.lineTo(mix(a.x, b.x, t), mix(a.y, b.y, t));
  } else {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let ox = mx - hub.x;
    let oy = my - hub.y;
    const off = Math.hypot(ox, oy);
    if (off < 1) {
      ox = -(b.y - a.y);
      oy = b.x - a.x;
    }
    const n = Math.hypot(ox, oy) || 1;
    const c = { x: mx + (ox / n) * len * bow, y: my + (oy / n) * len * bow };
    /* The first `t` of a quadratic curve is itself a quadratic curve. */
    const c1 = { x: mix(a.x, c.x, t), y: mix(a.y, c.y, t) };
    const end = { x: mix(c1.x, mix(c.x, b.x, t), t), y: mix(c1.y, mix(c.y, b.y, t), t) };
    ctx.quadraticCurveTo(c1.x, c1.y, end.x, end.y);
  }
  ctx.stroke();
}

interface FilmCast {
  scene: FilmScene;
  pick: FilmCloseUp | null;
  lines: readonly FrontmatterLine[];
  /** The opened file's name for its concept before its title line is typed. */
  slug: string;
  /** Nodes labelled on the finished map: the project and its first ring. */
  regions: number[];
  /** The opened concept's own relations, which stay lit at the end. */
  neighbours: ReadonlySet<number>;
  /** Relations the opened file drew in its close-up, which never leave the stage. */
  fragmentEdges: ReadonlySet<number>;
}

/**
 * One frame of the film at choreography progress `p` (0..1) and clock `time` (ms). Every place
 * is a function of `p`; only the floating field's slow drift reads the clock.
 */
function drawFilm(
  ctx: CanvasRenderingContext2D,
  cast: FilmCast,
  L: Layout,
  palette: Palette,
  w: number,
  h: number,
  p: number,
  time: number,
) {
  ctx.clearRect(0, 0, w, h);
  const { scene, pick, lines } = cast;
  const q1 = actAt(1, p);
  const q2 = actAt(2, p);
  const q3 = actAt(3, p);
  const q4 = actAt(4, p);
  const q5 = actAt(5, p);
  const ms = (act: number) => ACT_MS[act - 1]!;
  const text = L.text;

  /* Act 2 steps the field back; act 3 brings it forward again as it flies. */
  const open = inOut(q2 / 0.14);
  const restore = inOut(q3 / 0.25);
  const fieldLight = mix(mix(1, 0.08, open), 1, restore);
  /* Act 3: the opened file slides off to the left; the fragment glides to its true place. */
  const slide = inOut(q3 / 0.3);
  const glide = inOut((q3 - 0.06) / 0.6);
  /* Act 5: the opened concept and its neighbours stay lit, the rest dims to 35%. */
  const focus = inOut((q5 - 0.42) / 0.14);
  const dimmed = mix(1, 0.35, focus);

  const fragment = new Set<number>();
  if (pick) {
    fragment.add(pick.index);
    fragment.add(pick.parent);
    pick.dependencies.forEach((dep) => fragment.add(dep));
  }

  /* When each frontmatter line is done typing, in act-2 progress. */
  const typeFrom = 0.16;
  const typeSpan = 0.58;
  const lengths = lines.map((line) => (line.key ? line.key.length + 2 : 0) + line.value.length);
  const total = Math.max(1, lengths.reduce((a, b) => a + b, 0));
  const doneAt: number[] = [];
  lengths.reduce((sum, n) => {
    doneAt.push(typeFrom + ((sum + n) / total) * typeSpan);
    return sum + n;
  }, 0);
  const hairline = (row: number) => inOut((q2 - doneAt[row]!) / (HAIRLINE_MS / ms(2)));
  /* A hairline has done its work once its mark is in; it fades, so the finished file reads clean. */
  const hairlineGone = (row: number) => inOut((q2 - doneAt[row]! - 1300 / ms(2)) / (500 / ms(2)));
  const arrival = (row: number) => inOut((q2 - doneAt[row]! - HAIRLINE_MS / ms(2)) / (ENTER_MS / ms(2)));
  const rowOf = (role: FrontmatterLine['role'], dep?: number) =>
    lines.findIndex((line) => line.role === role && (dep === undefined || line.dep === dep));
  const domainIn = pick ? arrival(rowOf('domain')) : 0;
  const kindIn = pick ? arrival(rowOf('kind')) : 0;
  const titleIn = pick ? arrival(rowOf('title')) : 0;
  const depIn = (k: number) => (pick ? arrival(rowOf('dependency', k)) : 0);

  /* Where each concept is now, and how far along its flight it is. */
  const at: Point[] = new Array(scene.nodes.length);
  const fieldAt: Point[] = new Array(scene.nodes.length);
  const morph = new Array<number>(scene.nodes.length).fill(0);
  const flightStart = (i: number) => scene.nodes[i]!.order * (1 - FLIGHT_MS / ms(3));
  scene.nodes.forEach((node, i) => {
    const box = L.field[i]!;
    const layer = node.layer;
    const amp = DRIFT_PX[layer]! * (L.wide ? 1 : 0.7);
    const enter = inOut((q1 * ms(1) - node.seed * 1400) / ENTER_MS);
    const drift = amp * Math.sin((time / DRIFT_MS[layer]!) * Math.PI * 2 + node.seed * Math.PI * 2);
    const fx = box.x;
    const fy = box.y + drift + (1 - enter) * RISE_PX;
    fieldAt[i] = { x: fx, y: fy };
    if (fragment.has(i)) {
      const from = i === pick!.index ? L.self : i === pick!.parent ? L.parent : L.deps[pick!.dependencies.indexOf(i)]!;
      at[i] = { x: mix(from.x, L.map[i]!.x, glide), y: mix(from.y, L.map[i]!.y, glide) };
      morph[i] = 1;
      return;
    }
    const t = clamp((q3 - flightStart(i)) / (FLIGHT_MS / ms(3)));
    const e = inOut(t);
    const m = L.map[i]!;
    const dx = m.x - fx;
    const dy = m.y - fy;
    const len = Math.hypot(dx, dy) || 1;
    const arc = Math.sin(Math.PI * e) * len * 0.12 * (node.seed < 0.5 ? -1 : 1);
    at[i] = { x: mix(fx, m.x, e) - (dy / len) * arc, y: mix(fy, m.y, e) + (dx / len) * arc };
    morph[i] = t;
  });

  /* Relations: the fragment's own lines persist from act 2; the rest draw in act 4. */
  const contAlpha = 0.35;
  const relAlpha = 0.22;
  ctx.lineWidth = 1;
  scene.edges.forEach((edge, k) => {
    const a = at[edge.from]!;
    const b = at[edge.to]!;
    const lit = pick !== null && (edge.from === pick.index || edge.to === pick.index);
    const base = edge.contains ? contAlpha : relAlpha;
    const fade = lit ? mix(base, 0.7, focus) / base : dimmed;
    const bow = crossesClusters(scene, edge) ? 0.18 : 0;
    ctx.strokeStyle = edge.contains ? palette.ink : palette.indigo;
    if (cast.fragmentEdges.has(k)) {
      if (q2 <= 0) return;
      const drawn = edge.contains ? Math.min(domainIn, kindIn) : depIn(pick!.dependencies.indexOf(edge.to));
      ctx.globalAlpha = mix(0.6, base, glide) * fade;
      stroke(ctx, a, b, drawn, bow * glide, L.hub);
      return;
    }
    if (q4 <= 0) return;
    let grow: number;
    if (edge.contains) {
      grow = inOut((q4 - edge.reveal * 0.23) / 0.12);
    } else {
      const left = Math.min(L.map[edge.from]!.x, L.map[edge.to]!.x);
      const span = STROKE_MS / ms(4);
      grow = inOut((q4 - 0.35 - ((left - L.mapLeft) / L.mapWidth) * (0.65 - span)) / span);
    }
    if (grow <= 0) return;
    ctx.globalAlpha = base * fade;
    /* Each line draws from its left end, so the relations sweep across the map. */
    const leftFirst = L.map[edge.from]!.x <= L.map[edge.to]!.x || edge.contains;
    stroke(ctx, leftFirst ? a : b, leftFirst ? b : a, grow, bow, L.hub);
  });

  /* Files and marks: those still resting first, then those landed, then those in flight. */
  const resting: number[] = [];
  const landed: number[] = [];
  const flying: number[] = [];
  scene.nodes.forEach((_, i) => {
    if (fragment.has(i)) return;
    (morph[i] === 0 ? resting : morph[i] === 1 ? landed : flying).push(i);
  });
  const drawNode = (i: number, place: Point = at[i]!, t: number = morph[i]!, fade = 1) => {
    /* A file folds to a mark in the first 60% of its flight, so no blank card crosses the stage. */
    const e = inOut(t / 0.6);
    const node = scene.nodes[i]!;
    const box = L.field[i]!;
    const r = L.mark[i]!;
    const tone = node.kind === 'project' ? palette.amber : palette.indigo;
    const named = L.named.has(i);
    const enter = inOut((q1 * ms(1) - node.seed * 1400) / ENTER_MS);
    const light = fade * enter * mix(fieldLight, 1, e) * (e >= 1 ? (cast.neighbours.has(i) ? 1 : dimmed) : 1);
    if (light <= 0) return;
    const bw = mix(box.w, r * 2, e);
    const bh = mix(box.h, r * 2, e);
    const corner = Math.min(Math.min(bw, bh) / 2, mix(L.fieldRadius[i]!, r, e));
    const { x, y } = place;
    ctx.beginPath();
    ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, corner);
    /* It keeps a file's colours while it shrinks and takes the mark's colour only as it nears a dot. */
    const tint = inOut((e - 0.45) / 0.55);
    if (named && tint < 1) {
      /* A file is opaque, so nothing behind it shows through. */
      ctx.globalAlpha = light * (1 - tint);
      ctx.fillStyle = palette.ground;
      ctx.fill();
      ctx.fillStyle = palette.card;
      ctx.fill();
      ctx.strokeStyle = palette.edge;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (tint < 1) {
      ctx.globalAlpha = light * (1 - tint) * mix(0.4, 1, e);
      ctx.fillStyle = palette.edge;
      ctx.fill();
    }
    if (tint > 0) {
      ctx.globalAlpha = light * tint;
      ctx.fillStyle = tone;
      ctx.fill();
    }
    /* The file's name and kind dot, gone in the first quarter of its flight. */
    const nameLight = light * (1 - clamp((q3 - flightStart(i)) / (FLIGHT_MS / ms(3)) / 0.25));
    if (named && nameLight > 0) {
      ctx.globalAlpha = nameLight;
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.arc(x - bw / 2 + 16, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `${text}px ${palette.mono}`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = palette.ink;
      ctx.fillText(node.file, x - bw / 2 + 28, y + 1);
    }
  };
  /* The domain and dependencies of the opened file leave the field as their marks appear beside it. */
  if (pick && open < 1) {
    [pick.parent, ...pick.dependencies].forEach((i) => drawNode(i, fieldAt[i]!, 0, 1 - open));
  }
  /* Blank slips first, so a named file always lies over any slip that drifts under it. */
  resting.filter((i) => !L.named.has(i)).forEach((i) => drawNode(i));
  resting.filter((i) => L.named.has(i)).forEach((i) => drawNode(i));
  landed.forEach((i) => drawNode(i));
  flying.forEach((i) => drawNode(i));

  /* Act 1's opened file before it opens, and the open file itself in acts 2 and 3. */
  if (pick) drawOpenFile(ctx, cast, L, palette, { q1, q2, open, slide, time, hairline, hairlineGone });

  /* The fragment: the opened concept, its domain and its dependencies, as marks. */
  if (pick && q2 > 0) {
    const markAt = (i: number, light: number, slideIn: boolean) => {
      if (light <= 0) return;
      const node = scene.nodes[i]!;
      const lift = slideIn ? (1 - light) * RISE_PX * (1 - glide) : 0;
      ctx.globalAlpha = light * (cast.neighbours.has(i) ? 1 : dimmed);
      ctx.fillStyle = node.kind === 'project' ? palette.amber : palette.indigo;
      ctx.beginPath();
      ctx.arc(at[i]!.x, at[i]!.y + lift, mix(L.wide ? 6 : 5, L.mark[i]!, glide), 0, Math.PI * 2);
      ctx.fill();
    };
    markAt(pick.parent, domainIn, true);
    pick.dependencies.forEach((dep, k) => markAt(dep, depIn(k), true));
    markAt(pick.index, kindIn, true);
  }

  /* Names: the fragment's while it is beside the file, the regions' and the focus's on the map. */
  ctx.textBaseline = 'middle';
  const nameFont = `${FONT_WEIGHT.strong} ${text}px ${palette.sans}`;
  const below = (i: number) => at[i]!.y + L.mark[i]! + 6 + text / 2;
  const above = (i: number) => at[i]!.y - L.mark[i]! - 6 - text / 2;
  if (pick && q2 > 0) {
    const leave = 1 - inOut(q3 / 0.16);
    ctx.font = nameFont;
    ctx.textAlign = 'center';
    const fragName = (i: number, light: number, y: number) => {
      const a = light * leave;
      if (a <= 0) return;
      ctx.globalAlpha = a;
      label(ctx, scene.nodes[i]!.label, at[i]!.x, y + (1 - light) * RISE_PX, palette.ground, palette.ink);
    };
    fragName(pick.parent, domainIn, above(pick.parent));
    /* On a phone three names do not fit side by side, so the middle one steps down a line. */
    pick.dependencies.forEach((dep, k) => fragName(dep, depIn(k), below(dep) + (!L.wide && k % 2 === 1 ? text + 6 : 0)));
    /* The opened concept's name: its file name first, then the title its title line gives it. */
    const selfY = L.wide ? at[pick.index]!.y : above(pick.index);
    ctx.textAlign = L.wide ? 'start' : 'center';
    const selfX = L.wide ? at[pick.index]!.x + 16 : at[pick.index]!.x;
    const selfLight = kindIn * leave;
    if (selfLight > 0) {
      ctx.globalAlpha = selfLight * (1 - titleIn);
      label(ctx, cast.slug, selfX, selfY + (1 - kindIn) * RISE_PX, palette.ground, palette.ink);
      ctx.globalAlpha = selfLight * titleIn;
      label(ctx, scene.nodes[pick.index]!.label, selfX, selfY + (1 - titleIn) * (RISE_PX / 2), palette.ground, palette.ink);
    }
  }
  if (q5 > 0) {
    ctx.font = nameFont;
    const focusNames = pick ? [pick.index, ...pick.dependencies].filter((i) => !cast.regions.includes(i)) : [];
    const spots = placeNames(ctx, [...cast.regions, ...focusNames], at, L.mark, text, (i) => scene.nodes[i]!.label);
    cast.regions.forEach((i, k) => {
      const enter = inOut((q5 * ms(5) - 80 - k * 120) / ENTER_MS);
      if (enter <= 0) return;
      const spot = spots.get(i)!;
      ctx.globalAlpha = enter * (cast.neighbours.has(i) ? 1 : dimmed);
      ctx.textAlign = spot.align;
      const project = scene.nodes[i]!.kind === 'project';
      label(ctx, scene.nodes[i]!.label, spot.x, spot.y + (1 - enter) * RISE_PX, palette.ground, project ? palette.ink : palette.secondary);
    });
    if (focus > 0) {
      focusNames.forEach((i) => {
        const spot = spots.get(i)!;
        ctx.globalAlpha = focus;
        ctx.textAlign = spot.align;
        label(ctx, scene.nodes[i]!.label, spot.x, spot.y + (1 - focus) * RISE_PX, palette.ground, palette.ink);
      });
    }
  }
  ctx.textAlign = 'start';
  ctx.globalAlpha = 1;
}

/**
 * Where each name on the finished map goes: under its mark if that space is free, else above, to
 * the right or to the left. Marks never move in the last act, so a name never changes side.
 */
function placeNames(
  ctx: CanvasRenderingContext2D,
  order: readonly number[],
  at: readonly Point[],
  mark: readonly number[],
  text: number,
  nameOf: (i: number) => string,
): Map<number, { x: number; y: number; align: CanvasTextAlign }> {
  const taken: Box[] = [];
  const spots = new Map<number, { x: number; y: number; align: CanvasTextAlign }>();
  /* How much a name would cover names already placed; the first spot with none wins. */
  const overlap = (b: Box) =>
    taken.reduce((sum, o) => {
      const ox = (o.w + b.w + 8) / 2 - Math.abs(o.x - b.x);
      const oy = (o.h + b.h + 4) / 2 - Math.abs(o.y - b.y);
      return sum + (ox > 0 && oy > 0 ? ox * oy : 0);
    }, 0);
  for (const i of order) {
    const { x, y } = at[i]!;
    const r = mark[i]!;
    const w = ctx.measureText(nameOf(i)).width;
    const h = text + 4;
    const down = y + r + 6 + text / 2;
    const up = y - r - 6 - text / 2;
    const side = r + 8;
    const options: { x: number; y: number; align: CanvasTextAlign }[] = [
      { x, y: down, align: 'center' },
      { x, y: up, align: 'center' },
      { x: x + side, y, align: 'start' },
      { x: x - side, y, align: 'end' },
      { x: x + side, y: down, align: 'start' },
      { x: x - side, y: down, align: 'end' },
      { x: x + side, y: up, align: 'start' },
      { x: x - side, y: up, align: 'end' },
      { x, y: down + h, align: 'center' },
      { x, y: up - h, align: 'center' },
    ];
    const boxOf = (o: (typeof options)[number]): Box => ({
      x: o.align === 'center' ? o.x : o.align === 'start' ? o.x + w / 2 : o.x - w / 2,
      y: o.y,
      w,
      h,
    });
    let best = options[0]!;
    let least = Infinity;
    for (const o of options) {
      const cost = overlap(boxOf(o));
      if (cost < least) {
        best = o;
        least = cost;
      }
      if (cost === 0) break;
    }
    taken.push(boxOf(best));
    spots.set(i, best);
  }
  return spots;
}

/**
 * The opened file: in act 1 one of the named files; in act 2 it grows into a panel on the left
 * of the stage and its frontmatter types itself, each finished line drawing a hairline to what it
 * became; in act 3 the panel slides off to the left.
 */
function drawOpenFile(
  ctx: CanvasRenderingContext2D,
  cast: FilmCast,
  L: Layout,
  palette: Palette,
  s: {
    q1: number;
    q2: number;
    open: number;
    slide: number;
    time: number;
    hairline: (row: number) => number;
    hairlineGone: (row: number) => number;
  },
) {
  const { scene, pick, lines } = cast;
  if (!pick) return;
  const node = scene.nodes[pick.index]!;
  const card = L.field[pick.index]!;
  const P = L.panel;
  if (s.slide >= 1) return;
  const enter = inOut((s.q1 * ACT_MS[0]! - node.seed * 1400) / ENTER_MS);
  const drift = DRIFT_PX[node.layer]! * (L.wide ? 1 : 0.7) * Math.sin((s.time / DRIFT_MS[node.layer]!) * Math.PI * 2 + node.seed * Math.PI * 2);
  const shift = -(P.x + P.w + 40) * s.slide;
  const x = mix(card.x - card.w / 2, P.x, s.open) + shift;
  const y = mix(card.y - card.h / 2 + drift * (1 - s.open) + (1 - enter) * RISE_PX, P.y, s.open);
  const bw = mix(card.w, P.w, s.open);
  const bh = mix(card.h, P.h, s.open);
  const light = enter * (1 - s.slide);
  if (light <= 0) return;

  ctx.globalAlpha = light;
  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh, mix(8, 12, s.open));
  ctx.fillStyle = palette.ground;
  ctx.fill();
  ctx.fillStyle = palette.card;
  ctx.fill();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 1;
  ctx.stroke();

  /* The title row: the kind dot and the file name, moving from the card's row to the panel's bar. */
  const rowY = mix(y + bh / 2, y + P.barH / 2, s.open);
  const nameSize = Math.round(mix(L.text, L.wide ? 15 : 13, s.open));
  ctx.fillStyle = palette.indigo;
  ctx.beginPath();
  ctx.arc(x + mix(16, P.padX, s.open), rowY, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `${nameSize}px ${palette.mono}`;
  ctx.textBaseline = 'middle';
  /* The name settles from a file's bright row into the panel's quieter title bar. */
  const nameX = x + mix(28, P.padX + 14, s.open);
  ctx.globalAlpha = light * (1 - s.open);
  ctx.fillStyle = palette.ink;
  ctx.fillText(node.file, nameX, rowY + 1);
  ctx.globalAlpha = light * s.open;
  ctx.fillStyle = palette.secondary;
  ctx.fillText(node.file, nameX, rowY + 1);
  if (s.open <= 0) return;
  ctx.globalAlpha = light * s.open * 0.8;
  ctx.fillStyle = palette.edge;
  ctx.fillRect(x, y + P.barH, bw, 1);

  const textLight = light * clamp((s.open - 0.8) / 0.2);
  if (textLight <= 0) return;
  const lengths = lines.map((line) => (line.key ? line.key.length + 2 : 0) + line.value.length);
  const total = lengths.reduce((a, b) => a + b, 0);
  let budget = Math.floor(clamp((s.q2 - 0.16) / 0.58) * total);
  const top = y + P.barH + (L.wide ? 16 : 10);
  ctx.font = `${P.font}px ${palette.mono}`;
  let caret: Point | null = null;
  lines.forEach((line, row) => {
    const ly = top + row * P.lineH + P.lineH / 2;
    let lx = x + P.padX;
    const lit = line.role ? s.hairline(row) : 0;
    const write = (part: string, color: string, accent = 0) => {
      if (budget <= 0) return;
      const shown = part.slice(0, budget);
      budget -= part.length;
      ctx.globalAlpha = textLight;
      ctx.fillStyle = color;
      ctx.fillText(shown, lx, ly + 1);
      if (accent > 0) {
        ctx.globalAlpha = textLight * accent;
        ctx.fillStyle = palette.indigo;
        ctx.fillText(shown, lx, ly + 1);
      }
      lx += ctx.measureText(shown).width;
      caret = { x: lx, y: ly };
    };
    if (line.key) {
      write(line.key, palette.dim, lit);
      write(': ', palette.dim);
    }
    write(line.value, line.key ? palette.ink : line.dep !== undefined ? palette.ink : palette.dim);

    /* The hairline from the finished line to what it became; none on a phone, where it would cross the file. */
    const trace = textLight * 0.5 * (1 - s.hairlineGone(row));
    if (!L.wide || lit <= 0 || trace <= 0) return;
    const target = hairlineTarget(L, line);
    if (!target) return;
    const start = { x: lx + 10, y: ly };
    const c1 = { x: mix(start.x, target.x, 0.55), y: start.y };
    ctx.globalAlpha = trace;
    ctx.strokeStyle = palette.indigo;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    const steps = 28;
    for (let k = 1; k <= Math.round(steps * lit); k += 1) {
      const u = k / steps;
      ctx.lineTo(mix(mix(start.x, c1.x, u), mix(c1.x, target.x, u), u), mix(mix(start.y, c1.y, u), mix(c1.y, target.y, u), u));
    }
    ctx.stroke();
  });
  if (caret && s.q2 < 0.78) {
    const c = caret as Point;
    ctx.globalAlpha = textLight * (0.55 + 0.45 * Math.sin(s.time / 170));
    ctx.fillStyle = palette.indigo;
    ctx.fillRect(c.x + 2, c.y - P.font * 0.6, 2, P.font * 1.2);
  }
}

/** Where a frontmatter line's hairline ends: just short of the mark or the name it became. */
function hairlineTarget(L: Layout, line: FrontmatterLine): Point | null {
  const gap = 12;
  if (line.role === 'domain') return { x: L.parent.x - gap, y: L.parent.y };
  if (line.role === 'kind') return { x: L.self.x - gap, y: L.self.y };
  if (line.role === 'title') return { x: L.self.x - gap, y: L.self.y + 4 };
  const dep = line.dep === undefined ? undefined : L.deps[line.dep];
  return dep ? { x: dep.x - gap * 0.7, y: dep.y - gap * 0.7 } : null;
}

/** Each caption holds its act's span, fading across the seams; the last one stays. */
function captionLight(act: number, p: number): number {
  const [start, end] = ACT_SPANS[act - 1]!;
  /* The outgoing caption is gone before the next one rises, so two never overlap. */
  const fadeIn = act === 1 ? 1 : inOut((p - start - 0.006) / 0.025);
  const fadeOut = act === ACT_SPANS.length ? 1 : 1 - inOut((p - end + 0.031) / 0.025);
  return Math.min(fadeIn, fadeOut);
}

/**
 * The page's film: once its stage is in view it plays by itself, act after act, as the
 * repository's real concepts go from Markdown files to the map, then rests and plays again.
 * Without a script or under reduced motion the finished map is one still frame and the five
 * captions are a list.
 */
export function FilmSection({ graph }: { graph: StageGraph }) {
  const t = useTranslations('download.film');
  const scene = useMemo(() => buildFilmScene(graph), [graph]);
  const locale = useLocale();
  const closeUp = useMemo(() => pickCloseUp(scene), [scene]);
  const cast = useMemo<FilmCast>(() => {
    const slugOf = (i: number) => scene.nodes[i]!.id.split(':').pop() ?? scene.nodes[i]!.id;
    const lines: FrontmatterLine[] = [];
    const neighbours = new Set<number>();
    const fragmentEdges = new Set<number>();
    if (closeUp) {
      const node = scene.nodes[closeUp.index]!;
      lines.push(
        { key: null, value: '---', role: null },
        /* Top to bottom as the tree grows: the domain that holds it, the concept, what it relies on. */
        { key: 'domain', value: slugOf(closeUp.parent), role: 'domain' },
        { key: 'kind', value: node.kind, role: 'kind' },
        { key: locale === 'en' ? 'title' : `display_${locale}`, value: node.label, role: 'title' },
        { key: 'dependencies', value: '', role: null },
        ...closeUp.dependencies.map((dep, k): FrontmatterLine => ({ key: null, value: `  - ${slugOf(dep)}`, role: 'dependency', dep: k })),
        { key: null, value: '---', role: null },
      );
      neighbours.add(closeUp.index);
      scene.edges.forEach((edge, k) => {
        if (edge.from === closeUp.index) neighbours.add(edge.to);
        if (edge.to === closeUp.index) neighbours.add(edge.from);
        const holds = edge.contains && edge.from === closeUp.parent && edge.to === closeUp.index;
        const relies = !edge.contains && edge.from === closeUp.index && closeUp.dependencies.includes(edge.to);
        if (holds || relies) fragmentEdges.add(k);
      });
    }
    const root = scene.nodes.findIndex((node) => node.depth === 0);
    /* The project and its first ring, the largest first, so no frame carries more than twelve names. */
    const ring = scene.nodes
      .map((node, i) => ({ node, i }))
      .filter(({ node }) => node.depth === 1)
      .sort((a, b) => b.node.degree - a.node.degree)
      .slice(0, 7)
      .map(({ i }) => i);
    return {
      scene,
      pick: closeUp,
      lines,
      slug: closeUp ? slugOf(closeUp.index) : '',
      regions: root < 0 ? ring : [root, ...ring],
      neighbours,
      fragmentEdges,
    };
  }, [scene, closeUp, locale]);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const column = useRef<HTMLHeadingElement>(null);
  const captions = useRef<(HTMLLIElement | null)[]>([]);
  const fills = useRef<(HTMLSpanElement | null)[]>([]);
  const seek = useRef<(act: number) => void>(() => {});
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
    let w = 0;
    let h = 0;
    let layout: Layout | null = null;
    let shown = film ? 0 : STILL_P;
    let clock = 0;
    let veil = 1;
    const time = createFilmClock(ACT_SPANS, ACT_MS);

    const paint = () => {
      if (!layout) return;
      drawFilm(ctx, cast, layout, palette, w, h, shown, clock);
      if (!film) return;
      const light = isMotionPaused() ? 1 : time.fade() * veil;
      el.style.opacity = String(light);
      captions.current.forEach((caption, i) => {
        if (!caption) return;
        const lit = captionLight(i + 1, shown) * light;
        caption.style.opacity = String(lit);
        caption.style.transform = `translateY(${(1 - lit) * RISE_PX}px)`;
        caption.style.visibility = lit > 0.01 ? 'visible' : 'hidden';
      });
      const act = time.act();
      fills.current.forEach((fill, i) => {
        if (!fill) return;
        const [start, end] = ACT_SPANS[i]!;
        fill.style.transform = `scaleX(${i < act ? 1 : i > act ? 0 : clamp((shown - start) / (end - start))})`;
      });
    };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const box = el.getBoundingClientRect();
      const col = column.current?.getBoundingClientRect();
      const span = col && col.width > 0 ? { left: col.left - box.left, width: col.width } : { left: 24, width: w - 48 };
      layout = layoutFilm(ctx, scene, closeUp, cast.lines.length, palette, w, h, span, film);
      paint();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    if (!film) return () => observer.disconnect();

    const unregister = registerGatedFrameClient(
      host,
      ({ t: now, dtMs, factor }) => {
        clock = now;
        /* A visitor who stopped moving sees the film to its end, where it rests on the finished map. */
        if (factor < 1 && time.resting()) return;
        shown = time.advance(dtMs);
        veil = Math.min(1, veil + dtMs / 450);
        paint();
      },
      undefined,
      { keepAwake: true },
    );
    /* Paused, a still frame lands well inside its act, where its picture and caption are whole. */
    const settle = (act: number) => time.advance(ACT_MS[act]! * 0.45);
    seek.current = (act) => {
      time.seek(act);
      const paused = isMotionPaused();
      shown = paused ? settle(act) : time.progress();
      /* A jump fades in from dark instead of cutting; paused, it shows the act at once. */
      veil = paused ? 1 : 0;
      paint();
    };
    const offPause = subscribeMotionPause(() => {
      if (!isMotionPaused()) return;
      /* A film paused before it began would hold a dark first frame: show its first act instead. */
      if (time.progress() === 0) shown = settle(0);
      paint();
    });
    if (isMotionPaused()) {
      shown = settle(0);
      paint();
    }
    return () => {
      observer.disconnect();
      unregister();
      offPause();
      seek.current = () => {};
    };
  }, [film, scene, closeUp, cast]);

  const counts = { concepts: graph.nodes.length, relations: graph.edges.length };

  return (
    <div
      role="region"
      aria-labelledby="gateway-film-title"
      data-testid="gateway-film"
      data-gateway-film={film ? 'playing' : 'still'}
      className="relative mt-[var(--gateway-section-gap)] w-full"
    >
      <div
        ref={stage}
        className={cn(
          'relative w-full overflow-hidden',
          film ? 'h-[100svh] max-h-[60rem] min-h-[36rem]' : 'h-[34rem]',
        )}
      >
        <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" />
        {film ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[22%] bg-gradient-to-b from-transparent to-[color:var(--color-canvas)]"
          />
        ) : null}
        <div className={cn(PAGE_GUTTER, 'pointer-events-none absolute inset-x-0 top-[4.5rem]')}>
          <h2
            ref={column}
            id="gateway-film-title"
            className={cn(PAGE_COLUMN, 'text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]')}
          >
            {t('label')}
          </h2>
        </div>
        {film ? (
          <div className={cn(PAGE_GUTTER, 'pointer-events-none absolute inset-x-0 bottom-[5svh]')}>
            <div className={cn(PAGE_COLUMN, 'flex flex-col items-start')}>
              <ol className="grid w-full">
                {ACTS.map((act, i) => (
                  <li
                    key={act}
                    ref={(node) => {
                      captions.current[i] = node;
                    }}
                    className="invisible flex max-w-[40rem] flex-col self-end opacity-0 [grid-area:1/1]"
                  >
                    <h3 className="[text-wrap:balance] text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)] sm:text-hero-lg">
                      {t(`acts.${act}.title`)}
                    </h3>
                    <p className="mt-3 max-w-[30rem] text-title leading-title text-[color:var(--color-text-secondary)]">
                      {t(`acts.${act}.body`, counts)}
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
                className="pointer-events-auto mt-6"
              />
            </div>
          </div>
        ) : null}
      </div>
      {film ? null : (
        <div className={PAGE_GUTTER}>
          <ol className={cn(PAGE_COLUMN, 'mt-8 grid gap-6 @container sm:grid-cols-2 lg:grid-cols-5')}>
            {ACTS.map((act) => (
              <li key={act} className="min-w-0">
                <h3 className="text-title leading-title text-[color:var(--color-text-primary)]">
                  {t(`acts.${act}.title`)}
                </h3>
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
