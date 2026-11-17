'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useFormatter, useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { isMotionPaused, subscribeMotionPause } from '@/shared/motion/motion-pause';
import { FONT_WEIGHT } from '@/shared/ui/tokens/font-weight';

import { createFilmClock } from '../lib/film-clock';
import {
  applyCamera,
  clamp01 as clamp,
  drawHitRing,
  drawKeyLight,
  drawStreak,
  easeInOut as inOut,
  easeOut,
  lerp as mix,
  lightSprite,
  projectPoint,
  type CameraShot,
} from '../lib/film-kit';
import { registerGatedFrameClient } from '../lib/gateway-frame-loop';
import facts from '../lib/harness-facts.json';
import {
  buildHarnessScene,
  layoutHarness,
  pictureZone,
  TYPE,
  type HarnessFacts,
  type HarnessLayout,
  type HarnessScene,
  type Rect,
} from '../lib/harness-scene';
import { FilmActBar } from './FilmActBar';

const ACTS = [1, 2, 3, 4] as const;
const ACT_SPANS = [
  [0, 0.25],
  [0.25, 0.5],
  [0.5, 0.75],
  [0.75, 1],
] as const;
/** How long each act plays: read, stop, check, count. */
const ACT_MS = [3200, 3600, 3000, 3000] as const;
const STARTS = [0, 3200, 6800, 9800] as const;
const TOTAL = 12800;
/** Where a paused film rests in each act: the stacks read, a denied command, every cell green, the counts. */
const SETTLE = [0.9, 0.39, 0.985, 0.6];
const FILM_MIN_WIDTH = 768;
const FACTS: HarnessFacts = facts;
const COUNT_KEYS = ['instructions', 'hooks', 'checks'] as const;

/* Act one, in film time */
const LAND_AT = 150;
const LAND_STEP = 28;
const LAND_MS = 220;
const DOLLY_AT = 1450;
const WIDE_AT = 2100;
const SWEEP_MS = 600;
const FOCUS_AT = 2700;
const PARK_AT = 2900;
const PARK_MS = 220;
const HOME_MS = 400;
/* Act two: five commands of 680ms, each typed, fired at the gate, ticked, judged; the next slides it up. */
const CMD_AT = 3300;
/** The gate's plates stand up while the stacks are still parking, so the cut never shows an empty frame. */
const PLATES_AT = 3000;
const CMD_MS = 680;
const RETURN_MS = 140;
const TYPE_AT = 80;
const TYPE_MS = 200;
const FIRE_AT = 280;
const TICK_AT = 400;
const VERDICT_AT = 550;
const VERDICT_MS = 110;
const SLIDE_MS = 100;
/* Act three, from its start: the push in, the three sweeps with a beat between, the lift. */
const PLATE_PARK_MS = 320;
const PUSH_AT = 150;
const PUSH_MS = 350;
const SWEEPS = [
  [500, 1900],
  [2030, 2280],
  [2400, 2750],
] as const;
const PULL_AT = 1300;
const PULL_MS = 850;
const LIFT_AT = 2750;
const LIFT_MS = 200;
/* Act four, from its start: the bar draws the underlines, the counts land 180ms apart. */
const PEN_AT = 200;
const PEN_MS = 560;
const COUNT_AT = 400;
const COUNT_STEP = 180;

/* Captions: the old one leaves in 180ms, the new headline rises 16px in 240ms, its body 60ms later. */
const CAPTION_OUT = 180;
const CAPTION_IN = 240;
const CAPTION_LAG = 60;
const CAPTION_RISE = 16;

/** Parked marks, the far layers, and the ghost word's strength. */
const PARKED = 0.35;
const MID = 0.7;
const FAR = 0.4;
const GHOST = 0.14;

/** Film time (ms) at choreography progress `p`. */
function filmTime(p: number): number {
  if (p >= 1) return TOTAL;
  const act = Math.min(3, Math.max(0, Math.floor(p * 4)));
  return STARTS[act] + (p - act * 0.25) * 4 * ACT_MS[act];
}

/** The inverse of `inOut`, so a mark can know when the pen passes its place. */
function inOutInverse(y: number): number {
  const v = clamp(y);
  return v < 0.5 ? Math.cbrt(v / 4) : 1 - Math.cbrt(2 * (1 - v)) / 2;
}

const mixRect = (a: Rect, b: Rect, t: number): Rect => ({
  x: mix(a.x, b.x, t),
  y: mix(a.y, b.y, t),
  w: mix(a.w, b.w, t),
  h: mix(a.h, b.h, t),
});
const mixShot = (a: CameraShot, b: CameraShot, t: number): CameraShot => ({
  cx: mix(a.cx, b.cx, t),
  cy: mix(a.cy, b.cy, t),
  zoom: mix(a.zoom, b.zoom, t),
});

interface Palette {
  ink: string;
  soft: string;
  dim: string;
  ground: string;
  card: string;
  edge: string;
  indigo: string;
  pass: string;
  stop: string;
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
    ground: v('--color-canvas'),
    card: v('--color-panel'),
    edge: v('--color-border-strong'),
    indigo: v('--map-indigo-bright'),
    pass: v('--color-status-success'),
    stop: v('--color-status-danger'),
    sans: v('--font-sans') || 'system-ui, sans-serif',
    mono: v('--font-mono') || 'ui-monospace, monospace',
  };
}

/** Text widths per font, measured once: the same names are drawn every frame. */
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
 * Two token colours mixed in sRGB with their alpha, so a line can turn green, or a plate red,
 * without two copies of it fading or its opacity jumping.
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
      const parts = hex
        ? [...[0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)), 1]
        : (normal.match(/[\d.]+/g) ?? []).map(Number);
      value = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
      known.set(color, value);
    }
    return value;
  };
  return (a: string, b: string, t: number) => {
    if (t <= 0) return a;
    if (t >= 1) return b;
    const x = rgba(a);
    const y = rgba(b);
    const [r, g, bl] = [0, 1, 2].map((i) => Math.round(mix(x[i]!, y[i]!, t)));
    return `rgb(${r} ${g} ${bl} / ${mix(x[3]!, y[3]!, t).toFixed(3)})`;
  };
}

interface Labels {
  columns: string[];
  bands: string[];
}

/** One underline per count, in stage pixels: under its numeral, its length in proportion to the count. */
type Underline = { x: number; y: number; len: number };

interface Timing {
  /** Per card, in layout order: when it lands. */
  land: number[][];
  /** Per cell: the act-three time the sweep head reaches its middle. */
  fill: number[];
  /** Per band: when its last cell fills. */
  bandDone: number[];
  /** The eight cells whose names the readout shows, in order. */
  readout: number[];
}

interface Frame {
  ctx: CanvasRenderingContext2D;
  scene: HarnessScene;
  layout: HarnessLayout | null;
  timing: Timing | null;
  underlines: Underline[] | null;
  palette: Palette;
  labels: Labels;
  measure: (text: string, font: string) => number;
  tint: (a: string, b: string, t: number) => string;
  sprites: { indigo: HTMLCanvasElement; pass: HTMLCanvasElement; stop: HTMLCanvasElement };
  dpr: number;
  w: number;
  h: number;
  T: number;
}

/* ---------- geometry ---------- */

/** The shot that keeps stage point (px, py) at screen point (sx, sy) at `zoom`. */
function hold(f: Frame, px: number, py: number, sx: number, sy: number, zoom: number): CameraShot {
  return { cx: px - (sx - f.w / 2) / zoom, cy: py - (sy - f.h / 2) / zoom, zoom };
}

/** A slow push about the picture's middle, which every act's resting shot shares. */
function creep(f: Frame, L: HarnessLayout, zoom: number): CameraShot {
  const x = (L.zone.left + L.zone.right) / 2;
  const y = (L.zone.top + L.zone.bottom) / 2;
  return hold(f, x, y, x, y, zoom);
}

/** The shot a far layer sees: it moves `depth` as much as the near one. */
function deeper(f: Frame, shot: CameraShot, depth: number): CameraShot {
  return { cx: mix(f.w / 2, shot.cx, depth), cy: mix(f.h / 2, shot.cy, depth), zoom: 1 + (shot.zoom - 1) * depth };
}

function toScreen(f: Frame, shot: CameraShot, r: Rect): Rect {
  const at = projectPoint(f.w, f.h, shot, r.x, r.y);
  return { x: at.x, y: at.y, w: r.w * shot.zoom, h: r.h * shot.zoom };
}

const centreOf = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/* ---------- time tables ---------- */

function commandAt(T: number, count: number) {
  const j = Math.min(count - 1, Math.max(0, Math.floor((T - CMD_AT) / CMD_MS)));
  return { j, u: T - CMD_AT - j * CMD_MS };
}

/** Where the sweep head of band `b` stands, 0..1 across it, at act-three time `u`. */
function sweepOf(b: number, u: number): number {
  const [from, to] = SWEEPS[b]!;
  const t = clamp((u - from) / (to - from));
  /* The first band speeds up for most of its run, then lands; the short ones simply ease. */
  return b === 0 ? inOut(t ** 1.6) : inOut(t);
}

function headX(L: HarnessLayout, b: number, u: number): number {
  const band = L.bands[b]!;
  return mix(band.left - 8, band.right + 8, sweepOf(b, u));
}

function buildTiming(scene: HarnessScene, L: HarnessLayout): Timing {
  let g = 0;
  const land = L.stacks.map((stack) => stack.cards.map(() => LAND_AT + LAND_STEP * g++));
  /* Sample the head once per millisecond: its curve has no closed inverse. */
  const fill = L.cells.map((cell) => {
    const middle = cell.rect.x + cell.rect.w / 2;
    const [from, to] = SWEEPS[cell.band]!;
    for (let u = from; u <= to; u += 1) if (headX(L, cell.band, u) >= middle) return u;
    return to;
  });
  const bandDone = scene.bands.map((_, b) => Math.max(...L.cells.flatMap((cell, k) => (cell.band === b ? [fill[k]!] : []))));
  /* Four names on the long band at even times, two on each short one. */
  const pick = (b: number, shares: number[]) => {
    const [from, to] = SWEEPS[b]!;
    return shares.map((share) => {
      const want = from + (to - from) * share;
      let best = -1;
      L.cells.forEach((cell, k) => {
        if (cell.band === b && (best < 0 || Math.abs(fill[k]! - want) < Math.abs(fill[best]! - want))) best = k;
      });
      return best;
    });
  };
  const readout = [...pick(0, [0, 0.4, 0.7, 0.92]), ...pick(1, [0, 0.8]), ...pick(2, [0, 0.85])].filter((k) => k >= 0);
  return { land, fill, bandDone, readout };
}

/* ---------- the camera ---------- */

function shotAt(f: Frame, L: HarnessLayout, T: number): CameraShot {
  const midY = (L.read.top + L.read.bottom) / 2;
  const first = L.stacks[0]!;
  const last = L.stacks[L.stacks.length - 1]!;
  if (T < WIDE_AT) {
    /* Close on the first stack, dolly right as the stacks fill, then pull back to the whole. */
    const open = hold(f, first.x + first.width / 2, midY, f.w / 2, midY, 1.25);
    const dolly = hold(f, last.x + last.width / 2, midY, f.w * 0.6, midY, 1.16);
    if (T < DOLLY_AT) return mixShot(open, dolly, inOut(T / DOLLY_AT));
    return mixShot(dolly, creep(f, L, 1), inOut((T - DOLLY_AT) / (WIDE_AT - DOLLY_AT)));
  }
  if (T < STARTS[1]) return creep(f, L, mix(1, 1.02, (T - WIDE_AT) / (STARTS[1] - WIDE_AT)));
  if (T < STARTS[2]) return gateShot(f, L, T);
  const u = T - STARTS[2];
  if (u < LIFT_AT + 270 && u < ACT_MS[2]) {
    const band = L.bands[0]!;
    const y = (band.top + band.bottom) / 2;
    /* Close on the first band, high in the frame; a short stage gets less than 1.6, so the readout
       under the bands still clears the caption. */
    const anchor = Math.max(L.zone.top + 70, f.h * 0.25);
    const zoom = Math.max(1.15, Math.min(1.6, (L.zone.bottom + 24 - anchor) / Math.max(1, L.readoutY - y)));
    const track = hold(f, headX(L, 0, u), y, f.w * 0.42, anchor, zoom);
    if (u < PUSH_AT + PUSH_MS) return mixShot(gateShot(f, L, STARTS[2]), track, inOut((u - PUSH_AT) / PUSH_MS));
    if (u < PULL_AT + PULL_MS) return mixShot(track, creep(f, L, 1), inOut((u - PULL_AT) / PULL_MS));
  }
  if (T < STARTS[3]) return creep(f, L, mix(1, 1.02, clamp((u - PULL_AT - PULL_MS) / (ACT_MS[2] - PULL_AT - PULL_MS))));
  return creep(f, L, 1.02 + 0.01 * clamp((T - STARTS[3]) / ACT_MS[3]));
}

/** Act two: a slow push on the gate, and one more step in (1.2%) on every deny. */
function gateShot(f: Frame, L: HarnessLayout, T: number): CameraShot {
  let zoom = mix(1.02, 1.05, clamp((T - STARTS[1]) / ACT_MS[1]));
  f.scene.commands.forEach((command, j) => {
    if (command.lane >= 0) zoom *= 1 + 0.012 * inOut((T - denyTime(j)) / 300);
  });
  return creep(f, L, zoom);
}

const denyTime = (j: number) => CMD_AT + j * CMD_MS + VERDICT_AT;

/* ---------- the white bar ---------- */

interface Bar {
  r: Rect;
  alpha: number;
  /** Flying between two places, where it leaves a streak; a sweep or a caret does not. */
  fly?: boolean;
}

const barRect = (x: number, y: number, w: number, h: number): Rect => ({ x: x - w / 2, y: y - h / 2, w, h });

function caretH(L: HarnessLayout) {
  return L.command.px * 1.1;
}

function promptW(f: Frame, L: HarnessLayout) {
  return f.measure('$ ', `${L.command.px}px ${f.palette.mono}`);
}

/** The caret's middle-left at command `j`, `typed` 0..1 of the way through it. */
function caretAt(f: Frame, L: HarnessLayout, j: number, typed: number) {
  const text = f.scene.commands[j]!.command;
  const font = `${L.command.px}px ${f.palette.mono}`;
  const shown = typed * text.length;
  const whole = Math.floor(shown);
  const x = L.command.x + promptW(f, L) + f.measure(text.slice(0, whole), font) + (shown - whole) * f.measure('M', font);
  return { x: x + 8, y: L.command.y };
}

/** The bar in act two at command `j`, `u` ms into it, in stage pixels. */
function gateBar(f: Frame, L: HarnessLayout, j: number, u: number): Bar {
  const command = f.scene.commands[j]!;
  const plates = L.plates;
  const caretW = 4;
  const tall = caretH(L);
  const plateBar = plates[0]!.h - 20;
  const entryX = plates[0]!.x - 14;
  const centreY = (k: number) => plates[k]!.y + plates[k]!.h / 2;
  const target = command.lane >= 0 ? command.lane : plates.length - 1;
  if (u < RETURN_MS && j > 0) {
    const home = caretAt(f, L, j, 0);
    const before = gateBar(f, L, j - 1, CMD_MS);
    const back = inOut(u / RETURN_MS);
    if (before.alpha < 0.5) return { r: barRect(home.x, home.y, caretW, tall), alpha: back };
    return { r: mixRect(before.r, barRect(home.x, home.y, caretW, tall), back), alpha: 1, fly: true };
  }
  if (u < FIRE_AT) {
    const at = caretAt(f, L, j, clamp((u - TYPE_AT) / TYPE_MS));
    return { r: barRect(at.x, at.y, caretW, tall), alpha: 1 };
  }
  const end = caretAt(f, L, j, 1);
  if (u < TICK_AT) {
    const fly = inOut((u - FIRE_AT) / (TICK_AT - FIRE_AT));
    return { r: mixRect(barRect(end.x, end.y, caretW, tall), barRect(entryX, centreY(0), 3, plateBar), fly), alpha: 1, fly: true };
  }
  const down = inOut((u - TICK_AT) / (VERDICT_AT - TICK_AT));
  const y = mix(centreY(0), centreY(target), down);
  if (u < VERDICT_AT) return { r: barRect(entryX, y, 3, plateBar), alpha: 1 };
  const v = clamp((u - VERDICT_AT) / VERDICT_MS);
  if (command.lane >= 0) {
    /* Denied: it runs into its plate and stops there. */
    return { r: barRect(mix(entryX, plates[target]!.x + 8, easeOut(v)), y, 3, plateBar), alpha: 1 };
  }
  /* Let through: it crosses the last plate and leaves the picture. */
  const x = mix(entryX, L.zone.right + 60, inOut(v));
  return { r: barRect(x, y, 3, plateBar), alpha: 1 - clamp((x - (L.zone.right - 40)) / 80), fly: true };
}

/** The bar in act three, `u` ms in, in stage pixels. */
function headBar(f: Frame, L: HarnessLayout, u: number): Bar {
  const at = (b: number, x: number) => {
    const band = L.bands[b]!;
    return barRect(x, (band.top + band.bottom) / 2, 3, band.bottom - band.top + 16);
  };
  if (u < SWEEPS[0][0]) {
    const before = gateBar(f, L, f.scene.commands.length - 1, STARTS[2] - CMD_AT - (f.scene.commands.length - 1) * CMD_MS);
    const start = at(0, headX(L, 0, 0));
    const fly = inOut(u / SWEEPS[0][0]);
    return { r: mixRect(before.r, start, fly), alpha: mix(before.alpha, 1, fly), fly: true };
  }
  for (let b = 0; b < SWEEPS.length; b += 1) {
    const [from, to] = SWEEPS[b]!;
    const next = SWEEPS[b + 1];
    if (u < to || !next) return { r: at(b, headX(L, b, Math.max(from, u))), alpha: 1 };
    if (u < next[0]) return { r: mixRect(at(b, headX(L, b, to)), at(b + 1, headX(L, b + 1, next[0])), inOut((u - to) / (next[0] - to))), alpha: 1, fly: true };
  }
  return { r: at(SWEEPS.length - 1, headX(L, SWEEPS.length - 1, u)), alpha: 1 };
}

function penX(U: Underline[], u: number): number {
  const first = U[0]!;
  const last = U[U.length - 1]!;
  return mix(first.x, last.x + last.len, inOut((u - PEN_AT) / PEN_MS));
}

/** The bar at film time `T`, in screen pixels, under `shot`. */
function barAt(f: Frame, L: HarnessLayout, T: number, shot: CameraShot): Bar {
  if (T >= STARTS[3] && f.underlines) {
    const u = T - STARTS[3];
    const U = f.underlines;
    const from = barAt(f, L, STARTS[3] - 0.001, shot);
    const pen = (x: number, h: number) => barRect(x, U[0]!.y + 1.5, 2, h);
    if (u < PEN_AT) return { r: mixRect(from.r, pen(U[0]!.x, 18), inOut(u / PEN_AT)), alpha: 1, fly: true };
    if (u < PEN_AT + PEN_MS) return { r: pen(penX(U, u), 18), alpha: 1 };
    /* At the end of the last line the bar shrinks into it. */
    const sink = inOut((u - PEN_AT - PEN_MS) / 240);
    return { r: pen(penX(U, u), mix(18, 3, sink)), alpha: 1 - sink };
  }
  let stage: Bar;
  if (T < STARTS[1] + (CMD_AT - STARTS[1])) {
    const span = { top: L.read.top, bottom: L.read.bottom };
    const left = L.zone.left - 16;
    const right = L.zone.right + 16;
    const h = span.bottom - span.top;
    const y = (span.top + span.bottom) / 2;
    const x = mix(left, right, inOut((T - WIDE_AT) / SWEEP_MS));
    if (T < PARK_AT) stage = { r: barRect(x, y, 2, h), alpha: inOut((T - WIDE_AT) / 120) };
    else {
      const home = caretAt(f, L, 0, 0);
      stage = { r: mixRect(barRect(right, y, 2, h), barRect(home.x, home.y, 4, caretH(L)), inOut((T - PARK_AT) / HOME_MS)), alpha: 1, fly: true };
    }
  } else if (T < STARTS[2]) {
    const { j, u } = commandAt(T, f.scene.commands.length);
    stage = gateBar(f, L, j, u);
  } else stage = headBar(f, L, Math.min(T, STARTS[3]) - STARTS[2]);
  return { r: toScreen(f, shot, stage.r), alpha: stage.alpha, fly: stage.fly };
}

/* ---------- drawing helpers ---------- */

/** Canvas text with a ground-coloured halo, so a line passing under it never cuts a letter. */
function text(f: Frame, value: string, x: number, y: number, font: string, color: string, alpha: number) {
  if (alpha <= 0.004) return;
  const { ctx } = f;
  ctx.globalAlpha = alpha;
  ctx.font = font;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = f.palette.ground;
  ctx.strokeText(value, x, y);
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
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

function outline(f: Frame, r: Rect, radius: number, color: string, alpha: number) {
  if (alpha <= 0.004) return;
  const { ctx } = f;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, Math.min(radius, r.w / 2, r.h / 2));
  ctx.stroke();
}

function screenSpace(f: Frame) {
  f.ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
}

/* ---------- act one: the stacks ---------- */

function drawStacks(f: Frame, L: HarnessLayout, shot: CameraShot, timing: Timing) {
  const { palette, T } = f;
  if (T >= STARTS[1] + PARK_MS + 200) return;
  const headerOut = inOut((T - FOCUS_AT) / 250);
  /* Rack focus before the cut: the stacks fall back while the bar leaves for the command line. */
  const focus = inOut((T - FOCUS_AT) / (PARK_AT - FOCUS_AT));
  const sweep = mix(L.zone.left - 16, L.zone.right + 16, inOut((T - WIDE_AT) / SWEEP_MS));
  const parked = deeper(f, shot, MID);
  const total = L.stacks.reduce((sum, stack) => sum + stack.cards.length, 0);
  let g = 0;
  L.stacks.forEach((stack, c) => {
    const lands = timing.land[c]!;
    const landed = lands.filter((at) => T >= at + LAND_MS / 2).length;
    const show = inOut((T - lands[0]! + 120) / 240) * (1 - headerOut);
    applyCamera(f.ctx, f.dpr, f.w, f.h, shot);
    f.ctx.textBaseline = 'alphabetic';
    text(f, f.labels.columns[c] ?? '', stack.x, stack.labelY + 12 * (1 - show), `${TYPE.label}px ${palette.sans}`, palette.soft, show);
    /* The count arrives with its first card, so it never reads 0. */
    const counted = show * inOut((T - lands[0]! - LAND_MS / 2) / 160);
    text(f, String(landed), stack.x, stack.countY + 12 * (1 - show), `${FONT_WEIGHT.strong} ${TYPE.count}px ${palette.sans}`, palette.ink, counted);

    const mid = { x: stack.x + stack.width / 2, y: (L.read.top + L.read.bottom) / 2 };
    const scale = mix(1, 0.96, focus);
    const read = clamp((sweep - stack.x) / 60);
    stack.cards.forEach((card, i) => {
      const k = g++;
      const at = lands[i]!;
      const land = easeOut((T - at) / LAND_MS);
      if (land <= 0) return;
      const cover = i + 1 < stack.cards.length ? easeOut((T - lands[i + 1]!) / LAND_MS) : 0;
      const resting = {
        x: mid.x + (card.rect.x - mid.x) * scale,
        y: mid.y + (card.rect.y - 18 * (1 - land) - mid.y) * scale,
        w: card.rect.w * scale,
        h: card.rect.h * scale,
      };
      const park = inOut((T - PARK_AT - (k / Math.max(1, total - 1)) * 120) / PARK_MS);
      const alpha = clamp(land * 2) * mix(1, 0.45, focus);
      /* Landed in the strip, it is drawn there from now on. */
      if (park >= 1) return;
      if (park > 0) {
        /* Into the strip: from this card in the near layer to its mark in the middle one. */
        const from = toScreen(f, shot, resting);
        const to = toScreen(f, parked, L.strips[0]![k]!);
        screenSpace(f);
        const r = mixRect(from, to, park);
        block(f, r, mix(6, 1.5, park), f.tint(palette.card, palette.indigo, park), mix(alpha, PARKED, park));
        outline(f, r, mix(6, 1.5, park), palette.edge, alpha * (1 - clamp(park / 0.4)));
        return;
      }
      block(f, resting, 6, palette.card, alpha);
      outline(f, resting, 6, f.tint(palette.edge, palette.soft, read * (1 - cover) * 0.6), alpha * mix(1, 0.4, cover));
      const name = land * (1 - cover);
      if (name > 0.004) {
        f.ctx.textBaseline = 'middle';
        const color = f.tint(palette.soft, palette.ink, read);
        text(f, card.text, resting.x + 14 * scale, resting.y + resting.h / 2 + 12 * (1 - land), `${TYPE.card * scale}px ${palette.mono}`, color, name * alpha);
      }
    });
  });
}

/* ---------- the strips at the top ---------- */

function drawParkedStrips(f: Frame, L: HarnessLayout, shot: CameraShot) {
  const { palette, T } = f;
  if (T >= STARTS[3]) return;
  applyCamera(f.ctx, f.dpr, f.w, f.h, shot, MID);
  const total = L.strips[0]!.length;
  /* The first strip: marks whose cards have finished their flight. */
  L.strips[0]!.forEach((mark, k) => {
    if (T < PARK_AT + (k / Math.max(1, total - 1)) * 120 + PARK_MS) return;
    block(f, mark, 1.5, palette.indigo, PARKED);
  });
  /* The second: hooks outside the gate arrive as the plates come up to join them. */
  const u = T - STARTS[2];
  f.scene.hookPlates.forEach((plate, j) => {
    const mark = L.strips[1]![j]!;
    if (plate >= 0) {
      if (u >= PLATE_PARK_MS + plate * 40) block(f, mark, 1.5, palette.indigo, PARKED);
      return;
    }
    const arrive = inOut((u - 120 - j * 18) / 300);
    if (arrive > 0) block(f, { ...mark, y: mark.y + 8 * (1 - arrive) }, 1.5, palette.indigo, PARKED * arrive);
  });
}

/* ---------- act two: the command line and the gate ---------- */

function drawGate(f: Frame, L: HarnessLayout, shot: CameraShot) {
  const { ctx, scene, palette, T } = f;
  if (T < PLATES_AT || T >= STARTS[3]) return;
  const u3 = T - STARTS[2];
  const parked = deeper(f, shot, MID);
  const font = `${L.plateTextPx}px ${palette.mono}`;
  const { j: now } = commandAt(T, scene.commands.length);
  const started = T >= CMD_AT;

  /* Ghost type: the hook's verdict, huge and faint behind the plates, for 400ms after each deny. */
  applyCamera(ctx, f.dpr, f.w, f.h, shot, FAR);
  scene.commands.forEach((command, j) => {
    if (command.lane < 0) return;
    const age = T - denyTime(j);
    const alpha = GHOST * inOut(age / 60) * (1 - inOut(age / 400));
    if (alpha <= 0.004) return;
    const top = L.plates[0]!;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = palette.stop;
    ctx.font = `${FONT_WEIGHT.strong} ${TYPE.ghost}px ${palette.mono}`;
    ctx.fillText('deny', top.x + top.w, top.y - 20);
    ctx.textAlign = 'left';
  });

  /* Plates: what each is doing for the command at hand. */
  const verdicts = L.plates.map(() => ({ pass: 0, stop: 0 }));
  if (started) {
    for (let j = Math.max(0, now - 1); j <= now; j += 1) {
      const command = scene.commands[j]!;
      const u = T - CMD_AT - j * CMD_MS;
      /* The marks clear while the next command comes in. */
      const clear = j < now ? 1 - inOut((T - CMD_AT - now * CMD_MS) / RETURN_MS) : 1;
      const target = command.lane >= 0 ? command.lane : L.plates.length - 1;
      L.plates.forEach((_, k) => {
        if (k > target) return;
        /* The bar reaches plate k's middle at this share of its way down. */
        const share = target === 0 ? 0 : k / target;
        const at = TICK_AT + (VERDICT_AT - TICK_AT) * inOutInverse(share);
        if (k === command.lane) verdicts[k]!.stop = Math.max(verdicts[k]!.stop, inOut((u - VERDICT_AT - 40) / 70) * clear);
        else verdicts[k]!.pass = Math.max(verdicts[k]!.pass, inOut((u - at) / 80) * clear);
      });
    }
  }

  L.plates.forEach((plate, k) => {
    const show = inOut((T - PLATES_AT - k * 60) / 360);
    if (show <= 0) return;
    const park = inOut((u3 - k * 40) / PLATE_PARK_MS);
    const { pass, stop } = verdicts[k]!;
    const rest = { ...plate, y: plate.y + 12 * (1 - show) };
    if (park >= 1) return;
    if (park > 0) {
      const j = scene.hookPlates.indexOf(k);
      const to = toScreen(f, parked, L.strips[1]![Math.max(0, j)]!);
      const r = mixRect(toScreen(f, shot, rest), to, park);
      screenSpace(f);
      const radius = mix(8, 1.5, park);
      const leaving = 1 - clamp(park / 0.4);
      block(f, r, radius, f.tint(palette.card, palette.indigo, park), mix(1, PARKED, park));
      /* A plate still red from the last deny lets its red go as it leaves, never at once. */
      block(f, r, radius, palette.stop, stop * 0.8 * leaving);
      outline(f, r, radius, f.tint(palette.edge, palette.stop, stop), leaving);
      const words = 1 - clamp(park / 0.25);
      if (words > 0.004) {
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = words;
        ctx.font = font;
        ctx.fillStyle = f.tint(f.tint(palette.soft, palette.ink, pass), palette.ink, stop);
        ctx.fillText(scene.gate[k]!, r.x + 18 * (r.w / plate.w), r.y + r.h / 2);
      }
      return;
    }
    applyCamera(ctx, f.dpr, f.w, f.h, shot);
    block(f, rest, 8, palette.card, show);
    block(f, rest, 8, palette.stop, show * stop * 0.8);
    outline(f, rest, 8, f.tint(palette.edge, palette.stop, stop), show);
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = show;
    ctx.font = font;
    ctx.fillStyle = f.tint(f.tint(palette.soft, palette.ink, pass), palette.ink, stop);
    ctx.fillText(scene.gate[k]!, rest.x + 18, rest.y + rest.h / 2);
    if (pass > 0.004) {
      const cx = rest.x + rest.w - 26;
      const cy = rest.y + rest.h / 2;
      ctx.globalAlpha = show * pass;
      ctx.strokeStyle = palette.pass;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 7, cy);
      ctx.lineTo(cx - 2, cy + 5);
      ctx.lineTo(cx + 7, cy - 6);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
  });

  /* The command lines: the current one, and up to two above it, smaller and dimmer. */
  if (!started) return;
  applyCamera(ctx, f.dpr, f.w, f.h, shot);
  const out = inOut(u3 / 240);
  const mono = `${L.command.px}px ${palette.mono}`;
  const pw = promptW(f, L);
  ctx.textBaseline = 'middle';
  scene.commands.forEach((command, j) => {
    const u = T - CMD_AT - j * CMD_MS;
    if (u < 0) return;
    let level = 0;
    for (let m = j + 1; m < scene.commands.length; m += 1) level += inOut((T - CMD_AT - m * CMD_MS) / SLIDE_MS);
    const fade = level <= 1 ? mix(1, 0.45, level) : level <= 2 ? mix(0.45, 0.2, level - 1) : mix(0.2, 0, Math.min(1, level - 2));
    const alpha = fade * (1 - out) * inOut((u - TYPE_AT + 60) / 80);
    if (alpha <= 0.004) return;
    const scale = mix(1, 0.72, Math.min(1, level));
    const lift = 58 * Math.min(1, level) + 40 * Math.max(0, level - 1) + 12 * out;
    const v = clamp((u - VERDICT_AT) / VERDICT_MS);
    const blocked = command.lane >= 0;
    /* A deny knocks the line back 10px once. */
    const recoil = blocked ? -10 * Math.sin(Math.PI * v) : 0;
    const typed = clamp((u - TYPE_AT) / TYPE_MS) * command.command.length;
    const whole = Math.floor(typed);
    const ink = f.tint(palette.ink, blocked ? palette.stop : palette.pass, inOut(v));
    ctx.save();
    ctx.translate(L.command.x + recoil, L.command.y - lift);
    ctx.scale(scale, scale);
    text(f, '$ ', 0, 0, mono, palette.dim, alpha);
    text(f, command.command.slice(0, whole), pw, 0, mono, ink, alpha);
    if (whole < command.command.length && typed > whole) {
      text(f, command.command[whole]!, pw + f.measure(command.command.slice(0, whole), mono), 0, mono, ink, alpha * (typed - whole));
    }
    ctx.restore();
  });
}

/* ---------- act three: the checks ---------- */

function drawChecks(f: Frame, L: HarnessLayout, shot: CameraShot, timing: Timing) {
  const { ctx, scene, palette, T } = f;
  const u = T - STARTS[2];
  /* The names stay a moment into the last act, leaving as its caption comes in. */
  const gone = inOut((T - STARTS[3]) / CAPTION_IN);
  if (u < 0 || gone >= 1) return;
  applyCamera(ctx, f.dpr, f.w, f.h, shot);
  const lift = Math.sin(Math.PI * clamp((u - LIFT_AT) / LIFT_MS));
  ctx.textBaseline = 'alphabetic';
  L.bands.forEach((band, b) => {
    const show = inOut((u - 120 - b * 80) / 300);
    const done = inOut((u - timing.bandDone[b]!) / 160);
    const label = f.labels.bands[b] ?? '';
    const labelFont = `${TYPE.label}px ${palette.sans}`;
    const y = band.labelY + 12 * (1 - show);
    text(f, label, band.labelX, y, labelFont, palette.soft, show * (1 - gone));
    const countX = band.labelX + f.measure(label, labelFont) + 10;
    text(f, String(scene.bands[b]!.names.length), countX, y, `${FONT_WEIGHT.strong} ${TYPE.label}px ${palette.sans}`, f.tint(palette.ink, palette.pass, done), show * (1 - gone));
  });

  L.cells.forEach((cell, k) => {
    if (T >= STARTS[3]) return;
    const show = inOut((u - 120 - cell.band * 80 - cell.column * 6) / 300);
    if (show <= 0) return;
    const fill = inOut((u - timing.fill[k]!) / 90);
    const r = { ...cell.rect, y: cell.rect.y + 12 * (1 - show) };
    block(f, r, 5, palette.edge, show * 0.45 * (1 - fill));
    block(f, r, 5, f.tint(palette.pass, palette.ink, 0.28 * lift), show * fill);
  });

  /* The readout: the check the head has reached, eight names in turn. */
  const names = timing.readout;
  let current = -1;
  names.forEach((k, i) => {
    if (u >= timing.fill[k]!) current = i;
  });
  if (current < 0) return;
  const since = u - timing.fill[names[current]!]!;
  const nextAt = current + 1 < names.length ? timing.fill[names[current + 1]!]! : Infinity;
  const leaving = inOut((u - (nextAt - 90)) / 90);
  const arriving = inOut(since / 140);
  const name = L.cells[names[current]!]!.name;
  text(f, name, L.zone.left, L.readoutY + 8 * (1 - arriving) - 8 * leaving, `${TYPE.readout}px ${palette.mono}`, palette.ink, arriving * (1 - leaving) * (1 - gone));
}

/* ---------- act four: the underlines ---------- */

function drawUnderlines(f: Frame, L: HarnessLayout, shot: CameraShot) {
  const { palette, T } = f;
  const U = f.underlines;
  if (T < STARTS[3] || !U) return;
  const u = T - STARTS[3];
  const parked = deeper(f, shot, MID);
  const first = U[0]!;
  const last = U[U.length - 1]!;
  const span = last.x + last.len - first.x;
  /* A piece lands just behind the pen as it passes. */
  const arrival = (x: number) => PEN_AT + PEN_MS * inOutInverse((x - first.x) / span) + 40;
  const piece = (line: number, k: number, n: number, from: Rect, color: string, alpha: number, radius: number) => {
    const under = U[line]!;
    const step = under.len / n;
    const to = { x: under.x + k * step, y: under.y, w: step + 0.6, h: 3 };
    const land = arrival(to.x + step / 2);
    const start = Math.max(0, land - 380);
    const t = (u - start) / (land - start);
    const now = inOut(t);
    /* It thins out early in its flight, so a piece passing under the headline is a sliver, not a block. */
    const thin = easeOut(t / 0.45);
    const at = mixRect(from, to, now);
    const r = { x: at.x, y: at.y, w: mix(from.w, to.w, Math.max(now, thin)), h: mix(from.h, to.h, Math.max(now, thin)) };
    block(f, r, mix(radius, 0, now), f.tint(color, palette.ink, now), mix(alpha, 1, now));
  };
  screenSpace(f);
  const strip0 = L.strips[0]!;
  strip0.forEach((mark, k) => piece(0, k, strip0.length, toScreen(f, parked, mark), palette.indigo, PARKED, 1.5));
  const strip1 = L.strips[1]!;
  strip1.forEach((mark, k) => piece(1, k, strip1.length, toScreen(f, parked, mark), palette.indigo, PARKED, 1.5));
  L.cells.forEach((cell) => piece(2, cell.slot, L.cells.length, toScreen(f, shot, cell.rect), palette.pass, 1, 5 * shot.zoom));
}

/* ---------- light and beats ---------- */

/** The key light: one soft pool that follows the subject and turns red for a moment on each deny. */
function drawLight(f: Frame, L: HarnessLayout, shot: CameraShot, timing: Timing) {
  const { T, sprites } = f;
  const radius = 300;
  const at = (x: number, y: number) => projectPoint(f.w, f.h, shot, x, y);
  screenSpace(f);
  const plates = L.plates;
  const gate = at(plates[0]!.x + plates[0]!.w / 2, (plates[0]!.y + plates[plates.length - 1]!.y + plates[0]!.h) / 2);

  /* A deny's red, 300ms from the verdict, whatever act the clock has reached by then. */
  let red = 0;
  let redAt = gate;
  f.scene.commands.forEach((command, j) => {
    if (command.lane < 0) return;
    const age = T - denyTime(j);
    const lit = inOut(age / 60) * (1 - inOut((age - 60) / 240));
    if (lit > red) {
      red = lit;
      const plate = plates[command.lane]!;
      redAt = at(plate.x + plate.w / 2, plate.y + plate.h / 2);
    }
  });
  drawKeyLight(f.ctx, sprites.stop, redAt.x, redAt.y, radius, 0.16 * red);

  if (T < STARTS[1]) {
    const midY = (L.read.top + L.read.bottom) / 2;
    const first = L.stacks[0]!;
    const last = L.stacks[L.stacks.length - 1]!;
    const lastLand = timing.land[timing.land.length - 1]!;
    /* Across the stacks as they fill, back to where reading starts, then riding the reading line. */
    const filled = clamp((T - LAND_AT) / (lastLand[lastLand.length - 1]! - LAND_AT));
    const filling = mix(first.x + first.width / 2, last.x + last.width / 2, filled);
    const back = mix(filling, L.zone.left, inOut((T - DOLLY_AT) / (WIDE_AT - DOLLY_AT)));
    const x = T < WIDE_AT ? back : mix(L.zone.left, L.zone.right, inOut((T - WIDE_AT) / SWEEP_MS));
    const p = at(x, midY);
    const leave = inOut((T - FOCUS_AT) / (STARTS[1] - FOCUS_AT));
    const strength = mix(0.1, 0.14, inOut((T - WIDE_AT) / 200)) * inOut((T - 300) / 500) * mix(1, 0.7, leave);
    drawKeyLight(f.ctx, sprites.indigo, mix(p.x, gate.x, leave), mix(p.y, gate.y, leave), radius, strength);
    return;
  }
  if (T < STARTS[2]) {
    drawKeyLight(f.ctx, sprites.indigo, gate.x, gate.y, radius, mix(0.098, 0.1, clamp((T - STARTS[1]) / 200)) * (1 - red));
    return;
  }
  const head = centreOf(barAt(f, L, Math.min(T, STARTS[3] - 0.001), shot).r);
  if (T < STARTS[3]) {
    const change = inOut((T - STARTS[2] - PUSH_AT) / PUSH_MS);
    drawKeyLight(f.ctx, sprites.indigo, mix(gate.x, head.x, change), mix(gate.y, head.y, change), radius, 0.1 * (1 - change) * (1 - red));
    drawKeyLight(f.ctx, sprites.pass, head.x, head.y, radius, 0.12 * change);
    return;
  }
  const U = f.underlines;
  if (!U) return;
  const end = U[U.length - 1]!;
  const mid = { x: (U[0]!.x + end.x + end.len) / 2, y: U[0]!.y - 40 };
  const change = inOut((T - STARTS[3]) / 600);
  const x = mix(head.x, mid.x, change);
  const y = mix(head.y, mid.y, change);
  drawKeyLight(f.ctx, sprites.pass, x, y, radius, 0.12 * (1 - change));
  drawKeyLight(f.ctx, sprites.indigo, x, y, radius * mix(1, 1.4, change), 0.1 * change);
}

/** The beats: a stack filled, a command denied, a band passed, a count landed. */
function drawRings(f: Frame, L: HarnessLayout, shot: CameraShot, timing: Timing) {
  const { ctx, T, palette, scene } = f;
  screenSpace(f);
  const ring = (x: number, y: number, at: number, color: string) => {
    const p = projectPoint(f.w, f.h, shot, x, y);
    drawHitRing(ctx, p.x, p.y, T - at, color);
  };
  if (T < STARTS[1]) {
    L.stacks.forEach((stack, c) => {
      const lands = timing.land[c]!;
      const font = `${FONT_WEIGHT.strong} ${TYPE.count}px ${palette.sans}`;
      const wide = f.measure(String(stack.cards.length), font);
      ring(stack.x + wide / 2, stack.countY - TYPE.count * 0.36, lands[lands.length - 1]! + LAND_MS / 2, palette.indigo);
    });
    return;
  }
  if (T < STARTS[2]) {
    scene.commands.forEach((command, j) => {
      if (command.lane < 0) return;
      const plate = L.plates[command.lane]!;
      ring(plate.x + 8, plate.y + plate.h / 2, denyTime(j), palette.stop);
    });
    return;
  }
  if (T < STARTS[3]) {
    L.bands.forEach((band, b) => {
      const labelFont = `${TYPE.label}px ${palette.sans}`;
      const x = band.labelX + f.measure(f.labels.bands[b] ?? '', labelFont) + 10 + f.measure(String(scene.bands[b]!.names.length), `${FONT_WEIGHT.strong} ${labelFont}`) / 2;
      ring(x, band.labelY - 6, STARTS[2] + timing.bandDone[b]!, palette.pass);
    });
    return;
  }
  const U = f.underlines;
  if (!U) return;
  U.forEach((line, i) => {
    drawHitRing(ctx, line.x, line.y + 1.5, T - STARTS[3] - COUNT_AT - COUNT_STEP * i - 120, palette.ink);
  });
}

function drawHarness(f: Frame) {
  const { ctx, layout: L, timing } = f;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!L || !timing) return;
  const shot = shotAt(f, L, f.T);
  drawLight(f, L, shot, timing);
  drawParkedStrips(f, L, shot);
  drawStacks(f, L, shot, timing);
  drawGate(f, L, shot);
  drawChecks(f, L, shot, timing);
  drawUnderlines(f, L, shot);

  /* The white bar, with a streak while it flies. */
  screenSpace(f);
  const bar = barAt(f, L, f.T, shot);
  if (bar.alpha > 0.004) {
    const was = barAt(f, L, Math.max(0, f.T - 48), shotAt(f, L, Math.max(0, f.T - 48)));
    if (bar.fly && was.alpha > 0.5) drawStreak(ctx, centreOf(was.r), centreOf(bar.r), f.palette.ink, 0.35, 2);
    block(f, bar.r, 1, f.palette.ink, bar.alpha);
  }
  drawRings(f, L, shot, timing);
  ctx.globalAlpha = 1;
}

/* ---------- captions ---------- */

/** A caption's headline and body: in with a rise, the body 60ms behind, out before the next. */
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

/** Each count's place inside the stage, for the underline drawn under its numeral. */
function measureUnderlines(host: HTMLElement, items: (HTMLElement | null)[], counts: readonly number[]): Underline[] | null {
  const boxes = items.map((item) => {
    if (!item) return null;
    let x = 0;
    let y = 0;
    let el: HTMLElement | null = item;
    while (el && el !== host) {
      x += el.offsetLeft;
      y += el.offsetTop;
      el = el.offsetParent as HTMLElement | null;
    }
    return el === host ? { x, y: y + item.offsetHeight, w: item.parentElement?.offsetWidth ?? item.offsetWidth } : null;
  });
  if (boxes.some((box) => !box || box.w <= 0)) return null;
  /* One length per item, the same scale for all three, so their lengths keep the counts' ratio. */
  const unit = Math.min(...boxes.map((box, i) => box!.w / Math.max(1, counts[i]!)));
  return boxes.map((box, i) => ({ x: box!.x, y: box!.y + 4, len: unit * counts[i]! }));
}

/** The last act's three counts: server-rendered with their final values, read as a list of terms. */
function HarnessCounts({
  counts,
  film = false,
  numerals,
  className,
}: {
  counts: HarnessScene['counts'];
  film?: boolean;
  numerals?: RefObject<(HTMLElement | null)[]>;
  className?: string;
}) {
  const t = useTranslations('download.harnessFilm');
  const format = useFormatter();
  /* In the film each count takes room in proportion to itself, so its underline can run that long. */
  const style: CSSProperties | undefined = film
    ? { gridTemplateColumns: COUNT_KEYS.map((key) => `minmax(max-content, ${counts[key]}fr)`).join(' ') }
    : undefined;
  return (
    <dl
      style={style}
      className={cn(film ? 'grid w-[min(100%,56rem)] gap-x-10' : 'flex flex-wrap gap-x-10 gap-y-4', className)}
    >
      {COUNT_KEYS.map((key, i) => (
        <div key={key} className="flex min-w-0 flex-col-reverse">
          <dt className={cn('text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]', film ? 'mt-5' : 'mt-1')}>
            {t(`counts.${key}`)}
          </dt>
          {film ? (
            <dd
              ref={(node) => {
                if (numerals?.current) numerals.current[i] = node;
              }}
              className="w-fit text-monument font-[var(--font-weight-signature)] tabular-nums tracking-[var(--tracking-monument)] text-[color:var(--color-text-primary)]"
            >
              {format.number(counts[key])}
            </dd>
          ) : (
            <dd
              data-token="engraved-numeral"
              className="text-hero font-[var(--font-weight-signature)] tabular-nums tracking-[var(--tracking-monument)] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
            >
              {format.number(counts[key])}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

/**
 * The page's second film, beside the map's: this repository's real harness, followed by one white
 * bar. It reads the files an agent reads, carries each command to the hooks that stop it, runs the
 * checks that verify the work, then underlines all three counts. Without a script, under reduced
 * motion or on a narrow screen the four acts are one visible list and nothing is drawn, so the page
 * never reflows.
 */
export function HarnessFilm() {
  const t = useTranslations('download.harnessFilm');
  const groups = useTranslations('harness.groups');
  const scene = useMemo(() => buildHarnessScene(FACTS), []);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const captions = useRef<(HTMLLIElement | null)[]>([]);
  const heads = useRef<(HTMLHeadingElement | null)[]>([]);
  const bodies = useRef<(HTMLElement | null)[]>([]);
  const numerals = useRef<(HTMLElement | null)[]>([]);
  const fills = useRef<(HTMLSpanElement | null)[]>([]);
  const seek = useRef<(act: number) => void>(() => {});
  const [film, setFilm] = useState(false);
  const labels = useMemo<Labels>(
    () => ({
      columns: [groups('instructions'), groups('rules'), groups('skills'), groups('subagents')],
      bands: [groups('scripts'), groups('gitHooks'), groups('workflows')],
    }),
    [groups],
  );

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    /* Below this the four stacks and the gate plates cannot stand side by side, so the film rests. */
    const wide = matchMedia(`(min-width: ${FILM_MIN_WIDTH}px)`);
    let id = 0;
    const decide = () => {
      cancelAnimationFrame(id);
      const next = !reduced.matches && wide.matches && typeof IntersectionObserver !== 'undefined';
      id = requestAnimationFrame(() => setFilm(next));
    };
    decide();
    wide.addEventListener('change', decide);
    return () => {
      cancelAnimationFrame(id);
      wide.removeEventListener('change', decide);
    };
  }, []);

  useEffect(() => {
    const el = canvas.current;
    const host = stage.current;
    const ctx = el?.getContext('2d');
    if (!film || !el || !host || !ctx) return;
    const palette = readPalette();
    const measure = widthCache(ctx);
    const frame: Frame = {
      ctx,
      scene,
      layout: null,
      timing: null,
      underlines: null,
      palette,
      labels,
      measure,
      tint: colorMixer(ctx),
      sprites: { indigo: lightSprite(palette.indigo), pass: lightSprite(palette.pass), stop: lightSprite(palette.stop) },
      dpr: 1,
      w: 0,
      h: 0,
      T: 0,
    };
    const counts = COUNT_KEYS.map((key) => scene.counts[key]);

    const time = createFilmClock(ACT_SPANS, ACT_MS);
    let veil = 1;
    const paint = (p: number) => {
      frame.T = filmTime(p);
      drawHarness(frame);
      const light = isMotionPaused() ? 1 : time.fade() * veil;
      el.style.opacity = String(light);
      captions.current.forEach((caption, i) => {
        if (!caption) return;
        const { head, body } = captionAt(i, frame.T);
        setRise(heads.current[i], head * light);
        setRise(bodies.current[i], body * light);
        caption.style.visibility = Math.max(head, body) * light > 0.01 ? 'visible' : 'hidden';
      });
      numerals.current.forEach((numeral, i) => {
        setRise(numeral, inOut((frame.T - STARTS[3] - COUNT_AT - COUNT_STEP * i) / CAPTION_IN) * light);
      });
      const act = time.act();
      fills.current.forEach((fill, i) => {
        if (!fill) return;
        const [start, end] = ACT_SPANS[i]!;
        fill.style.transform = `scaleX(${i < act ? 1 : i > act ? 0 : clamp((p - start) / (end - start))})`;
      });
    };
    let p = 0;
    const resize = () => {
      frame.w = el.clientWidth;
      frame.h = el.clientHeight;
      /* The backing store stays under six million pixels, so a large screen draws at a lower density. */
      frame.dpr = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(6e6 / Math.max(1, frame.w * frame.h)));
      el.width = Math.round(frame.w * frame.dpr);
      el.height = Math.round(frame.h * frame.dpr);
      /* `--gateway-origin` is a registered length, so it reads back resolved to px. */
      const origin = parseFloat(getComputedStyle(host).getPropertyValue('--gateway-origin')) || 200;
      frame.layout = layoutHarness(scene, pictureZone(frame.w, frame.h, origin), (value, px) => measure(value, `${px}px ${palette.mono}`));
      frame.timing = buildTiming(scene, frame.layout);
      frame.underlines = measureUnderlines(host, numerals.current, counts);
      paint(p);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    /* Names are measured in the page's faces; once they have loaded, lay out again. */
    let live = true;
    void document.fonts?.ready.then(() => {
      if (!live) return;
      measure.reset();
      resize();
    });

    const unregister = registerGatedFrameClient(
      host,
      ({ dtMs, factor }) => {
        /* A visitor who stopped moving sees the film to its end, where it rests on the whole harness. */
        if (factor < 1 && time.resting()) return;
        p = time.advance(dtMs);
        veil = Math.min(1, veil + dtMs / 450);
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
  }, [film, scene, labels]);

  /* The hook act names the first command the hooks really denied. */
  const [first = ''] = scene.commands.filter((command) => command.lane >= 0).map((command) => command.command);
  const format = useFormatter();
  const body = (act: number): ReactNode =>
    t.rich(`acts.${act}.body`, {
      first,
      instructions: format.number(scene.counts.instructions),
      code: (chunks) => <code className="whitespace-nowrap font-mono text-[color:var(--color-text-primary)]">{chunks}</code>,
    });

  return (
    <div
      role="region"
      aria-labelledby="gateway-harness-title"
      data-testid="gateway-harness"
      data-gateway-harness={film ? 'playing' : 'still'}
      className="relative mt-[var(--gateway-section-gap)] w-full"
    >
      {film ? (
        <div ref={stage} className="relative h-[100svh] max-h-[60rem] min-h-[36rem] w-full overflow-hidden">
          <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_78%,var(--color-canvas))]"
          />
          <div className={cn(PAGE_GUTTER, 'absolute inset-x-0 top-[4.5rem]')}>
            <h2
              id="gateway-harness-title"
              className={cn(PAGE_COLUMN, 'text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]')}
            >
              {t('label')}
            </h2>
          </div>
          <div className={cn(PAGE_GUTTER, 'absolute inset-x-0 bottom-[5svh]')}>
            <div className={PAGE_COLUMN}>
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
                      <div
                        ref={(node) => {
                          bodies.current[i] = node;
                        }}
                        className="mt-4 w-full opacity-0"
                      >
                        <HarnessCounts counts={scene.counts} film numerals={numerals} />
                      </div>
                    ) : (
                      <p
                        ref={(node) => {
                          bodies.current[i] = node;
                        }}
                        className="mt-3 max-w-[30rem] text-title leading-title text-[color:var(--color-text-secondary)] opacity-0"
                      >
                        {body(act)}
                      </p>
                    )}
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
        <div className={PAGE_GUTTER}>
          <div className={PAGE_COLUMN}>
            <h2
              id="gateway-harness-title"
              className="text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]"
            >
              {t('label')}
            </h2>
            <ol className="mt-6 grid gap-8 @container sm:grid-cols-2 lg:grid-cols-4">
              {ACTS.map((act) => (
                <li key={act} className="min-w-0">
                  <h3 className="text-title leading-title text-[color:var(--color-text-primary)]">
                    {t(`acts.${act}.title`)}
                  </h3>
                  {act === 4 ? (
                    <HarnessCounts counts={scene.counts} className="mt-3" />
                  ) : (
                    <p className="mt-2 text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
                      {body(act)}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
