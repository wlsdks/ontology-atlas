'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { isMotionPaused, subscribeMotionPause } from '@/shared/motion/motion-pause';
import { FONT_WEIGHT } from '@/shared/ui/tokens/font-weight';

import { createFilmClock } from '../lib/film-clock';
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
/** How long each act plays. The hook act types five commands, 1.3s each. */
const ACT_MS = [5000, 6500, 5750, 5000];
/** Where a paused film rests in each act: the columns read, a denied command, the sweep, the whole. */
const SETTLE = [0.72, 0.35, 0.8, 0.5];
const FILM_MIN_WIDTH = 768;
const FACTS: HarnessFacts = facts;
const COUNT_KEYS = ['instructions', 'hooks', 'checks'] as const;

/* Act one */
const LAND_MS = 360;
const READ_AT = 1500;
const READ_MS = 500;
const PARK_AT = 3900;
const PARK_MS = 700;
/* Act two */
const COMMAND_MS = 1300;
const TYPE_MS = 450;
const TICK_MS = 350;
const VERDICT_MS = 300;
const SLIDE_MS = 200;
const HISTORY_STEP = 48;
/* Act three */
const PLATE_PARK_MS = 600;
const CELLS_AT = 450;
const SWEEP_AT = 1100;
const SWEEP_STEP = 55;
const FILL_MS = 220;
const READOUT_EVERY = 6;
/* Act four: the first two strips meet the third, which the cells form, then the stack settles. */
const MERGE_MS = 800;
const GLIDE_AT = 1150;
const GLIDE_MS = 900;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const inOut = (v: number) => {
  const x = clamp(v);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixRect = (a: Rect, b: Rect, t: number): Rect => ({
  x: mix(a.x, b.x, t),
  y: mix(a.y, b.y, t),
  w: mix(a.w, b.w, t),
  h: mix(a.h, b.h, t),
});
/** Milliseconds into act `act` (0-based) at progress `p`; negative before it, past its length after. */
const local = (p: number, act: number) => ((p - act * 0.25) / 0.25) * ACT_MS[act]!;
/** An entrance: 0 → 1 over 360ms from `at`. */
const enter = (t: number, at: number) => inOut((t - at) / LAND_MS);

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

/** Text widths per font size, measured once: the same names are drawn every frame. */
function widthCache(ctx: CanvasRenderingContext2D, mono: string) {
  const known = new Map<string, number>();
  const measure = (text: string, px: number) => {
    const key = `${px}|${text}`;
    let width = known.get(key);
    if (width === undefined) {
      ctx.font = `${px}px ${mono}`;
      width = ctx.measureText(text).width;
      known.set(key, width);
    }
    return width;
  };
  return Object.assign(measure, { reset: () => known.clear() });
}

/**
 * Two token colours mixed in sRGB with their alpha, so a line can turn green, or a translucent
 * hairline turn red, without two copies of it fading or its opacity jumping.
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

interface Frame {
  ctx: CanvasRenderingContext2D;
  scene: HarnessScene;
  layout: HarnessLayout | null;
  palette: Palette;
  labels: Labels;
  measure: (text: string, px: number) => number;
  tint: (a: string, b: string, t: number) => string;
  w: number;
  h: number;
  p: number;
}

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

/** Strip marks: dim while parked under a later act, whole in the last. */
const STRIP_PARKED = 0.4;

/**
 * A strip mark in act four (`t4`): from where it waited (`from`) into the stack, then down with the
 * stack as one. `merge` is how far into the stack it is.
 */
function intoStack(strip: HarnessLayout['strips'][number], i: number, from: Rect, merge: number, t4: number): Rect {
  const at = mixRect(from, strip.merged[i]!, merge);
  return { ...at, y: at.y + (strip.whole[i]!.y - strip.merged[i]!.y) * inOut((t4 - GLIDE_AT) / GLIDE_MS) };
}

/**
 * Act one, and the first strip after it: four columns of the files an agent reads. Rows land top
 * down, a reading line passes down each column in turn, then every file settles into the strip.
 */
function drawInstructions(f: Frame, L: HarnessLayout) {
  const { palette, p } = f;
  const t = local(p, 0);
  const t4 = local(p, 3);
  if (t < 0) return;
  const total = L.files.length;
  const sans = f.palette.sans;
  const columnSpan = L.columns.map((_, c) => {
    const rows = L.files.filter((file) => file.column === c);
    const top = Math.min(...rows.map((file) => file.rect.y)) - 8;
    const bottom = Math.max(...rows.map((file) => file.rect.y + file.rect.h)) + 8;
    return { top, bottom };
  });

  const headerOut = inOut((t - PARK_AT) / LAND_MS);
  L.columns.forEach((column, c) => {
    const landed = L.files.filter((file) => file.column === c && t >= landAt(file.column, file.row) + LAND_MS / 2).length;
    const show = enter(t, landAt(c, 0)) * (1 - headerOut);
    const lift = -12 * headerOut + 12 * (1 - enter(t, landAt(c, 0)));
    f.ctx.textBaseline = 'alphabetic';
    text(f, f.labels.columns[c] ?? '', column.x, column.nameY + lift, `${TYPE.label}px ${sans}`, palette.soft, show);
    text(f, String(landed), column.x, column.countY + lift, `${FONT_WEIGHT.strong} ${TYPE.count}px ${sans}`, palette.ink, show);

    /* The reading line: 2px, the column's width, top to bottom in half a second. */
    const sweep = (t - READ_AT - c * READ_MS) / READ_MS;
    if (sweep > 0 && sweep < 1) {
      const { top, bottom } = columnSpan[c]!;
      block(f, { x: column.x, y: mix(top, bottom, sweep) - 1, w: column.width, h: 2 }, 1, palette.indigo, Math.sin(Math.PI * sweep));
    }
  });

  L.files.forEach((file, k) => {
    const strip = L.strips[0]!;
    const land = enter(t, landAt(file.column, file.row));
    if (land <= 0) return;
    const { top, bottom } = columnSpan[file.column]!;
    const readAt = READ_AT + file.column * READ_MS + READ_MS * ((file.rect.y + file.rect.h / 2 - top) / (bottom - top));
    const read = clamp((t - readAt) / 150);
    const park = inOut((t - PARK_AT - (k / Math.max(1, total - 1)) * 400) / PARK_MS);
    const rise = inOut((t4 - (k / Math.max(1, total - 1)) * 160) / MERGE_MS);
    const from = { ...file.rect, y: file.rect.y - 12 * (1 - land) };
    const at = intoStack(strip, k, mixRect(from, strip.parked[k]!, park), rise, t4);
    const markAlpha = mix(mix(1, STRIP_PARKED, park), 1, rise);

    if (file.text) {
      /* A named path: its text goes in the first quarter of the move, a mark grows in its place. */
      const words = land * (1 - clamp(park / 0.25));
      f.ctx.textBaseline = 'alphabetic';
      text(f, file.text, file.rect.x, file.rect.y + 11 - 12 * (1 - land), `${TYPE.label}px ${palette.mono}`, f.tint(palette.soft, palette.ink, read), words);
      block(f, at, mix(2, 1.5, park), palette.indigo, clamp(park / 0.25) * markAlpha);
      return;
    }
    const color = f.tint(palette.edge, palette.indigo, Math.max(read * 0.6, park));
    block(f, at, 2, color, land * mix(mix(0.4, 0.6, read), markAlpha, park));
  });
}

function landAt(column: number, row: number) {
  return 100 + column * 120 + row * 40;
}

/** One command's moments, from its own start: typing, the plates ticking, the verdict, the slide. */
function commandPhase(t: number, j: number) {
  const u = t - j * COMMAND_MS;
  return {
    u,
    typed: clamp(u / TYPE_MS),
    verdict: inOut((u - TYPE_MS - TICK_MS) / VERDICT_MS),
    slide: inOut((u - TYPE_MS - TICK_MS - VERDICT_MS) / SLIDE_MS),
  };
}

/**
 * Act two: the agent's commands typed one at a time at a block caret. Each passes the three gate
 * hooks in their configured order; a pass turns the line green, a deny turns its plate red, strikes
 * the line through and prints the hook's verdict. Then the line slides up into a two-line history.
 */
function drawHooks(f: Frame, L: HarnessLayout) {
  const { ctx, scene, palette, p, measure } = f;
  const t = local(p, 1);
  const t3 = local(p, 2);
  if (t < 0) return;
  const out = inOut(t3 / LAND_MS);
  const mono = `${TYPE.command}px ${palette.mono}`;
  const prompt = '$ ';
  const promptW = measure(prompt, TYPE.command);
  const { x, y } = L.command;
  ctx.textBaseline = 'middle';

  scene.commands.forEach((command, j) => {
    const { u, typed, verdict } = commandPhase(t, j);
    if (u < 0) return;
    /* How far up the history this line has slid, one step per later command's slide. */
    let level = 0;
    for (let m = j; m < scene.commands.length; m += 1) level += commandPhase(t, m).slide;
    const fade = level <= 1 ? 1 - 0.5 * level : level <= 2 ? 0.5 - 0.25 * (level - 1) : Math.max(0, 0.25 * (3 - level));
    const alpha = fade * (1 - out);
    if (alpha <= 0.004) return;
    const ly = y - HISTORY_STEP * level - 12 * out;
    const blocked = command.lane >= 0;
    const width = measure(command.command, TYPE.command);
    const shown = typed * command.command.length;
    const whole = Math.floor(shown);
    const ink = blocked ? f.tint(palette.ink, palette.soft, verdict) : f.tint(palette.ink, palette.pass, verdict);
    /* The prompt arrives with the caret, so a new line never pops in. */
    text(f, prompt, x, ly, mono, palette.dim, alpha * inOut(u / 120));
    text(f, command.command.slice(0, whole), x + promptW, ly, mono, ink, alpha);
    if (whole < command.command.length) {
      const next = command.command[whole]!;
      text(f, next, x + promptW + measure(command.command.slice(0, whole), TYPE.command), ly, mono, ink, alpha * (shown - whole));
    }
    if (blocked && verdict > 0) {
      block(f, { x: x + promptW - 2, y: ly - 1, w: (width + 4) * verdict, h: 2 }, 1, palette.stop, alpha);
      const deny = verdict * (1 - Math.min(1, level));
      text(f, '"permissionDecision": "deny"', x + promptW, ly + 40, `${TYPE.label}px ${palette.mono}`, palette.stop, deny * (1 - out));
    }
    /* The caret: solid while typing and while the hooks decide, gone as the line moves up. */
    const caret = inOut(u / 80) * (1 - inOut((u - TYPE_MS - TICK_MS - VERDICT_MS) / 150)) * (1 - out);
    if (caret > 0.004) {
      const cx = x + promptW + measure(command.command.slice(0, whole), TYPE.command) + (shown - whole) * measure('M', TYPE.command) + 4;
      block(f, { x: cx, y: ly - 11, w: 12, h: 22 }, 1, palette.ink, caret);
    }
  });
}

/**
 * The second strip: the gate's plates from act two, which shrink into it in act three, and every
 * other hook, which arrives there. In act four it rises with the others.
 */
function drawGateHooks(f: Frame, L: HarnessLayout) {
  const { ctx, scene, palette, p } = f;
  const t = local(p, 1);
  const t3 = local(p, 2);
  const t4 = local(p, 3);
  if (t < 0) return;
  const strip = L.strips[1]!;
  const count = scene.hookPlates.length;
  const tick = scene.gate.map(() => ({ pass: 0, stop: 0 }));
  scene.commands.forEach((command, j) => {
    const { u } = commandPhase(t, j);
    const gone = 1 - inOut((u - TYPE_MS - TICK_MS - VERDICT_MS) / SLIDE_MS);
    scene.gate.forEach((_, k) => {
      const lit = inOut((u - TYPE_MS - k * (TICK_MS / scene.gate.length)) / (TICK_MS / scene.gate.length)) * gone;
      if (command.lane < 0 || k < command.lane) tick[k]!.pass = Math.max(tick[k]!.pass, lit);
      else if (k === command.lane) tick[k]!.stop = Math.max(tick[k]!.stop, lit);
    });
  });

  scene.hookPlates.forEach((plate, j) => {
    const rise = inOut((t4 - (j / Math.max(1, count - 1)) * 120) / MERGE_MS);
    if (plate < 0) {
      const arrive = inOut((t3 - 500 - j * 20) / LAND_MS);
      if (arrive <= 0) return;
      const from = { ...strip.parked[j]!, y: strip.parked[j]!.y + 12 * (1 - arrive) };
      block(f, intoStack(strip, j, from, rise, t4), 1.5, palette.indigo, arrive * mix(STRIP_PARKED, 1, rise));
      return;
    }
    const show = inOut((t - plate * 60) / LAND_MS);
    if (show <= 0) return;
    const park = inOut((t3 - plate * 60) / PLATE_PARK_MS);
    const r = L.plates[plate]!;
    const from = { ...r, y: r.y + 12 * (1 - show) };
    const at = intoStack(strip, j, mixRect(from, strip.parked[j]!, park), rise, t4);
    const { pass, stop } = tick[plate]!;
    const words = 1 - clamp(park / 0.25);
    /* The plate: card ground with a hairline, red while it denies. Its name leaves first, the plate
       shrinks, and only then does it fill as the mark it becomes. */
    const plateLeft = 1 - clamp((park - 0.15) / 0.5);
    const radius = mix(8, 1.5, park);
    block(f, at, radius, palette.card, show * plateLeft);
    block(f, at, radius, palette.indigo, show * clamp((park - 0.35) / 0.5) * mix(STRIP_PARKED, 1, rise));
    if (plateLeft > 0.004) {
      ctx.globalAlpha = show * plateLeft;
      ctx.strokeStyle = f.tint(palette.edge, palette.stop, stop);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(at.x + 0.5, at.y + 0.5, at.w - 1, at.h - 1, radius);
      ctx.stroke();
    }
    if (words > 0.004) {
      ctx.textBaseline = 'middle';
      const name = scene.gate[plate]!;
      text(f, name, at.x + 16, at.y + at.h / 2, `${TYPE.label}px ${palette.mono}`, f.tint(f.tint(palette.soft, palette.ink, pass), palette.stop, stop), show * words);
      /* A pass is a small check at the plate's right end. */
      if (pass > 0.004) {
        const cx = at.x + at.w - 24;
        const cy = at.y + at.h / 2;
        ctx.globalAlpha = show * words * pass;
        ctx.strokeStyle = palette.pass;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy);
        ctx.lineTo(cx - 2, cy + 4);
        ctx.lineTo(cx + 6, cy - 5);
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
    }
  });
}

/**
 * Act three, and the third strip after it: one cell per check in three bands. A sweep fills them
 * green in turn while a readout names the check being run; in act four the cells become the strip.
 */
function drawChecks(f: Frame, L: HarnessLayout) {
  const { scene, palette, p } = f;
  const t = local(p, 2);
  const t4 = local(p, 3);
  if (t < 0) return;
  const out = inOut(t4 / LAND_MS);
  const strip = L.strips[2]!;
  const total = L.cells.length;
  f.ctx.textBaseline = 'alphabetic';
  L.bandLabels.forEach((at, b) => {
    const show = enter(t, CELLS_AT + b * 100) * (1 - out);
    const name = `${f.labels.bands[b] ?? ''}  ${scene.bands[b]!.names.length}`;
    text(f, name, at.x, at.y + 12 * (1 - enter(t, CELLS_AT + b * 100)) - 12 * out, `${TYPE.label}px ${palette.sans}`, palette.soft, show);
  });

  L.cells.forEach((cell, k) => {
    const column = k % 32;
    const show = enter(t, CELLS_AT + cell.band * 100 + column * 8);
    if (show <= 0) return;
    const fill = clamp((t - SWEEP_AT - k * SWEEP_STEP) / FILL_MS);
    const from = { ...cell.rect, y: cell.rect.y + 12 * (1 - show) };
    const to = strip.merged[cell.slot]!;
    /* The first band zips straight into the strip; later bands slide along their own row past it,
       then rise into its end, so they never pass over the first band's cells. */
    const across = cell.band === 0 ? inOut((t4 - column * 4) / 700) : inOut((t4 - 200) / 600);
    const up = cell.band === 0 ? across : inOut((t4 - 700) / 450);
    const moved = { x: mix(from.x, to.x, across), y: mix(from.y, to.y, up), w: mix(from.w, to.w, across), h: mix(from.h, to.h, up) };
    const at = intoStack(strip, cell.slot, moved, 0, t4);
    const rise = Math.min(across, up);
    const radius = mix(4, 1.5, rise);
    /* An empty cell is a quiet square; a run check fills green. */
    block(f, at, radius, palette.edge, show * 0.45 * (1 - fill));
    block(f, at, radius, palette.pass, show * fill);
  });

  /* The readout: the check now running, one name per six cells, each fading in after the last. */
  const slot = Math.floor((t - SWEEP_AT) / (READOUT_EVERY * SWEEP_STEP));
  const slots = Math.ceil(total / READOUT_EVERY);
  if (slot < 0) return;
  const s = Math.min(slot, slots - 1);
  const u = t - SWEEP_AT - s * READOUT_EVERY * SWEEP_STEP;
  const span = READOUT_EVERY * SWEEP_STEP;
  const fadeIn = inOut(u / 120);
  const fadeOut = s === slots - 1 ? 0 : inOut((u - span + 110) / 110);
  const name = L.cells[Math.min(total - 1, s * READOUT_EVERY)]!.name;
  text(f, name, L.zone.left, L.readoutY + 6 * (1 - fadeIn) - 12 * out, `${TYPE.readout}px ${palette.mono}`, palette.ink, fadeIn * (1 - fadeOut) * (1 - out));
}

function drawHarness(f: Frame) {
  const { ctx, w, h, layout } = f;
  ctx.clearRect(0, 0, w, h);
  if (!layout) return;
  drawInstructions(f, layout);
  drawGateHooks(f, layout);
  drawHooks(f, layout);
  drawChecks(f, layout);
  ctx.globalAlpha = 1;
}

/** Each caption holds its quarter, fading across the seams; the last one stays. */
function captionLight(act: number, p: number): number {
  const start = (act - 1) * 0.25;
  /* The outgoing caption is gone before the next one rises, so two never overlap. */
  const fadeIn = act === 1 ? 1 : clamp((p - start - 0.008) / 0.03);
  const fadeOut = act === 4 ? 1 : 1 - clamp((p - start - 0.212) / 0.03);
  return inOut(Math.min(fadeIn, fadeOut));
}

/** The last act's three counts: server-rendered with their final values, read as a list of terms. */
function HarnessCounts({ counts, className }: { counts: HarnessScene['counts']; className?: string }) {
  const t = useTranslations('download.harnessFilm');
  const format = useFormatter();
  return (
    <dl className={cn('flex flex-wrap gap-x-10 gap-y-4', className)}>
      {COUNT_KEYS.map((key) => (
        <div key={key} className="flex min-w-0 flex-col-reverse">
          <dt className="mt-1 text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
            {t(`counts.${key}`)}
          </dt>
          <dd
            data-token="engraved-numeral"
            className="text-hero font-[var(--font-weight-signature)] tabular-nums tracking-[var(--tracking-monument)] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
          >
            {format.number(counts[key])}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The page's second film, beside the map's: this repository's real harness. While the visitor
 * watches, it plays by itself: the files an agent reads, the hooks that stop it, the checks that
 * verify it, then all three counted. Without a script, under reduced motion or on a narrow screen
 * the four acts are one visible list and nothing is drawn, so the page never reflows.
 */
export function HarnessFilm() {
  const t = useTranslations('download.harnessFilm');
  const groups = useTranslations('harness.groups');
  const scene = useMemo(() => buildHarnessScene(FACTS), []);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const captions = useRef<(HTMLLIElement | null)[]>([]);
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
    /* Below this the four columns and the gate plates cannot stand side by side, so the film rests. */
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
    const measure = widthCache(ctx, palette.mono);
    const frame: Frame = {
      ctx,
      scene,
      layout: null,
      palette,
      labels,
      measure,
      tint: colorMixer(ctx),
      w: 0,
      h: 0,
      p: 0,
    };

    const time = createFilmClock(ACT_SPANS, ACT_MS);
    let veil = 1;
    const paint = () => {
      drawHarness(frame);
      const light = isMotionPaused() ? 1 : time.fade() * veil;
      el.style.opacity = String(light);
      captions.current.forEach((caption, i) => {
        if (!caption) return;
        const lit = captionLight(i + 1, frame.p) * light;
        caption.style.opacity = String(lit);
        caption.style.transform = `translateY(${(1 - lit) * 12}px)`;
        caption.style.visibility = lit > 0.01 ? 'visible' : 'hidden';
      });
      const act = time.act();
      fills.current.forEach((fill, i) => {
        if (!fill) return;
        const [start, end] = ACT_SPANS[i]!;
        fill.style.transform = `scaleX(${i < act ? 1 : i > act ? 0 : clamp((frame.p - start) / (end - start))})`;
      });
    };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      frame.w = el.clientWidth;
      frame.h = el.clientHeight;
      el.width = Math.round(frame.w * dpr);
      el.height = Math.round(frame.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* `--gateway-origin` is a registered length, so it reads back resolved to px. */
      const origin = parseFloat(getComputedStyle(host).getPropertyValue('--gateway-origin')) || 200;
      frame.layout = layoutHarness(scene, pictureZone(frame.w, frame.h, origin), measure);
      paint();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    /* Names are measured in the page's mono face; once it has loaded, lay out again. */
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
        frame.p = time.advance(dtMs);
        veil = Math.min(1, veil + dtMs / 450);
        paint();
      },
      undefined,
      { keepAwake: true },
    );
    /* Paused, a still frame lands inside its act, where its picture and caption are whole. */
    const settle = (act: number) => time.advance(ACT_MS[act]! * SETTLE[act]!);
    seek.current = (act) => {
      time.seek(act);
      const paused = isMotionPaused();
      frame.p = paused ? settle(act) : time.progress();
      /* A jump fades in from dark instead of cutting; paused, it shows the act at once. */
      veil = paused ? 1 : 0;
      paint();
    };
    const offPause = subscribeMotionPause(() => {
      if (!isMotionPaused()) return;
      /* A film paused before it began would hold a dark first frame: show its first act instead. */
      if (time.progress() === 0) frame.p = settle(0);
      paint();
    });
    if (isMotionPaused()) {
      frame.p = settle(0);
      paint();
    }
    return () => {
      live = false;
      observer.disconnect();
      unregister();
      offPause();
      seek.current = () => {};
    };
  }, [film, scene, labels]);

  /* The hook act names the first two commands the hooks really denied. */
  const [first = '', second = ''] = scene.commands.filter((command) => command.lane >= 0).map((command) => command.command);
  const body = (act: number): ReactNode =>
    t.rich(`acts.${act}.body`, {
      first,
      second,
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
                    className="invisible flex min-w-0 max-w-[40rem] flex-col items-start text-left opacity-0 [grid-area:1/1]"
                  >
                    <h3 className="[text-wrap:balance] text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)] sm:text-hero-lg">
                      {t(`acts.${act}.title`)}
                    </h3>
                    {act === 4 ? (
                      <HarnessCounts counts={scene.counts} className="mt-4" />
                    ) : (
                      <p className="mt-3 max-w-[30rem] text-title leading-title text-[color:var(--color-text-secondary)]">
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
                className="mt-6 justify-start"
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
