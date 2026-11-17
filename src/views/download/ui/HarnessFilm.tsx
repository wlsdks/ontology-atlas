'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { isMotionPaused, subscribeMotionPause } from '@/shared/motion/motion-pause';
import { FONT_WEIGHT } from '@/shared/ui/tokens/font-weight';

import { createFilmClock } from '../lib/film-clock';
import {
  clamp01 as clamp,
  drawHitRing,
  drawKeyLight,
  drawStreak,
  easeInOut as inOut,
  lerp as mix,
  lightSprite,
  type CameraShot,
} from '../lib/film-kit';
import { registerGatedFrameClient } from '../lib/gateway-frame-loop';
import {
  AREAS,
  DIFF_ROWS,
  EXAMPLE_REPO,
  PANE1,
  PANE1_ROWS,
  PANE2,
  PANE3,
  PANE_TOP,
  PANES,
  SCAN,
  SETTINGS_LINES,
  SETTINGS_MISSING_LINE,
  SETTINGS_PATH,
  SLAB_SHARES,
  TOOL_NAMES,
  TREE,
  TYPE,
  TYPE_FLOOR,
  WINDOW,
  areaTotals,
  groupCounts,
  itemsOf,
  pane1Area,
  pane1Row,
  playingFrame,
  scanColumnX,
  scanGroupY,
  stillFrame,
  treeRowY,
  wireFor,
  type AreaId,
  type ExampleFile,
  type GroupId,
  type WindowFrame,
  type Wire,
} from '../lib/harness-scene';
import { FilmActBar } from './FilmActBar';

const ACTS = [1, 2, 3, 4] as const;
const ACT_SPANS = [
  [0, 0.25],
  [0.25, 0.5],
  [0.5, 0.75],
  [0.75, 1],
] as const;
/** Scan, filter, problem, copies that differ. */
const ACT_MS = [2600, 2600, 2800, 2800] as const;
const STARTS = [0, 2600, 5200, 8000] as const;
const TOTAL = 10800;
const CLOCK = { holdMs: 1800, fadeMs: 260 } as const;
/** Where a paused film rests in each act: the scan read, the Codex filter on, the problem opened, the whole screen. */
const SETTLE = [0.85, 0.8, 0.7, 0.9] as const;
const FILM_MIN_WIDTH = 768;
const SEEK_FADE = 300;

/* Captions: out in 120ms, in over 160ms with a 12px rise, the last act's line 40ms after its headline. */
const CAPTION_OUT = 120;
const CAPTION_IN = 160;
const CAPTION_LAG = 40;
const CAPTION_RISE = 12;

/* ---------- the timeline, in film milliseconds ---------- */

/** Act one: the bar comes in at the top of the tree and sweeps it. */
const BAR_IN = 240;
const SWEEP = [300, 1900] as const;
/** Each count rolls over this long; two landings on one area are kept at least this far apart. */
const ROLL = 160;
const LANDING_GAP = 200;
/** Act two, from 2600: the columns stack into pane 1 while panes 2 and 3 slide in. */
const STACK = [2600, 3160] as const;
const STACK_STAGGER = 20;
const PANES_IN = [2880, 3240] as const;
const FILTER_ON = [3900, 4140] as const;
const COLLAPSE_ON = [4000, 4240] as const;
const ROLL_ON = 4000;
const TOTAL_ON = 4080;
/** Act three, from 5200. */
const FILTER_OFF = [5200, 5440] as const;
const COLLAPSE_OFF = [5240, 5480] as const;
const ROLL_OFF = 5240;
const TOTAL_OFF = 5320;
const PROBLEM_IN = [5600, 5900] as const;
const MARKS_IN = [5720, 5960] as const;
const PRESS = 6100;
const UNDERLINE = [6700, 7000] as const;
const AMBER = [5600, 5900, 7400, 8000] as const;
/** Act four, from 8000. */
const TAG_IN = 8600;
const SPLIT = [8500, 8900] as const;
const INK_BARS = [8900, 9100] as const;

/** The marker's stops in pane 1: [from, to, group]. */
const GLIDES: ReadonlyArray<readonly [number, number, GroupId]> = [
  [3300, 3520, 'skills'],
  [6100, 6400, 'blockingHooks'],
  [8000, 8300, 'subagents'],
];
const FIRST_SELECTED: GroupId = 'instructions';

/** What panes 2 and 3 show, in turn: [id, in from, in to, out from, out to]. */
type PaneContent = 'instructions' | 'skills' | 'hooks' | 'subagents';
const CONTENTS: ReadonlyArray<readonly [PaneContent, number, number, number, number]> = [
  ['instructions', PANES_IN[0], PANES_IN[1], 3300, 3420],
  ['skills', 3440, 3700, PRESS, PRESS + 120],
  ['hooks', PRESS + 140, PRESS + 380, 8000, 8120],
  ['subagents', 8140, 8380, TOTAL + 1e6, TOTAL + 2e6],
];
const CONTENT_GROUP: Record<PaneContent, GroupId> = {
  instructions: 'instructions',
  skills: 'skills',
  hooks: 'blockingHooks',
  subagents: 'subagents',
};
/** Under Codex the selected skill hides, so the selection moves to its Codex twin. */
const RESELECT = [4000, 4240] as const;

/* ---------- the camera ---------- */

/** A shot that keeps window point (x, y) where it stands at zoom 1, magnified `zoom` times about it. */
function pivot(x: number, y: number, zoom: number): CameraShot {
  const cx = WINDOW.w / 2;
  const cy = WINDOW.h / 2;
  return { cx: x - (x - cx) / zoom, cy: y - (y - cy) / zoom, zoom };
}
const WHOLE = pivot(WINDOW.w / 2, WINDOW.h / 2, 1);
const SHOTS: ReadonlyArray<readonly [number, CameraShot]> = [
  [0, pivot(162, 40, 1.12)],
  [300, pivot(162, 40, 1.12)],
  [2000, WHOLE],
  [3200, WHOLE],
  [3800, pivot(300, 120, 1.18)],
  [4000, pivot(300, 120, 1.18)],
  [4400, pivot(900, 28, 1.08)],
  [5900, pivot(900, 28, 1.08)],
  [6600, pivot(680, 200, 1.3)],
  [8000, pivot(680, 200, 1.3)],
  [8600, pivot(840, 220, 1.3)],
  [9400, pivot(840, 220, 1.3)],
  [10200, WHOLE],
];

function keyed<V>(keys: ReadonlyArray<readonly [number, V]>, T: number, blend: (a: V, b: V, t: number) => V): V {
  if (T <= keys[0]![0]) return keys[0]![1];
  for (let i = 0; i < keys.length - 1; i += 1) {
    const [a, va] = keys[i]!;
    const [b, vb] = keys[i + 1]!;
    if (T < b) return blend(va, vb, inOut((T - a) / (b - a)));
  }
  return keys[keys.length - 1]![1];
}

const mixShot = (a: CameraShot, b: CameraShot, t: number): CameraShot => ({
  cx: mix(a.cx, b.cx, t),
  cy: mix(a.cy, b.cy, t),
  zoom: mix(a.zoom, b.zoom, t),
});
type Point = { x: number; y: number };
const mixPoint = (a: Point, b: Point, t: number): Point => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });

/** 0..1 of the way from `a` to `b`, eased. */
const io = (T: number, a: number, b: number) => inOut((T - a) / (b - a));

/** Film time (ms) at choreography progress `p`. */
function filmTime(p: number): number {
  if (p >= 1) return TOTAL;
  const act = Math.min(3, Math.max(0, Math.floor(p * 4)));
  return STARTS[act] + (p - act * 0.25) * 4 * ACT_MS[act];
}

/** The inverse of `inOut`, so a row can know when the scan line reaches it. */
function inOutInverse(y: number): number {
  const v = clamp(y);
  return v < 0.5 ? Math.cbrt(v / 4) : 1 - Math.cbrt(2 * (1 - v)) / 2;
}

/* ---------- words and colours ---------- */

interface Words {
  title: string;
  views: [string, string];
  all: string;
  sections: Record<AreaId, { title: string; caption: string }>;
  /** `harness.sectionTotal` for 0..40. */
  totals: string[];
  groups: Record<GroupId, string>;
  problemCount: string;
  problemBefore: string;
  problemAfter: string;
  problemShow: string;
  hookMissing: string;
  hookWired: string;
  differsFromCodex: string;
  differsFromClaude: string;
  readBy: string;
}

interface Palette {
  ink: string;
  soft: string;
  dim: string;
  panel: string;
  edge: string;
  hairline: string;
  well: string;
  raised: string;
  selected: string;
  selectedEdge: string;
  indigo: string;
  warn: string;
  warnInk: string;
  sans: string;
  mono: string;
}

function readPalette(): Palette {
  const root = getComputedStyle(document.documentElement);
  const v = (name: string) => root.getPropertyValue(name).trim();
  return {
    ink: v('--color-text-primary'),
    soft: v('--color-text-secondary'),
    dim: v('--color-text-tertiary'),
    panel: v('--color-panel'),
    edge: v('--color-border-strong'),
    hairline: v('--color-border-soft'),
    well: v('--color-overlay-1'),
    raised: v('--color-overlay-2'),
    selected: v('--color-indigo-a16'),
    selectedEdge: v('--color-indigo-pale-a28'),
    indigo: v('--map-indigo-bright'),
    warn: v('--color-status-warning'),
    warnInk: v('--color-amber-source-a90'),
    sans: v('--font-sans') || 'system-ui, sans-serif',
    mono: v('--font-mono') || 'ui-monospace, monospace',
  };
}

/** Text widths per font, measured once: the same words are drawn every frame. */
function widthCache(ctx: CanvasRenderingContext2D) {
  const known = new Map<string, number>();
  const measure = (text: string, font: string) => {
    const key = `${font}|${text}`;
    let width = known.get(key);
    if (width === undefined) {
      ctx.font = font;
      width = ctx.measureText(text).width;
      known.set(key, width);
    }
    return width;
  };
  return Object.assign(measure, { reset: () => known.clear() });
}

/**
 * Two token colours mixed in sRGB with their alpha, so a row can brighten as it is read or selected
 * without its colour switching at once.
 */
function colorMixer(ctx: CanvasRenderingContext2D) {
  const known = new Map<string, [number, number, number, number]>();
  const rgba = (color: string) => {
    let value = known.get(color);
    if (!value) {
      ctx.fillStyle = '#000';
      ctx.fillStyle = color;
      const normal = String(ctx.fillStyle);
      const hex = /^#([0-9a-f]{6})$/i.exec(normal)?.[1];
      const parts = hex ? [...[0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)), 1] : (normal.match(/[\d.]+/g) ?? []).map(Number);
      value = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
      known.set(color, value);
    }
    return value;
  };
  return (a: string, b: string, t: number) => {
    if (t <= 0.002) return a;
    if (t >= 0.998) return b;
    const x = rgba(a);
    const y = rgba(b);
    const [r, g, bl] = [0, 1, 2].map((i) => Math.round(mix(x[i]!, y[i]!, t)));
    return `rgb(${r} ${g} ${bl} / ${mix(x[3]!, y[3]!, t).toFixed(3)})`;
  };
}

/* ---------- the frame ---------- */

interface Fonts {
  title: string;
  tab: string;
  treeTitle: string;
  tree: string;
  sectionTitle: string;
  caption: string;
  total: string;
  unit: string;
  row: string;
  rowMono: string;
  areaTitle: string;
  small: string;
  smallMono: string;
  path: string;
  code: string;
  paneHead: string;
}

/** One white bar's place in window units. */
type Rect = { x: number; y: number; w: number; h: number };

interface Timing {
  /** When the scan line passes each tree row. */
  pass: number[];
  /** When each row's wire reaches its column. */
  land: number[];
  wires: Wire[];
  /** Per area, the first landing (for its ring). */
  firstLanding: Record<AreaId, number>;
  /** Per counter, its value changes in film time. */
  groupEvents: Record<GroupId, Array<[number, number]>>;
  areaEvents: Record<AreaId, Array<[number, number]>>;
}

interface Frame {
  ctx: CanvasRenderingContext2D;
  palette: Palette;
  words: Words;
  fonts: Fonts;
  measure: (text: string, font: string) => number;
  tint: (a: string, b: string, t: number) => string;
  sprites: { indigo: HTMLCanvasElement; amber: HTMLCanvasElement };
  timing: Timing;
  win: WindowFrame;
  /** Where the canvas fades out under the film's title and above its caption, in CSS pixels. */
  mask: { top: number; bottom: number } | null;
  maskFill: CanvasGradient | null;
  dpr: number;
  w: number;
  h: number;
  T: number;
  shot: CameraShot;
}

function fontsFor(s: number, p: Palette): Fonts {
  const px = (size: number) => Math.max(size, TYPE_FLOOR / s);
  return {
    title: `${FONT_WEIGHT.strong} ${px(TYPE.title)}px ${p.sans}`,
    tab: `${px(TYPE.tab)}px ${p.sans}`,
    treeTitle: `${px(TYPE.treeTitle)}px ${p.mono}`,
    tree: `${px(TYPE.tree)}px ${p.mono}`,
    sectionTitle: `${FONT_WEIGHT.strong} ${px(TYPE.sectionTitle)}px ${p.sans}`,
    caption: `${px(TYPE.caption)}px ${p.sans}`,
    total: `${FONT_WEIGHT.signature} ${px(TYPE.total)}px ${p.sans}`,
    unit: `${px(TYPE.row)}px ${p.sans}`,
    row: `${px(TYPE.row)}px ${p.sans}`,
    rowMono: `${px(TYPE.row)}px ${p.mono}`,
    areaTitle: `${FONT_WEIGHT.strong} ${px(TYPE.areaTitle)}px ${p.sans}`,
    small: `${px(TYPE.tag)}px ${p.sans}`,
    smallMono: `${px(TYPE.tag)}px ${p.mono}`,
    path: `${px(TYPE.path)}px ${p.mono}`,
    code: `${px(TYPE.code)}px ${p.mono}`,
    paneHead: `${FONT_WEIGHT.emphasis} ${px(TYPE.row)}px ${p.sans}`,
  };
}

/** The ratio of a font's size to the size it was asked for; the floor can make it larger. */
function sizeOf(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? Number(m[1]) : 16;
}

function buildTiming(): Timing {
  const wires = TREE.map((row, k) => wireFor(k, row.area));
  const span = SCAN.sweep.bottom - SCAN.sweep.top;
  const pass = TREE.map((_, k) => SWEEP[0] + (SWEEP[1] - SWEEP[0]) * inOutInverse((treeRowY(k) - SCAN.sweep.top) / span));
  const land: number[] = [];
  const last: Partial<Record<AreaId, number>> = {};
  TREE.forEach((row, k) => {
    let at = pass[k]! + 240 + wires[k]!.length * 0.22;
    const before = last[row.area];
    if (before !== undefined) at = Math.max(at, before + LANDING_GAP);
    last[row.area] = at;
    land.push(at);
  });
  const all = groupCounts(null);
  const codex = groupCounts('codex');
  const groups = AREAS.flatMap((area) => area.groups);
  const groupEvents = Object.fromEntries(groups.map((g) => [g, [] as Array<[number, number]>])) as Timing['groupEvents'];
  const areaEvents = Object.fromEntries(AREAS.map((a) => [a.id, [] as Array<[number, number]>])) as Timing['areaEvents'];
  const running: Record<string, number> = {};
  const order = TREE.map((_, k) => k).sort((a, b) => land[a]! - land[b]!);
  for (const k of order) {
    const row = TREE[k]!;
    for (const { group, n } of row.adds) {
      running[group] = (running[group] ?? 0) + n;
      groupEvents[group].push([land[k]!, running[group]!]);
    }
    running[row.area] = (running[row.area] ?? 0) + row.adds.reduce((sum, add) => sum + add.n, 0);
    areaEvents[row.area].push([land[k]!, running[row.area]!]);
  }
  /* The filter rolls each count in turn down pane 1, then back. */
  groups.forEach((group, i) => {
    if (codex[group] === all[group]) return;
    groupEvents[group].push([ROLL_ON + 30 * i, codex[group]], [ROLL_OFF + 30 * i, all[group]]);
  });
  const totalsAll = areaTotals(null);
  const totalsCodex = areaTotals('codex');
  AREAS.forEach((area, i) => {
    if (totalsCodex[area.id] === totalsAll[area.id]) return;
    areaEvents[area.id].push([TOTAL_ON + 40 * i, totalsCodex[area.id]], [TOTAL_OFF + 40 * i, totalsAll[area.id]]);
  });
  const firstLanding = Object.fromEntries(AREAS.map((a) => [a.id, areaEvents[a.id][0]?.[0] ?? Infinity])) as Record<AreaId, number>;
  return { pass, land, wires, firstLanding, groupEvents, areaEvents };
}

/** A count at time T: the value it is rolling from, the value it is rolling to, and how far, 0..1. */
function countAt(events: ReadonlyArray<readonly [number, number]>, T: number): { from: number; to: number; k: number } {
  let from = 0;
  let to = 0;
  let at = -Infinity;
  for (const [t, value] of events) {
    if (t > T) break;
    from = to;
    to = value;
    at = t;
  }
  const k = clamp((T - at) / ROLL);
  return k >= 1 ? { from: to, to, k: 1 } : { from, to, k };
}

/* ---------- drawing helpers, in window units ---------- */

function useWindow(f: Frame) {
  const { win, shot, dpr } = f;
  const z = shot.zoom;
  const scale = dpr * win.s * z;
  f.ctx.setTransform(
    scale,
    0,
    0,
    scale,
    dpr * (win.x + (WINDOW.w / 2) * win.s - shot.cx * win.s * z),
    dpr * (win.y + (WINDOW.h / 2) * win.s - shot.cy * win.s * z),
  );
}

/** A window point on the screen, in CSS pixels. */
function onScreen(f: Frame, x: number, y: number): Point {
  const { win, shot } = f;
  return {
    x: win.x + win.s * (WINDOW.w / 2 + (x - shot.cx) * shot.zoom),
    y: win.y + win.s * (WINDOW.h / 2 + (y - shot.cy) * shot.zoom),
  };
}

function text(
  f: Frame,
  value: string,
  x: number,
  y: number,
  font: string,
  color: string,
  alpha: number,
  align: CanvasTextAlign = 'left',
) {
  if (alpha <= 0.004 || !value) return;
  const { ctx } = f;
  ctx.globalAlpha = alpha;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}

/** Text drawn at one font size and scaled, so a size that changes every frame never re-rasterises glyphs per size. */
function scaledText(f: Frame, value: string, x: number, y: number, font: string, color: string, alpha: number, scale: number) {
  if (alpha <= 0.004 || !value) return;
  if (Math.abs(scale - 1) < 1e-3) return text(f, value, x, y, font, color, alpha);
  const { ctx } = f;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  text(f, value, 0, 0, font, color, alpha);
  ctx.restore();
}

function block(f: Frame, r: Rect, radius: number, color: string, alpha: number) {
  if (alpha <= 0.004 || r.w <= 0 || r.h <= 0) return;
  const { ctx } = f;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(radius, r.w / 2, r.h / 2));
  ctx.fill();
}

/** A 1px outline at any zoom. */
function outline(f: Frame, r: Rect, radius: number, color: string, alpha: number) {
  if (alpha <= 0.004) return;
  const { ctx } = f;
  const px = 1 / (f.win.s * f.shot.zoom);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = px;
  ctx.beginPath();
  ctx.roundRect(r.x + px / 2, r.y + px / 2, r.w - px, r.h - px, Math.min(radius, r.w / 2, r.h / 2));
  ctx.stroke();
}

function hairline(f: Frame, x0: number, y0: number, x1: number, y1: number, alpha: number) {
  if (alpha <= 0.004) return;
  const { ctx } = f;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = f.palette.hairline;
  ctx.lineWidth = 1 / (f.win.s * f.shot.zoom);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** A count rolling from one value to the next: the old one slides up and out, the new one up and in. */
function roll(
  f: Frame,
  from: string,
  to: string,
  k: number,
  x: number,
  y: number,
  font: string,
  color: string,
  alpha: number,
  align: CanvasTextAlign,
) {
  if (k >= 1 || from === to) return text(f, to, x, y, font, color, alpha, align);
  const { ctx } = f;
  const size = sizeOf(font);
  const e = inOut(k);
  const wide = Math.max(f.measure(from, font), f.measure(to, font)) + 4;
  const left = align === 'right' ? x - wide : align === 'center' ? x - wide / 2 : x - 2;
  const travel = size * 0.6;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, y - size * 0.6, wide + 4, size * 1.2);
  ctx.clip();
  text(f, from, x, y - travel * e, font, color, alpha * (1 - e), align);
  text(f, to, x, y + travel * (1 - e), font, color, alpha * e, align);
  ctx.restore();
}

/** Splits a localised total ("21개", "21 items") into its numeral and the words after it. */
function splitTotal(value: string, n: number): { numeral: string; unit: string; gap: string } {
  const digits = String(n);
  const at = value.indexOf(digits);
  if (at !== 0) return { numeral: value, unit: '', gap: '' };
  const rest = value.slice(digits.length);
  const unit = rest.trimStart();
  return { numeral: digits, unit, gap: rest.slice(0, rest.length - unit.length) };
}

/* ---------- the white bar ---------- */

function markerRect(y: number): Rect {
  return { x: 8, y: y - 9, w: 3, h: 18 };
}

/** The selected category's middle in pane 1. */
function selectedY(T: number): number {
  let y = pane1Row(FIRST_SELECTED).y;
  for (const [from, to, group] of GLIDES) {
    if (T < from) break;
    y = mix(y, pane1Row(group).y, io(T, from, to));
  }
  return y;
}

function scanY(T: number): number {
  return mix(SCAN.sweep.top, SCAN.sweep.bottom, io(T, SWEEP[0], SWEEP[1]));
}

function barAt(T: number): { r: Rect; alpha: number; fly: boolean } {
  const scan = (y: number): Rect => ({ x: SCAN.card.x, y: y - 1, w: SCAN.card.w, h: 2 });
  if (T < STARTS[1]) return { r: scan(scanY(T)), alpha: io(T, BAR_IN, BAR_IN + 120), fly: false };
  const morph = io(T, STACK[0], PANES_IN[1]);
  const marker = markerRect(selectedY(T));
  if (morph < 1) {
    /* The line narrows to a point first, travels, then stands up as the marker: never a white slab. */
    const a = scan(SCAN.sweep.bottom);
    const narrow = io(T, STACK[0], STACK[0] + 260);
    const stand = io(T, PANES_IN[1] - 220, PANES_IN[1]);
    const w = mix(a.w, marker.w, narrow);
    const h = mix(a.h, marker.h, stand);
    const cx = mix(a.x + a.w / 2, marker.x + marker.w / 2, morph);
    const cy = mix(a.y + a.h / 2, marker.y + marker.h / 2, morph);
    return { r: { x: cx - w / 2, y: cy - h / 2, w, h }, alpha: 1, fly: morph > 0 };
  }
  const gliding = GLIDES.some(([from, to]) => T > from && T < to);
  return { r: marker, alpha: 1, fly: gliding };
}

/* ---------- the window ---------- */

function drawChrome(f: Frame) {
  const { palette: p, words, fonts, T } = f;
  block(f, { x: 0, y: 0, w: WINDOW.w, h: WINDOW.h }, WINDOW.radius, p.panel, 1);
  text(f, words.title, 24, WINDOW.header / 2, fonts.title, p.ink, 1);
  /* The two views, Setup chosen. */
  const tabsX = 24 + f.measure(words.title, fonts.title) + 20;
  const tabW = words.views.map((view) => f.measure(view, fonts.tab) + 24);
  const well = { x: tabsX, y: 13, w: tabW[0]! + tabW[1]! + 3, h: 30 };
  block(f, well, 6, p.well, 1);
  outline(f, well, 6, p.hairline, 1);
  block(f, { x: tabsX + 1, y: 14, w: tabW[0]!, h: 28 }, 5, p.selected, 1);
  text(f, words.views[0], tabsX + 1 + tabW[0]! / 2, WINDOW.header / 2, fonts.tab, p.ink, 1, 'center');
  text(f, words.views[1], tabsX + 2 + tabW[0]! + tabW[1]! / 2, WINDOW.header / 2, fonts.tab, p.soft, 1, 'center');
  /* The tool filter, at the right: its fill slides to Codex in act two and back in act three. */
  const names = [words.all, TOOL_NAMES['claude-code'], TOOL_NAMES.codex];
  const segW = names.map((name) => f.measure(name, fonts.tab) + 24);
  const filterW = segW.reduce((a, b) => a + b, 0) + 4;
  const fx = 1016 - filterW;
  const filter = { x: fx, y: 13, w: filterW, h: 30 };
  block(f, filter, 6, p.well, 1);
  outline(f, filter, 6, p.hairline, 1);
  const segX = segW.map((_, i) => fx + 1 + segW.slice(0, i).reduce((a, b) => a + b, 0) + i);
  const at = 2 * io(T, FILTER_ON[0], FILTER_ON[1]) * (1 - io(T, FILTER_OFF[0], FILTER_OFF[1]));
  const lo = Math.floor(at);
  const hi = Math.min(2, lo + 1);
  const t = at - lo;
  block(f, { x: mix(segX[lo]!, segX[hi]!, t), y: 14, w: mix(segW[lo]!, segW[hi]!, t), h: 28 }, 5, p.selected, 1);
  names.forEach((name, i) => {
    const near = clamp(1 - Math.abs(at - i));
    text(f, name, segX[i]! + segW[i]! / 2, WINDOW.header / 2, fonts.tab, f.tint(p.soft, p.ink, near), 1, 'center');
  });
  hairline(f, 0, WINDOW.header, WINDOW.w, WINDOW.header, 1);
  return { filterSeg: (i: number) => ({ x: segX[i]! + segW[i]! / 2, y: WINDOW.header / 2 }) };
}

/* ---------- act one: the tree and the wires ---------- */

function drawScan(f: Frame) {
  const { palette: p, fonts, timing, T } = f;
  const gone = io(T, STACK[0], STACK[0] + 280);
  if (gone >= 1) return;
  const card = { ...SCAN.card, x: SCAN.card.x - 12 * gone };
  block(f, card, 10, p.well, 1 - gone);
  outline(f, card, 10, p.hairline, 1 - gone);
  text(f, EXAMPLE_REPO, card.x + 16, SCAN.titleY, fonts.treeTitle, p.ink, (1 - gone) * io(T, 0, 240));
  hairline(f, SCAN.guideX - 12 * gone, SCAN.sweep.top, SCAN.guideX - 12 * gone, SCAN.sweep.bottom - 10, (1 - gone) * io(T, 60, 360));
  TREE.forEach((row, k) => {
    const y = treeRowY(k);
    const show = io(T, 20 + 16 * k, 320 + 16 * k);
    const read = io(T, timing.pass[k]!, timing.pass[k]! + 160);
    text(f, row.path, SCAN.rowX - 12 * gone, y + 8 * (1 - show), fonts.tree, f.tint(p.soft, p.ink, read), show * (1 - gone) * mix(0.8, 1, read));
  });

  /* The wires: everything drawn so far in one stroke, so where they share the trunk they do not add up. */
  const { ctx } = f;
  const heads: Array<{ a: Point; b: Point }> = [];
  ctx.beginPath();
  TREE.forEach((_, k) => {
    const wire = timing.wires[k]!;
    const start = timing.pass[k]!;
    const travel = clamp((T - start) / (timing.land[k]! - start));
    if (travel <= 0) return;
    const reach = wire.length * inOut(travel);
    const pts = wire.points;
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    let i = 1;
    for (; i < pts.length && wire.at[i]! <= reach; i += 1) ctx.lineTo(pts[i]!.x, pts[i]!.y);
    let end = pts[i - 1]!;
    if (i < pts.length) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const t = (reach - wire.at[i - 1]!) / Math.max(1e-6, wire.at[i]! - wire.at[i - 1]!);
      end = mixPoint(a, b, t);
      ctx.lineTo(end.x, end.y);
    }
    if (travel < 1) {
      /* The head: the last 16 units of the wire, bright. */
      let j = i - 1;
      while (j > 0 && reach - wire.at[j]! < 16) j -= 1;
      heads.push({ a: pts[j]!, b: end });
    }
  });
  ctx.globalAlpha = 0.3 * (1 - io(T, STACK[0], STACK[0] + 240));
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  if (heads.length > 0) {
    ctx.beginPath();
    for (const head of heads) {
      ctx.moveTo(head.a.x, head.a.y);
      ctx.lineTo(head.b.x, head.b.y);
    }
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/* ---------- pane 1, which is act one's three columns stacked ---------- */

/**
 * How far area `a` has moved from its act-one column into pane 1: `m` overall, `y` and `x` for its
 * two legs. Each area drops to its pane-1 height in its own column, then slides left, so no two
 * areas ever cross.
 */
function stackOf(T: number, a: number): { m: number; x: number; y: number } {
  const t = clamp((T - STACK[0] - STACK_STAGGER * a) / (STACK[1] - STACK[0]));
  return { m: inOut(t), y: inOut(t / 0.55), x: inOut((t - 0.45) / 0.55) };
}

/** How far the Codex filter has taken effect, 0..1. */
function codexOf(T: number, [on0, on1]: readonly [number, number], [off0, off1]: readonly [number, number]): number {
  return io(T, on0, on1) * (1 - io(T, off0, off1));
}

function drawAreas(f: Frame) {
  const { palette: p, fonts, words, timing, T } = f;
  const codex = groupCounts('codex');
  const dimK = codexOf(T, COLLAPSE_ON, COLLAPSE_OFF);
  const marks = io(T, MARKS_IN[0], MARKS_IN[1]);
  const selectY = selectedY(T);
  const selecting = io(T, STACK[1] - 80, PANES_IN[1] + 40);

  /* The selected row: the tab's own selection fill, under the bar. */
  block(f, { x: 6, y: selectY - 12.5, w: 288, h: 25 }, 6, p.raised, selecting);

  AREAS.forEach((area, a) => {
    const { m, x: mx, y: my } = stackOf(T, a);
    const colX = scanColumnX(area.id);
    const head = pane1Area(area.id);
    const show = io(T, 80 + 60 * a, 440 + 60 * a);
    const rise = 12 * (1 - show);
    /* The section title: 22px at the column's head, 20px on its pane-1 row. */
    const titleX = mix(colX, PANE1.padX, mx);
    const titleY = mix(SCAN.colTitleY, head.y, my) + rise;
    scaledText(f, words.sections[area.id].title, titleX, titleY, fonts.sectionTitle, p.ink, show, mix(1, TYPE.areaTitle / TYPE.sectionTitle, m));
    /* The caption leaves as the column stacks. */
    const captionAlpha = show * (1 - clamp(m / 0.4));
    if (captionAlpha > 0.004) {
      wrap(f, words.sections[area.id].caption, fonts.caption, SCAN.colW).forEach((line, i) => {
        text(f, line, titleX, SCAN.captionY + i * SCAN.captionLH + rise - 30 * m, fonts.caption, p.soft, captionAlpha);
      });
    }
    /* The total: a 56px numeral that ticks during the scan, then the tab's small "21 items". */
    const total = countAt(timing.areaEvents[area.id], T);
    const lit = io(T, timing.firstLanding[area.id], timing.firstLanding[area.id] + 200);
    if (m <= 0) {
      drawBigTotal(f, total, colX, SCAN.totalY + rise, f.tint(p.soft, p.ink, lit), show * mix(0.55, 1, lit));
    } else if (m >= 1) {
      const color = p.soft;
      const markW = marks > 0 && area.id === 'guardrails' ? problemMarkWidth(f) : 0;
      if (markW > 0) drawProblemMark(f, PANE1.right - f.measure(words.totals[total.to] ?? '', fonts.small) - 10 - markW, head.y, marks);
      roll(f, words.totals[total.from] ?? '', words.totals[total.to] ?? '', total.k, PANE1.right, head.y, fonts.small, color, 1, 'right');
    } else {
      morphTotal(f, total.to, colX, SCAN.totalY, head.y, { m, x: mx, y: my }, show);
    }

    area.groups.forEach((group) => {
      const row = pane1Row(group);
      const x = mix(colX, PANE1.padX, mx);
      const y = mix(scanGroupY(group), row.y, my) + rise;
      const right = mix(colX + SCAN.colW, PANE1.right, mx);
      const count = countAt(timing.groupEvents[group], T);
      const empty = codex[group] === 0 ? dimK : 0;
      const alpha = show * mix(1, 0.35, empty);
      const chosen = selecting * clamp(1 - Math.abs(selectY - row.y) / PANE1.row);
      /* A category the scan has not reached yet reads dimmer, and brightens as its first files land. */
      const filled = T >= STARTS[1] || count.from > 0 ? 1 : count.to === 0 ? 0 : inOut(count.k);
      text(f, words.groups[group], x, y, fonts.row, f.tint(p.soft, p.ink, chosen), alpha * mix(0.7, 1, filled));
      roll(f, String(count.from), String(count.to), count.k, right, y, fonts.rowMono, f.tint(p.dim, p.soft, filled), alpha, 'right');
      if (group === 'blockingHooks' && marks > 0) {
        drawProblemMark(f, right - f.measure(String(count.to), fonts.rowMono) - 10 - problemMarkWidth(f), y, marks);
      }
    });
  });
}

/** Simple word wrap for a caption under a column; at most two lines, the second ending in "…" if it must. */
function wrap(f: Frame, value: string, font: string, width: number): string[] {
  if (f.measure(value, font) <= width) return [value];
  const words = value.split(' ');
  if (words.length === 1) return [value];
  let first = '';
  let k = 0;
  for (; k < words.length; k += 1) {
    const next = first ? `${first} ${words[k]}` : words[k]!;
    if (f.measure(next, font) > width && first) break;
    first = next;
  }
  let second = words.slice(k).join(' ');
  while (second.length > 1 && f.measure(second, font) > width) second = `${second.slice(0, -2)}…`;
  return second ? [first, second] : [first];
}

function drawBigTotal(f: Frame, total: { from: number; to: number; k: number }, x: number, y: number, color: string, alpha: number) {
  const { fonts, words, palette: p } = f;
  const from = splitTotal(words.totals[total.from] ?? '', total.from);
  const to = splitTotal(words.totals[total.to] ?? '', total.to);
  const e = inOut(total.k);
  roll(f, from.numeral, to.numeral, total.k, x, y, fonts.total, color, alpha, 'left');
  const unitX = x + mix(f.measure(from.numeral, fonts.total), f.measure(to.numeral, fonts.total), e) + 8;
  const unitY = y + sizeOf(fonts.total) * 0.2;
  if (from.unit === to.unit) text(f, to.unit, unitX, unitY, fonts.unit, p.soft, alpha);
  else {
    text(f, from.unit, unitX, unitY, fonts.unit, p.soft, alpha * (1 - e));
    text(f, to.unit, unitX, unitY, fonts.unit, p.soft, alpha * e);
  }
}

/** The 56px numeral and its unit, shrinking into the tab's right-aligned total as the column stacks. */
function morphTotal(f: Frame, n: number, colX: number, fromY: number, toY: number, { m, x: mx, y: my }: { m: number; x: number; y: number }, alpha: number) {
  const { fonts, words, palette: p } = f;
  const value = words.totals[n] ?? '';
  const { numeral, unit, gap } = splitTotal(value, n);
  const big = sizeOf(fonts.total);
  const small = sizeOf(fonts.small);
  const unitBig = sizeOf(fonts.unit);
  const unitW = f.measure(unit, fonts.small);
  const gapW = gap ? f.measure(value, fonts.small) - f.measure(numeral, fonts.small) - unitW : 0;
  const numEndX = PANE1.right - unitW - gapW - f.measure(numeral, fonts.small);
  const numScale = mix(1, small / big, m);
  const numX = mix(colX, numEndX, mx);
  const y = mix(fromY, toY, my);
  scaledText(f, numeral, numX, y, fonts.total, f.tint(p.ink, p.soft, m), alpha, numScale);
  const unitStartX = colX + f.measure(numeral, fonts.total) + 8;
  const unitEndX = PANE1.right - unitW;
  const unitY = mix(fromY + big * 0.2, toY, my);
  scaledText(f, unit, mix(unitStartX, unitEndX, mx), unitY, fonts.unit, p.soft, alpha, mix(1, small / unitBig, m));
}

function problemMarkWidth(f: Frame): number {
  return 8 + f.measure('1', f.fonts.small);
}

/** The tab's problem mark: an amber dot and the count, left of a row's own count. */
function drawProblemMark(f: Frame, x: number, y: number, alpha: number) {
  const { ctx, palette: p } = f;
  if (alpha <= 0.004) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p.warnInk;
  ctx.beginPath();
  ctx.arc(x + 3, y, 3, 0, Math.PI * 2);
  ctx.fill();
  text(f, '1', x + 8, y, f.fonts.small, p.warnInk, alpha);
}

/* ---------- panes 2 and 3 ---------- */

/** Each content's opacity and how far it still has to rise. */
function contentsAt(T: number): Array<{ id: PaneContent; a: number; since: number }> {
  return CONTENTS.flatMap(([id, in0, in1, out0, out1]) => {
    const a = io(T, in0, in1) * (1 - io(T, out0, out1));
    return a > 0.004 ? [{ id, a, since: T - in0 }] : [];
  });
}

function drawPanes(f: Frame) {
  const { palette: p, T } = f;
  const pin = io(T, PANES_IN[0], PANES_IN[1]);
  if (pin <= 0) return;
  const dx = 24 * (1 - pin);
  hairline(f, 0, PANE_TOP, WINDOW.w, PANE_TOP, pin);
  hairline(f, PANES[1].x, PANE_TOP, PANES[1].x, WINDOW.h, pin);
  hairline(f, PANES[2].x + dx, PANE_TOP, PANES[2].x + dx, WINDOW.h, pin);
  void p;
  for (const content of contentsAt(T)) {
    drawItems(f, content.id, content.a * pin, dx, content.since);
    drawDetail(f, content.id, content.a * pin, dx, content.since);
  }
}

/** Rows of pane 2 for a content: label, the line under it, whether it collapses under Codex. */
function itemsFor(id: PaneContent): ExampleFile[] {
  return itemsOf(CONTENT_GROUP[id]);
}

function drawItems(f: Frame, id: PaneContent, alpha: number, dx: number, since: number) {
  const { palette: p, fonts, words, T } = f;
  const items = itemsFor(id);
  const x = PANE2.x + dx;
  const k = id === 'skills' ? codexOf(T, COLLAPSE_ON, COLLAPSE_OFF) : 0;
  const shown = (file: ExampleFile) => (file.tools.length === 0 || file.tools.includes('codex') ? 1 : 1 - k);
  /* The heading: the category and its total, which rolls with the filter. */
  const all = items.length;
  const codex = items.filter((file) => file.tools.length === 0 || file.tools.includes('codex')).length;
  const total = id === 'skills' ? countAt([[0, all], [ROLL_ON + 40, codex], [ROLL_OFF + 40, all]], T) : { from: all, to: all, k: 1 };
  const rise = 8 * (1 - clamp(since / 240));
  text(f, words.groups[CONTENT_GROUP[id]], x + PANE2.padX, PANE2.headY + rise, fonts.paneHead, p.ink, alpha);
  roll(f, words.totals[total.from] ?? '', words.totals[total.to] ?? '', total.k, x + PANE2.w - PANE2.padX, PANE2.headY + rise, fonts.small, p.soft, alpha, 'right');

  const tops: number[] = [];
  let top = PANE2.rowsTop;
  for (const file of items) {
    tops.push(top);
    top += PANE2.row * shown(file);
  }
  /* The selection fill, under the rows: the first item; under Codex, the skill's twin. */
  const moved = id === 'skills' ? io(T, RESELECT[0], RESELECT[1]) : 0;
  const select = (row: number, a: number) => block(f, { x, y: tops[row]! + 1 + rise, w: PANE2.w, h: PANE2.row - 2 }, 6, p.raised, a);
  select(0, alpha * (1 - moved));
  if (moved > 0) select(1, alpha * moved);
  items.forEach((file, i) => {
    const h = PANE2.row * shown(file);
    const enter = inOut(clamp((since - 30 * i) / 240));
    const a = alpha * enter * clamp(shown(file) * 1.6 - 0.6);
    const chosen = i === 0 ? 1 - moved : i === 1 ? moved : 0;
    if (h > 0.5 && a > 0.004) drawItemRow(f, id, file, chosen, x, tops[i]! + 8 * (1 - enter), h, a);
  });
}

function drawItemRow(f: Frame, id: PaneContent, file: ExampleFile, chosen: number, x: number, top: number, h: number, alpha: number) {
  const { palette: p, fonts, words, ctx, T } = f;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top, PANE2.w, h);
  ctx.clip();
  text(f, file.label, x + PANE2.padX, top + 14, fonts.rowMono, f.tint(p.soft, p.ink, chosen), alpha);
  let cx = x + PANE2.padX;
  const y2 = top + 32;
  if (file.event) {
    text(f, file.event, cx, y2, fonts.smallMono, p.dim, alpha);
    cx += f.measure(file.event, fonts.smallMono) + 10;
  }
  /* Tool names show only under All, as in the tab. */
  const toolsShown = id === 'skills' ? 1 - codexOf(T, COLLAPSE_ON, COLLAPSE_OFF) : 1;
  if (file.tools.length > 0) {
    const name = TOOL_NAMES[file.tools[0]!];
    text(f, name, cx, y2, fonts.small, p.dim, alpha * toolsShown);
    cx += f.measure(name, fonts.small) + 10;
  }
  if (id === 'hooks') {
    text(f, file.missing ? words.hookMissing : words.hookWired, cx, y2, fonts.small, file.missing ? p.warnInk : p.dim, alpha);
  }
  if (id === 'subagents' && file.differs) {
    const tag = file.differs === 'codex' ? words.differsFromCodex : words.differsFromClaude;
    const at = file.differs === 'codex' ? TAG_IN : TAG_IN + 80;
    const lit = io(T, at, at + 240);
    const r = { x: cx, y: y2 - 10, w: f.measure(tag, fonts.small) + 14, h: 20 };
    block(f, { ...r, y: r.y + 6 * (1 - lit) }, 6, p.raised, alpha * lit);
    outline(f, { ...r, y: r.y + 6 * (1 - lit) }, 6, p.edge, alpha * lit);
    text(f, tag, r.x + 7, y2 + 6 * (1 - lit), fonts.small, p.soft, alpha * lit);
  }
  ctx.restore();
}

/** Pane 3: the selected item's path, who reads it, then its content. */
function drawDetail(f: Frame, id: PaneContent, alpha: number, dx: number, since: number) {
  const { palette: p, fonts, words, T } = f;
  const rise = 8 * (1 - clamp(since / 240));
  const x = PANE3.x + dx;
  const reselect = id === 'skills' ? io(T, RESELECT[0], RESELECT[1]) : 0;
  const reselectBack = 1 - reselect;
  const detail = detailOf(id);
  const box = { ...PANE3.box, x: PANE3.box.x + dx, y: PANE3.box.y + rise };
  block(f, box, 8, p.well, alpha);
  outline(f, box, 8, p.hairline, alpha);
  if (id === 'skills') {
    /* The selected skill and its Codex twin trade places when the filter hides the first. */
    text(f, '.claude/skills/code-review/', x, PANE3.pathY + rise - 6 * reselect, fonts.path, p.ink, alpha * reselectBack);
    text(f, '.agents/skills/code-review/', x, PANE3.pathY + rise + 6 * reselectBack, fonts.path, p.ink, alpha * reselect);
    text(f, words.readBy, x, PANE3.readByY + rise, fonts.small, p.dim, alpha);
    text(f, TOOL_NAMES['claude-code'], PANE3.readByValueX + dx, PANE3.readByY + rise, fonts.row, p.ink, alpha * reselectBack);
    text(f, TOOL_NAMES.codex, PANE3.readByValueX + dx, PANE3.readByY + rise, fonts.row, p.ink, alpha * reselect);
  } else {
    text(f, detail.path, x, PANE3.pathY + rise, fonts.path, p.ink, alpha);
    text(f, words.readBy, x, PANE3.readByY + rise, fonts.small, p.dim, alpha);
    text(f, detail.readBy, PANE3.readByValueX + dx, PANE3.readByY + rise, fonts.row, p.ink, alpha);
  }
  const inner = box.x + 20;
  const room = box.w - 40;
  if (id === 'hooks') {
    SETTINGS_LINES.forEach((line, k) => {
      const y = PANE3.lineTop + rise + PANE3.lineH * k;
      const missing = k === SETTINGS_MISSING_LINE;
      const font = fitFont(f, line, fonts.code, room);
      text(f, line, inner, y, font, missing ? p.ink : p.soft, alpha);
      if (missing) {
        const indent = f.measure(line.slice(0, line.length - line.trimStart().length), font);
        const width = f.measure(line.trimStart(), font);
        const drawn = io(T, UNDERLINE[0], UNDERLINE[1]);
        block(f, { x: inner + indent, y: y + sizeOf(font) * 0.62, w: width * drawn, h: 2 }, 1, p.warn, alpha);
      }
    });
    slabs(f, inner, PANE3.lineTop + rise + PANE3.lineH * SETTINGS_LINES.length, room, 5, alpha * 0.8);
    return;
  }
  if (id === 'subagents') {
    drawDiff(f, inner, room, rise, alpha);
    return;
  }
  slabs(f, inner, PANE3.lineTop + rise, room, 9, alpha);
}

function detailOf(id: PaneContent): { path: string; readBy: string } {
  if (id === 'instructions') return { path: 'AGENTS.md', readBy: TOOL_NAMES.codex };
  if (id === 'hooks') return { path: SETTINGS_PATH, readBy: TOOL_NAMES['claude-code'] };
  return { path: '.claude/agents/reviewer.md', readBy: TOOL_NAMES['claude-code'] };
}

/** The font that fits `value` in `room`: smaller only when it must be, never under the floor. */
function fitFont(f: Frame, value: string, font: string, room: number): string {
  const width = f.measure(value, font);
  if (width <= room) return font;
  const size = sizeOf(font);
  const fitted = Math.max(TYPE_FLOOR / f.win.s, (size * room) / width);
  return font.replace(/\d+(?:\.\d+)?px/, `${fitted.toFixed(2)}px`);
}

/** Blank lines of a file the film does not spell out. */
function slabs(f: Frame, x: number, y: number, room: number, count: number, alpha: number) {
  for (let k = 0; k < count; k += 1) {
    const share = SLAB_SHARES[k % SLAB_SHARES.length]!;
    block(f, { x, y: y + PANE3.lineH * k - 4, w: room * share, h: 8 }, 3, f.palette.edge, alpha * 0.7);
  }
}

/** The two copies side by side on shared rows; the one row that differs is spelled out with an ink bar. */
function drawDiff(f: Frame, inner: number, room: number, rise: number, alpha: number) {
  const { palette: p, fonts, T } = f;
  const gap = 16;
  const colW = (room - gap) / 2;
  const split = io(T, SPLIT[0], SPLIT[1]);
  const col2X = mix(inner, inner + colW + gap, split);
  const heads = [TOOL_NAMES['claude-code'], TOOL_NAMES.codex];
  const headY = PANE3.lineTop + rise;
  text(f, heads[0]!, inner, headY, fonts.small, p.soft, alpha);
  text(f, heads[1]!, col2X, headY, fonts.small, p.soft, alpha * split);
  hairline(f, inner + colW + gap / 2, headY - 10, inner + colW + gap / 2, headY - 10 + (PANE3.lineH * (DIFF_ROWS.length + 1)) * split, alpha * split);
  const bars = io(T, INK_BARS[0], INK_BARS[1]);
  DIFF_ROWS.forEach((row, k) => {
    const y = headY + PANE3.lineH * (k + 1.2);
    const share = SLAB_SHARES[(k + 2) % SLAB_SHARES.length]!;
    if (!row) {
      block(f, { x: inner, y: y - 4, w: colW * share, h: 8 }, 3, p.edge, alpha * 0.7);
      block(f, { x: col2X, y: y - 4, w: colW * share, h: 8 }, 3, p.edge, alpha * 0.7 * split);
      return;
    }
    [row[0], row[1]].forEach((value, c) => {
      const x = c === 0 ? inner : col2X;
      const a = c === 0 ? alpha : alpha * split;
      const font = fitFont(f, value, fonts.code, colW - 10);
      block(f, { x, y: y - 11 * bars, w: 2, h: 22 * bars }, 1, p.ink, a);
      text(f, value, x + 10, y, font, p.ink, a);
    });
  });
}

/* ---------- light, beats, mask ---------- */

/** What the key light rests on, in window units, after act one (where it rides the scan line). */
const LIGHT: ReadonlyArray<readonly [number, Point]> = [
  [STARTS[1], { x: 162, y: SCAN.sweep.bottom }],
  [3200, { x: 150, y: pane1Row('instructions').y }],
  [3300, { x: 150, y: pane1Row('instructions').y }],
  [3520, { x: 150, y: pane1Row('skills').y }],
  [3760, { x: 470, y: 230 }],
  [3900, { x: 470, y: 230 }],
  [4140, { x: 900, y: 40 }],
  [4400, { x: 150, y: 260 }],
  [5300, { x: 150, y: 260 }],
  [5700, { x: 380, y: 74 }],
  [6100, { x: 700, y: 74 }],
  [6500, { x: 470, y: 180 }],
  [6900, { x: 840, y: 260 }],
  [7700, { x: 840, y: 260 }],
  [8200, { x: 470, y: 170 }],
  [8700, { x: 840, y: 270 }],
  [9400, { x: 840, y: 270 }],
  [10200, { x: WINDOW.w / 2, y: WINDOW.h / 2 }],
];

function drawLight(f: Frame) {
  const { T, sprites, win, shot } = f;
  const at = T < STARTS[1] ? { x: 162, y: scanY(T) } : keyed(LIGHT, T, mixPoint);
  const p = onScreen(f, at.x, at.y);
  const amber = io(T, AMBER[0], AMBER[1]) * (1 - io(T, AMBER[2], AMBER[3]));
  const strength = 0.12 * io(T, 0, 400);
  const radius = 300 * win.s * Math.sqrt(shot.zoom);
  f.ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
  drawKeyLight(f.ctx, sprites.indigo, p.x, p.y, radius, strength * (1 - amber));
  drawKeyLight(f.ctx, sprites.amber, p.x, p.y, radius, strength * amber);
}

function drawRings(f: Frame, chrome: { filterSeg: (i: number) => Point }) {
  const { ctx, T, palette: p, timing, fonts, words } = f;
  ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
  const ring = (x: number, y: number, at: number, color: string) => {
    const q = onScreen(f, x, y);
    drawHitRing(ctx, q.x, q.y, T - at, color);
  };
  AREAS.forEach((area) => {
    const first = timing.firstLanding[area.id];
    const numeral = splitTotal(words.totals[1] ?? '', 1).numeral;
    ring(scanColumnX(area.id) + f.measure(numeral, fonts.total) / 2, SCAN.totalY, first, p.indigo);
  });
  const codexSeg = chrome.filterSeg(2);
  ring(codexSeg.x, codexSeg.y, FILTER_ON[1], p.ink);
  const chip = problemChip(f);
  ring(chip.x + chip.w / 2, chip.y + chip.h / 2, PRESS, p.warn);
  const tagW = f.measure(words.differsFromCodex, fonts.small) + 14;
  ring(PANE2.x + PANE2.padX + f.measure(TOOL_NAMES['claude-code'], fonts.small) + 10 + tagW / 2, PANE2.rowsTop + 32, TAG_IN, p.ink);
}

/* ---------- the problem line ---------- */

function problemChip(f: Frame): Rect {
  const { fonts, words } = f;
  const x0 = 50;
  const pieces =
    f.measure(words.problemCount, fonts.row) +
    f.measure(' · ', fonts.row) +
    f.measure(words.problemBefore, fonts.row) +
    f.measure('.claude/hooks/block-force-push.sh', fonts.rowMono) +
    f.measure(words.problemAfter, fonts.row);
  return { x: x0 + pieces + 14, y: 74 - 13, w: f.measure(words.problemShow, fonts.small) + 20, h: 26 };
}

function drawProblem(f: Frame) {
  const { palette: p, fonts, words, T, ctx } = f;
  const show = io(T, PROBLEM_IN[0], PROBLEM_IN[1]);
  if (show <= 0.004) return;
  const y = 74 + 12 * (1 - show);
  /* The tab's warning triangle. */
  ctx.globalAlpha = show;
  ctx.strokeStyle = p.warn;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(32, y - 8);
  ctx.lineTo(41, y + 7);
  ctx.lineTo(23, y + 7);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = p.warn;
  ctx.fillRect(31.3, y - 3, 1.4, 5);
  ctx.fillRect(31.3, y + 3.6, 1.4, 1.4);
  let x = 50;
  const put = (value: string, font: string, color: string) => {
    text(f, value, x, y, font, color, show);
    x += f.measure(value, font);
  };
  put(words.problemCount, fonts.row, p.ink);
  put(' · ', fonts.row, p.soft);
  put(words.problemBefore, fonts.row, p.soft);
  put('.claude/hooks/block-force-push.sh', fonts.rowMono, p.soft);
  put(words.problemAfter, fonts.row, p.soft);
  const chip = problemChip(f);
  const r = { ...chip, y: chip.y + 12 * (1 - show) };
  const pressed = io(T, PRESS - 60, PRESS) * (1 - io(T, PRESS + 120, PRESS + 360));
  block(f, r, 6, p.selected, show * pressed);
  outline(f, r, 6, f.palette.hairline, show * (1 - pressed));
  outline(f, r, 6, f.palette.selectedEdge, show * pressed);
  text(f, words.problemShow, r.x + r.w / 2, y, fonts.small, p.ink, show, 'center');
}

/* ---------- the whole frame ---------- */

function drawHarness(f: Frame) {
  const { ctx } = f;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  f.shot = keyed(SHOTS, f.T, mixShot);
  ctx.textBaseline = 'middle';

  useWindow(f);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, WINDOW.w, WINDOW.h, WINDOW.radius);
  ctx.clip();
  const chrome = drawChrome(f);
  ctx.restore();
  drawLight(f);
  useWindow(f);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, WINDOW.w, WINDOW.h, WINDOW.radius);
  ctx.clip();
  drawScan(f);
  drawAreas(f);
  drawPanes(f);
  drawProblem(f);

  /* The white bar, with a streak while it flies. */
  const bar = barAt(f.T);
  if (bar.alpha > 0.004) {
    if (bar.fly) {
      const was = barAt(Math.max(0, f.T - 48));
      const a = { x: was.r.x + was.r.w / 2, y: was.r.y + was.r.h / 2 };
      const b = { x: bar.r.x + bar.r.w / 2, y: bar.r.y + bar.r.h / 2 };
      drawStreak(ctx, a, b, f.palette.ink, 0.35, 2);
    }
    block(f, bar.r, 1, f.palette.ink, bar.alpha);
  }
  ctx.restore();
  outline(f, { x: 0, y: 0, w: WINDOW.w, h: WINDOW.h }, WINDOW.radius, f.palette.edge, 1);
  drawRings(f, chrome);

  /* Fade the picture out under the film's title and above its caption, where a push-in carries it. */
  if (f.maskFill) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = f.maskFill;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = 1;
}

/* ---------- captions ---------- */

function captionAt(i: number, T: number) {
  const start = STARTS[i]!;
  const end = i + 1 < STARTS.length ? STARTS[i + 1]! : Infinity;
  const out = 1 - inOut((T - (end - CAPTION_OUT)) / CAPTION_OUT);
  return {
    head: inOut((T - start) / CAPTION_IN) * out,
    body: inOut((T - start - CAPTION_LAG) / CAPTION_IN) * out,
  };
}

function setRise(el: HTMLElement | null | undefined, lit: number) {
  if (!el) return;
  el.style.opacity = String(lit);
  el.style.transform = `translateY(${(1 - lit) * CAPTION_RISE}px)`;
}

function useWords(): Words {
  const t = useTranslations('download.harnessFilm.screen');
  const groups = useTranslations('harness.groups');
  return useMemo(() => {
    const marker = '\u0000';
    const [before = '', after = ''] = t('problemHookMissing', { path: marker }).split(marker);
    const group = (id: GroupId) => groups(id);
    return {
      title: t('title'),
      views: [t('views.overview'), t('views.architecture')],
      all: t('toolAll'),
      sections: {
        context: { title: t('sections.context.title'), caption: t('sections.context.caption') },
        guardrails: { title: t('sections.guardrails.title'), caption: t('sections.guardrails.caption') },
        verification: { title: t('sections.verification.title'), caption: t('sections.verification.caption') },
      },
      totals: Array.from({ length: 41 }, (_, n) => t('sectionTotal', { count: n })),
      groups: Object.fromEntries(AREAS.flatMap((area) => area.groups.map((id) => [id, group(id)]))) as Record<GroupId, string>,
      problemCount: t('problemCount', { count: 1 }),
      problemBefore: before,
      problemAfter: after,
      problemShow: t('problemShow', { count: 1 }),
      hookMissing: t('hookMissing'),
      hookWired: t('hookWired'),
      differsFromCodex: t('differsFromCodex'),
      differsFromClaude: t('differsFromClaude'),
      readBy: t('detailReadBy'),
    };
  }, [t, groups]);
}

type Mode = 'list' | 'still' | 'playing';

/**
 * The page's second film: the app's Harness › Setup screen reading an example repository. One scan
 * sorts its agent files into Context, Guardrails and Verification; a tool filter narrows every
 * list and count; a missing hook script surfaces as one line; a subagent whose Claude Code and
 * Codex copies differ is tagged and shown side by side. One white bar carries it: the scan line,
 * then the selection marker. Under reduced motion the last frame is drawn still above the acts as
 * a list; without a script, or narrower than 768px, the acts are the list alone.
 */
export function HarnessFilm() {
  const t = useTranslations('download.harnessFilm');
  const words = useWords();
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const captionBlock = useRef<HTMLDivElement>(null);
  const captions = useRef<(HTMLLIElement | null)[]>([]);
  const heads = useRef<(HTMLHeadingElement | null)[]>([]);
  const bodies = useRef<(HTMLParagraphElement | null)[]>([]);
  const fills = useRef<(HTMLSpanElement | null)[]>([]);
  const seek = useRef<(act: number) => void>(() => {});
  const [mode, setMode] = useState<Mode>('list');
  const timing = useMemo(buildTiming, []);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    /* Below this the three panes cannot stand side by side, so the film rests as a list. */
    const wide = matchMedia(`(min-width: ${FILM_MIN_WIDTH}px)`);
    let id = 0;
    const decide = () => {
      cancelAnimationFrame(id);
      const next: Mode = !wide.matches ? 'list' : reduced.matches || typeof IntersectionObserver === 'undefined' ? 'still' : 'playing';
      id = requestAnimationFrame(() => setMode(next));
    };
    decide();
    wide.addEventListener('change', decide);
    reduced.addEventListener?.('change', decide);
    return () => {
      cancelAnimationFrame(id);
      wide.removeEventListener('change', decide);
      reduced.removeEventListener?.('change', decide);
    };
  }, []);

  useEffect(() => {
    const el = canvas.current;
    const host = stage.current;
    const ctx = el?.getContext('2d');
    if (mode === 'list' || !el || !host || !ctx) return;
    const playing = mode === 'playing';
    const palette = readPalette();
    const measure = widthCache(ctx);
    const frame: Frame = {
      ctx,
      palette,
      words,
      fonts: fontsFor(1, palette),
      measure,
      tint: colorMixer(ctx),
      sprites: { indigo: lightSprite(palette.indigo), amber: lightSprite(palette.warn) },
      timing,
      win: { x: 0, y: 0, s: 1 },
      mask: null,
      maskFill: null,
      dpr: 1,
      w: 0,
      h: 0,
      T: playing ? 0 : TOTAL,
      shot: WHOLE,
    };

    const time = createFilmClock(ACT_SPANS, ACT_MS, CLOCK);
    let veil = 1;
    const paint = (p: number) => {
      frame.T = playing ? filmTime(p) : TOTAL;
      drawHarness(frame);
      if (!playing) return;
      const light = isMotionPaused() ? 1 : time.fade() * veil;
      el.style.opacity = String(light);
      captions.current.forEach((caption, i) => {
        if (!caption) return;
        const { head, body } = captionAt(i, frame.T);
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
    let p = 0;
    /* One frame from each act before the film shows, so no act's first frame pays for new type sizes or code paths. */
    const warm = () => {
      const keep = frame.T;
      for (const T of [1200, 2900, 3600, 4200, 5800, 6800, 8500, 9000, TOTAL]) {
        frame.T = T;
        drawHarness(frame);
      }
      frame.T = keep;
    };
    const resize = () => {
      frame.w = el.clientWidth;
      frame.h = el.clientHeight;
      /* The backing store stays under six million pixels, so a large screen draws at a lower density. */
      frame.dpr = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(6e6 / Math.max(1, frame.w * frame.h)));
      el.width = Math.round(frame.w * frame.dpr);
      el.height = Math.round(frame.h * frame.dpr);
      /* `--gateway-origin` is a registered length, so it reads back resolved to px. */
      const origin = parseFloat(getComputedStyle(host).getPropertyValue('--gateway-origin')) || 200;
      if (playing) {
        /* Read without transforms: the captions rise by transform, their box does not move. */
        const origin0 = el.getBoundingClientRect().top;
        const labelBottom = label.current ? label.current.getBoundingClientRect().bottom - origin0 : 100;
        const captionTop = captionBlock.current ? captionBlock.current.getBoundingClientRect().top - origin0 : frame.h - 200;
        const top = Math.max(104, labelBottom + 8);
        frame.win = playingFrame(frame.w, origin, top, captionTop - 28);
        frame.mask = { top: labelBottom, bottom: captionTop };
        const g = ctx.createLinearGradient(0, 0, 0, el.height);
        const stop = (y: number) => clamp(y / Math.max(1, frame.h));
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(stop(labelBottom - 4), 'rgba(0,0,0,0)');
        g.addColorStop(stop(Math.min(top - 1, labelBottom + 12)), 'rgba(0,0,0,1)');
        g.addColorStop(stop(captionTop - 24), 'rgba(0,0,0,1)');
        g.addColorStop(stop(captionTop - 4), 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        frame.maskFill = g;
      } else {
        frame.win = stillFrame(frame.w, frame.h, origin);
        frame.mask = null;
        frame.maskFill = null;
      }
      frame.fonts = fontsFor(frame.win.s, palette);
      warm();
      paint(p);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    /* Words are measured in the page's faces; once they have loaded, measure again. */
    let live = true;
    void document.fonts?.ready.then(() => {
      if (!live) return;
      measure.reset();
      resize();
    });
    if (!playing) {
      return () => {
        live = false;
        observer.disconnect();
      };
    }

    const unregister = registerGatedFrameClient(
      host,
      ({ dtMs, factor }) => {
        /* A visitor who stopped moving sees the film to its end, where it rests on the whole screen. */
        if (factor < 1 && time.resting()) return;
        p = time.advance(dtMs);
        veil = Math.min(1, veil + dtMs / SEEK_FADE);
        paint(p);
      },
      undefined,
      { keepAwake: true },
    );
    /* Paused, a still frame lands inside its act, where its picture and caption are whole. */
    const settle = (act: number) => time.advance(ACT_MS[act]! * SETTLE[act]!);
    seek.current = (act) => {
      time.seek(act);
      const paused = isMotionPaused();
      p = paused ? settle(act) : time.progress();
      /* A jump fades in from dark instead of cutting; paused, it shows the act at once. */
      veil = paused ? 1 : 0;
      paint(p);
    };
    const offPause = subscribeMotionPause(() => {
      if (!isMotionPaused()) return;
      /* A film paused before it began would hold a dark first frame: show its first act instead. */
      if (time.progress() === 0) p = settle(0);
      paint(p);
    });
    if (isMotionPaused()) {
      p = settle(0);
      paint(p);
    }
    return () => {
      live = false;
      observer.disconnect();
      unregister();
      offPause();
      seek.current = () => {};
    };
  }, [mode, words, timing]);

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

  return (
    <div
      role="region"
      aria-labelledby="gateway-harness-title"
      data-testid="gateway-harness"
      data-gateway-harness={mode === 'playing' ? 'playing' : 'still'}
      className="relative mt-[var(--gateway-section-gap)] w-full"
    >
      {mode === 'playing' ? (
        <div ref={stage} className="relative h-[100svh] max-h-[60rem] min-h-[36rem] w-full overflow-hidden">
          <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" />
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
      ) : (
        <>
          <div className={PAGE_GUTTER}>
            <div className={PAGE_COLUMN}>{title}</div>
          </div>
          {mode === 'still' ? (
            <div ref={stage} className="relative mt-6 h-[34rem] w-full overflow-hidden">
              <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" />
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
