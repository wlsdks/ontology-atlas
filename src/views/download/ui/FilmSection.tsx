'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { FONT_WEIGHT } from '@/shared/ui/tokens/font-weight';
import { isMotionPaused, subscribeMotionPause } from '@/shared/motion/motion-pause';

import {
  buildFilmScene,
  crossesClusters,
  haloMarks,
  labelBox,
  markRadius,
  pickCloseUp,
  pickNamedFiles,
  placeLabels,
  scheduleRelations,
  scheduleTyping,
  type FilmCloseUp,
  type FilmScene,
  type LabelSpot,
} from '../lib/film-scene';
import {
  applyCamera,
  cameraAt,
  clamp01,
  drawHalo,
  drawHitRing,
  drawKeyLight,
  drawStreak,
  easeInOut,
  easeOut,
  lerp,
  lightSprite,
  projectPoint,
  type CameraKey,
  type CameraShot,
} from '../lib/film-kit';
import { createFilmClock } from '../lib/film-clock';
import { registerGatedFrameClient } from '../lib/gateway-frame-loop';
import type { StageGraph } from '../lib/stage-graph';
import { FilmActBar } from './FilmActBar';

const ACTS = [1, 2, 3, 4] as const;
/** How long each act plays: the files, one file opened, the map assembles, the map. */
const ACT_MS = [2000, 3000, 2600, 2800];
const FILM_MS = ACT_MS.reduce((a, b) => a + b, 0);
const ACT_START = ACT_MS.map((_, i) => ACT_MS.slice(0, i).reduce((a, b) => a + b, 0));
/** Each act's span of the choreography, in proportion to its time, so progress maps to one film clock. */
const ACT_SPANS = ACT_MS.map((ms, i) => [ACT_START[i]! / FILM_MS, (ACT_START[i]! + ms) / FILM_MS] as const);
/** The last frame holds this long, then the picture fades out and back in on the first act. */
const HOLD_MS = 1800;
const FADE_MS = 260;
/** Where a paused film rests inside each act, as a share of the act, so its picture is whole. */
const SETTLE = [0.6, 0.75, 0.6, 0.7];

/** Beats of the film, in milliseconds from its start. */
const AT = {
  /** Far, mid and near layers of files drop in on three beats. */
  layers: [0, 100, 200],
  /** The far and mid layers fall back and the key light lands on the opened file. */
  rack: 900,
  /** The opened file's card becomes the file panel. */
  open: 1500,
  /** When each frontmatter line that becomes a mark is typed to its end. */
  landings: [2270, 2530, 2800, 3130, 3370, 3600],
  /** The fragment owns the frame at its closest. */
  close: 4270,
  /** The panel folds back into its mark. */
  fold: 4530,
  /** The other files fly in from outside the frame while the camera pulls back and rolls level. */
  flights: 5000,
  /** The four cluster hubs land. */
  beats: [5400, 5670, 5930, 6200],
  /** The camera at its widest. */
  whole: 6200,
  /** The last relation starts drawing. */
  lastLine: 7120,
  /** Every relation is lit, the count lands and the project hub takes the key light. */
  amber: 7300,
  /** The map at full exposure, the camera settled, its regions named. */
  expose: 7600,
  /** The camera pushes in on the opened concept. */
  focus: 8400,
  focused: 9200,
} as const;
/** Where a still frame of the finished map is taken: regions named, nothing dimmed. */
const STILL_MS = 8300;

const ENTER_MS = 240;
const DROP_PX = 24;
const STAGGER_MS = 20;
const OPEN_MS = 300;
const TYPE_MS = 250;
const HAIRLINE_MS = 150;
const LABEL_MS = 160;
const LABEL_RISE = 12;
const FLIGHT_MS = 470;
const STROKE_MS = 180;
const STREAK_MS = 48;
/** The camera's slow push, so no frame is ever quite still. */
const CREEP = 0.1;
/** A relation starts this long after the later of its two ends lands. */
const ANSWER_MS = 60;
/** The bright head that draws a relation, and how long the line behind it takes to cool. */
const HEAD_PX = 14;
const COOL_MS = 300;
/** At the end, a pulse leaves the opened concept along each of its relations in turn. */
const PULSE_MS = 360;
const PULSE_EVERY_MS = 600;
/** The camera's roll while it pulls back, in radians: level, tilted, then level again. */
const ROLL = (-3 * Math.PI) / 180;
const HALO_SCALE = 5;
const HALO_ALPHA = 0.22;
const HALO_MS = 240;

/** Three depth layers of the floating files: parallax, size, tone, drift. */
const DEPTH = [0.4, 0.7, 1];
const LAYER_SCALE = [0.6, 0.8, 1];
const LAYER_TONE = [0.5, 0.75, 1];
const DRIFT_PX = [6, 10, 16];
const DRIFT_MS = [7000, 8000, 9000];

const span = (t: number, from: number, ms: number) => clamp01((t - from) / ms);

/** One line of the opened file's frontmatter; `role` ties it to what it becomes on the map. */
interface FrontmatterLine {
  key: string | null;
  value: string;
  role: 'kind' | 'domain' | 'title' | 'dependency' | null;
  /** For a dependency's own list item, which dependency it names. */
  dep?: number;
  /** When it starts and finishes typing, ms from the film's start. */
  from: number;
  to: number;
}

interface Palette {
  ink: string;
  secondary: string;
  dim: string;
  ground: string;
  card: string;
  edge: string;
  indigo: string;
  pale: string;
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
    pale: v('--color-indigo-pale-a90'),
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
interface FieldItem extends Box {
  layer: 0 | 1 | 2;
  named: boolean;
  /** Its column across the stage, for the left-to-right drop-in. */
  col: number;
}
/** A name on the finished map: its anchor in stage space, so it rides the camera with its mark. */
interface NameSpot {
  ax: number;
  ay: number;
  w: number;
  h: number;
  align: LabelSpot['align'];
  leader: boolean;
}

/** Everything about the stage that depends on its size, worked out once per resize. */
interface Layout {
  w: number;
  h: number;
  dpr: number;
  stamps: TextStamps;
  wide: boolean;
  /** Body size of the canvas text: 15px, 13px on a phone. */
  text: number;
  zone: { l: number; r: number; t: number; b: number };
  centre: Point;
  field: FieldItem[];
  /** Each concept's place on the finished map and its mark's radius (stage pixels at zoom 1). */
  map: Point[];
  mark: number[];
  panel: Box & { font: number; lineH: number; barH: number; padX: number; padY: number };
  /** The fragment's marks in the close-up, placed so they land beside the panel at full zoom. */
  staged: Map<number, Point>;
  stagedMark: Map<number, number>;
  keys: CameraKey[];
  /** When each concept lands on the map: its frontmatter beat, or the end of its flight. */
  land: number[];
  /** When each relation starts to draw; -1 for those the fragment already drew. */
  edgeStart: number[];
  /** Whether a relation draws from its `from` end (the end that landed first). */
  edgeFromFirst: boolean[];
  /** When each file's flight starts in act 3; -1 for the fragment. */
  flightStart: number[];
  /** Where each flying file enters from, a screen point outside the frame. */
  flightFrom: Point[];
  names: Map<number, NameSpot>;
  /** The closing push-in's names besides the regions: the opened concept alone on a phone. */
  focusNames: number[];
  regionSize: number;
  countSize: number;
  focusSize: number;
}

/** A shot that puts stage point `c` at screen point `a` with `zoom`, as a key the kit can ease. */
function shotKey(w: number, h: number, t: number, c: Point, a: Point, zoom: number, heldSince = t): CameraKey {
  const at = t / FILM_MS;
  const raw = zoom / (1 + CREEP * (heldSince / FILM_MS));
  const seen = raw * (1 + CREEP * at);
  return { at, cx: c.x - (a.x - w / 2) / seen, cy: c.y - (a.y - h / 2) / seen, zoom: raw };
}

/** The shot a far layer sees: it moves and grows less, as `applyCamera` does with `depth`. */
function depthShot(shot: CameraShot, depth: number, w: number, h: number): CameraShot {
  return { cx: lerp(w / 2, shot.cx, depth), cy: lerp(h / 2, shot.cy, depth), zoom: 1 + (shot.zoom - 1) * depth };
}

/** The camera's roll at film time `T`: it tilts as act 3 begins and comes level by the time the map settles. */
function rollAt(T: number): number {
  return ROLL * (easeInOut(span(T, AT.flights, 600)) - easeInOut(span(T, AT.flights + 600, AT.expose - AT.flights - 600)));
}

interface FilmCast {
  scene: FilmScene;
  pick: FilmCloseUp | null;
  lines: readonly FrontmatterLine[];
  /** The opened file's name for its concept before its title line is typed. */
  slug: string;
  /** The project and the cluster hubs, named on the finished map. */
  regions: number[];
  /** Each region's second line: how many concepts it holds. */
  regionCounts: Map<number, string>;
  /** Hubs that land on the act-3 beats, in beat order. */
  beatHubs: number[];
  /** The opened concept and the concepts its relations reach. */
  neighbours: ReadonlySet<number>;
  /** The opened concept's own relations, in the order the closing pulses travel them. */
  litEdges: number[];
  /** Names shown in the closing push-in besides the regions. */
  focusNames: number[];
  /** Relations the opened file drew in its close-up, which never leave the stage. */
  fragmentEdges: ReadonlySet<number>;
  fragment: ReadonlySet<number>;
  /** Marks that carry a halo once they land. */
  halos: number[];
}

/**
 * Lays the files of act 1 in up to three rows of six across `span` (one column of six on a
 * phone). Each row packs its cards by their real widths, so a long file name never runs over its
 * neighbour; a file no row has room for stays a blank slip (`null`).
 */
function layoutCards(
  scene: FilmScene,
  named: number[],
  widthOf: (i: number) => number,
  span: { l: number; r: number },
  fieldT: number,
  cellH: number,
  cardH: number,
  wide: boolean,
  opened: number | null,
): (Box | null)[] {
  const spanW = span.r - span.l;
  if (!wide) {
    /* One column on a phone, each file stepping left and right of the one above. */
    return named.map((i, k) => {
      const cardW = widthOf(i);
      const room = Math.max(0, spanW - cardW);
      const seed = scene.nodes[i]!.seed;
      const across = k % 2 === 0 ? 0.08 + 0.22 * seed : 0.7 + 0.22 * seed;
      return { x: span.l + cardW / 2 + room * across, y: fieldT + (k + 0.5) * cellH, w: cardW, h: cardH };
    });
  }
  const ROWS = 3;
  const PER_ROW = 6;
  const MIN_GAP = 28;
  const rows: number[][] = Array.from({ length: ROWS }, () => []);
  const totals = new Array<number>(ROWS).fill(0);
  const room = (r: number, k: number) =>
    rows[r]!.length < PER_ROW && totals[r]! + widthOf(named[k]!) + MIN_GAP * (rows[r]!.length + 1) <= spanW;
  const place = (k: number, row: number) => {
    rows[row]!.push(k);
    totals[row]! += widthOf(named[k]!);
  };
  /* The opened file sits in the middle row; the rest fill the shortest row with room. */
  if (opened !== null && named.includes(opened)) place(named.indexOf(opened), 1);
  named
    .map((_, k) => k)
    .filter((k) => named[k] !== opened)
    .sort((a, b) => widthOf(named[b]!) - widthOf(named[a]!) || a - b)
    .forEach((k) => {
      let best = -1;
      for (let r = 0; r < ROWS; r += 1) {
        if (!room(r, k)) continue;
        if (best < 0 || totals[r]! < totals[best]!) best = r;
      }
      if (best >= 0) place(k, best);
    });
  const boxes: (Box | null)[] = named.map(() => null);
  rows.forEach((row, r) => {
    const seedOf = (k: number) => scene.nodes[named[k]!]!.seed;
    row.sort((a, b) => seedOf(a) - seedOf(b));
    /* The opened file near the middle of its row, so the camera's push goes into the picture. */
    const at = row.findIndex((k) => named[k] === opened);
    if (at >= 0) row.splice(Math.floor((row.length - 1) / 2), 0, ...row.splice(at, 1));
    const gap = (spanW - totals[r]!) / Math.max(1, row.length);
    const shift = (r === 1 ? 0.2 : -0.2) * gap;
    let x = span.l + gap / 2 + shift;
    row.forEach((k) => {
      const node = scene.nodes[named[k]!]!;
      const cardW = widthOf(named[k]!);
      const jx = (node.seed * 2 - 1) * Math.min(12, gap * 0.2);
      const jy = (node.gy * 2 - 1) * ((cellH - cardH) / 2) * 0.6;
      boxes[k] = { x: x + cardW / 2 + jx, y: fieldT + (r + 0.5) * cellH + jy, w: cardW, h: cardH };
      x += cardW + gap;
    });
  });
  return boxes;
}

function layoutFilm(
  ctx: CanvasRenderingContext2D,
  cast: FilmCast,
  palette: Palette,
  w: number,
  h: number,
  dpr: number,
  column: { left: number; width: number },
  film: boolean,
): Layout {
  const { scene, pick } = cast;
  const wide = w >= 768;
  const text = wide ? 15 : 13;
  const zone = {
    l: column.left,
    r: column.left + column.width,
    /* Below the film's title, which sits higher than the caption's column on a phone. */
    t: wide ? 96 : 108,
    b: film ? h * (wide ? 0.667 : 0.557) : h - 40,
  };
  const zoneW = zone.r - zone.l;
  const zoneH = zone.b - zone.t;
  const centre = { x: zone.l + zoneW / 2, y: zone.t + zoneH / 2 };

  /*
   * Up to eighteen files keep their names (six on a phone); the rest are blank slips on three
   * depths. On a wide stage the files spread past the picture to the stage's sides, where the
   * camera's wide first shot still sees them, so real file names fit six to a row.
   */
  ctx.font = `${text}px ${palette.mono}`;
  const rows = wide ? 3 : 6;
  const reachX = wide ? Math.min(w / 2 - 32, Math.max(zoneW / 2, 720)) : zoneW / 2;
  const span = { l: centre.x - reachX, r: centre.x + reachX };
  const spanW = span.r - span.l;
  /* The camera pushes in on the files, so they start a little inside the picture's top and bottom. */
  const fieldT = zone.t + zoneH * 0.06;
  const cellH = (zoneH * 0.9) / rows;
  const pad = wide ? 44 : 40;
  const cardMax = wide ? Math.min(250, spanW / 6 - 16) : Math.min(260, zoneW - 48);
  const cardH = wide ? 52 : 40;
  const widthOf = (i: number) => ctx.measureText(scene.nodes[i]!.file).width + pad;
  const fits = (file: string) => ctx.measureText(file).width + pad <= cardMax;
  const picked = pickNamedFiles(scene, pick?.index ?? null, wide ? 18 : 6, fits);
  const placed = layoutCards(scene, picked, widthOf, span, fieldT, cellH, cardH, wide, pick?.index ?? null);
  const named = picked.filter((_, k) => placed[k] !== null);
  const cards = placed.filter((box): box is Box => box !== null);
  const namedAt = new Map(named.map((i, k) => [i, k]));

  const slab = wide ? { w: 28, h: 8 } : { w: 22, h: 6 };
  const field: FieldItem[] = scene.nodes.map((node, i) => {
    const k = namedAt.get(i);
    if (k !== undefined) {
      const card = cards[k]!;
      return { ...card, layer: 2, named: true, col: Math.floor(((card.x - span.l) / spanW) * 12) };
    }
    const layer = node.layer;
    let x = span.l + node.gx * spanW;
    let y = zone.t + node.gy * zoneH;
    /* A near slip never sits under a named file, so no edge peeks out from behind one. */
    for (const card of layer === 2 ? cards : []) {
      const clearX = card.w / 2 + slab.w / 2 + 10;
      const clearY = card.h / 2 + slab.h / 2 + 10;
      if (Math.abs(x - card.x) < clearX && Math.abs(y - card.y) < clearY) {
        y = card.y + Math.sign(y - card.y || 1) * clearY;
        x = Math.min(span.r - slab.w / 2, Math.max(span.l + slab.w / 2, x));
      }
    }
    const s = LAYER_SCALE[layer]!;
    return { x, y, w: slab.w * s, h: slab.h * s, layer, named: false, col: Math.floor(node.gx * 12) };
  });

  /* The map fills the picture: x by 0.36 of the stage, y by 0.27 (0.42 and 0.24 on a phone). */
  const sx = Math.min(w * (wide ? 0.36 : 0.42), zoneW / 2 - 8);
  const sy = Math.min(h * (wide ? 0.27 : 0.24), zoneH / 2 - 14);
  const map = scene.nodes.map((node) => ({ x: centre.x + node.x * sx, y: centre.y + node.y * sy }));
  const mark = scene.nodes.map((node) => markRadius(node.kind, node.degree, wide));

  /* The opened file: a panel on the left with its fragment beside it, or on top on a phone. */
  const font = wide ? 20 : 14;
  const lineH = wide ? 34 : 22;
  const barH = wide ? 48 : 36;
  const padX = wide ? 24 : 14;
  const padY = wide ? 18 : 10;
  const panelW = wide ? Math.min(560, zoneW * 0.54) : zoneW;
  const panelH = barH + padY * 2 + cast.lines.length * lineH;
  const panel = {
    x: zone.l,
    y: wide ? Math.max(zone.t, centre.y - panelH / 2) : zone.t,
    w: panelW,
    h: panelH,
    font,
    lineH,
    barH,
    padX,
    padY,
  };

  const staged = new Map<number, Point>();
  const stagedMark = new Map<number, number>();
  const keys: CameraKey[] = [shotKey(w, h, 0, centre, centre, 0.9)];
  let subject = centre;
  if (pick) {
    const card = field[pick.index]!;
    keys.push(shotKey(w, h, ACT_START[1]!, { x: lerp(centre.x, card.x, 0.55), y: lerp(centre.y, card.y, 0.55) }, centre, 1.12));
    /* Where the fragment sits on screen at its closest: a column beside the panel, read top down. */
    const closeZoom = wide ? 1.6 : 1.2;
    const self = wide
      ? { x: panel.x + panelW + 110, y: centre.y - 10 }
      : { x: zone.l + zoneW * 0.46, y: panel.y + panelH + (zone.b - panel.y - panelH) * 0.42 };
    const parent = wide ? { x: self.x, y: self.y - 150 } : { x: zone.l + 56, y: self.y };
    const deps = pick.dependencies.map((_, k) =>
      wide
        ? { x: self.x + 100, y: self.y + 84 + k * 58 }
        : { x: zone.r - 34, y: self.y + (k - (pick.dependencies.length - 1) / 2) * 30 },
    );
    const radius = wide ? { parent: 12.5, self: 14, dep: 10.5 } : { parent: 8, self: 9, dep: 6.5 };
    subject = map[pick.index]!;
    const toStage = (p: Point) => ({ x: subject.x + (p.x - self.x) / closeZoom, y: subject.y + (p.y - self.y) / closeZoom });
    staged.set(pick.index, subject);
    staged.set(pick.parent, toStage(parent));
    pick.dependencies.forEach((dep, k) => staged.set(dep, toStage(deps[k]!)));
    stagedMark.set(pick.index, radius.self / closeZoom);
    stagedMark.set(pick.parent, radius.parent / closeZoom);
    pick.dependencies.forEach((dep) => stagedMark.set(dep, radius.dep / closeZoom));

    /* The camera follows each landing: a step closer, and a pan as the file's meaning grows. */
    const pan = wide ? 40 : 12;
    const marks = 3 + pick.dependencies.length;
    const fromZoom = wide ? 1.2 : 1.05;
    const toZoom = wide ? 1.5 : 1.15;
    AT.landings.slice(0, marks).forEach((landing, k) => {
      const step = marks === 1 ? 1 : k / (marks - 1);
      keys.push(shotKey(w, h, landing + HAIRLINE_MS, subject, { x: self.x + pan * (marks - 1 - k), y: self.y }, lerp(fromZoom, toZoom, step)));
    });
    keys.push(shotKey(w, h, AT.close, subject, self, closeZoom));
    keys.push(shotKey(w, h, AT.fold, subject, self, closeZoom, AT.close));
  }
  /* Act 3: the camera pulls back past the whole map while it assembles, then settles on it. */
  keys.push(shotKey(w, h, AT.whole, centre, centre, 0.82));
  keys.push(shotKey(w, h, AT.expose, centre, centre, 1));
  keys.push(shotKey(w, h, AT.focus, centre, centre, 1, AT.expose));
  /* The closing push-in: on the opened concept and its real neighbours. */
  const lit = [...cast.neighbours];
  const focusAt =
    lit.length > 0
      ? { x: lit.reduce((s, i) => s + map[i]!.x, 0) / lit.length, y: lit.reduce((s, i) => s + map[i]!.y, 0) / lit.length }
      : centre;
  /*
   * Sideways only, and a little low: the map then grows past the picture into the room above the
   * caption, never under the title. A phone's map already spans its width, so it pushes in less.
   */
  keys.push(
    shotKey(w, h, AT.focused, { x: lerp(centre.x, focusAt.x, wide ? 0.35 : 0.25), y: centre.y }, { x: centre.x, y: centre.y + (wide ? 40 : 24) }, wide ? 1.18 : 1.08),
  );

  /* Act 3: each cluster's files land around their hub's beat; the rest spread over the act. */
  const beatOf = new Map<number, number>();
  cast.beatHubs.forEach((hub, k) => beatOf.set(hub, AT.beats[k]!));
  const flightStart = scene.nodes.map((node, i) => {
    if (cast.fragment.has(i)) return -1;
    const hubBeat = cast.beatHubs.indexOf(i);
    if (hubBeat >= 0) return AT.beats[hubBeat]! - FLIGHT_MS;
    const beat = beatOf.get(node.cluster);
    if (beat !== undefined) return Math.max(AT.flights, beat - FLIGHT_MS - 150 + node.seed * 300);
    return AT.flights + node.order * (AT.beats[0]! - AT.flights) + node.seed * 140;
  });
  const reach = Math.hypot(w, h) / 2 + 40;
  const flightFrom = scene.nodes.map((node, i) => {
    const dx = map[i]!.x - centre.x;
    const dy = map[i]!.y - centre.y;
    const base = Math.hypot(dx, dy) < 1 ? -Math.PI / 2 : Math.atan2(dy, dx);
    const a = base + (node.seed - 0.5) * 0.6;
    const r = reach + node.seed * 120;
    const from = { x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r };
    /* Nothing enters from below, where it would cross the caption: those come in from the side. */
    if (from.y > zone.b) return { x: dx < 0 ? -40 - node.seed * 120 : w + 40 + node.seed * 120, y: lerp(centre.y, zone.b, node.seed) };
    return from;
  });

  /* When each concept lands: the fragment on its frontmatter beat, the rest at the end of their flight. */
  const landedLine = (role: FrontmatterLine['role'], dep?: number) => {
    const line = cast.lines.find((l) => l.role === role && (dep === undefined || l.dep === dep));
    return line ? line.to + HAIRLINE_MS : AT.flights;
  };
  const land = scene.nodes.map((_, i) => (flightStart[i]! >= 0 ? flightStart[i]! + FLIGHT_MS : AT.flights));
  if (pick) {
    land[pick.parent] = landedLine('domain');
    land[pick.index] = landedLine('kind');
    pick.dependencies.forEach((dep, k) => (land[dep] = landedLine('dependency', k)));
  }
  /* Lines answer landings: each relation starts just after its later end lands, containment first. */
  const edgeStart = scheduleRelations(scene.edges, land, cast.fragmentEdges, {
    delay: ANSWER_MS,
    containLead: 90,
    earliest: AT.flights + ANSWER_MS,
    lastStart: AT.lastLine,
  });
  const edgeFromFirst = scene.edges.map((edge) => land[edge.from]! <= land[edge.to]!);

  /*
   * Names on the finished map, placed once with a collision pass where they first show, at the
   * film's widest framing after that. Anchored in stage space, they only spread apart as the
   * camera pushes in, so no two meet at any later frame. The closing names stand off the opened
   * concept's crowd along leader lines when there is no room beside their marks.
   */
  const regionSize = wide ? 22 : 15;
  const countSize = wide ? 15 : 13;
  const focusSize = wide ? 18 : 13;
  const names = new Map<number, NameSpot>();
  const ref = cameraAt(keys, AT.expose / FILM_MS, CREEP);
  const last = cameraAt(keys, 1, CREEP);
  const unproject = (shot: CameraShot, x: number, y: number) => ({ x: shot.cx + (x - w / 2) / shot.zoom, y: shot.cy + (y - h / 2) / shot.zoom });
  const toRef = (shot: CameraShot, x: number, y: number) => {
    const s = unproject(shot, x, y);
    return projectPoint(w, h, ref, s.x, s.y);
  };
  /* The stage, minus the title above and the caption below, as it stands at both ends of the push-in. */
  const bottom = zone.b + (wide ? 60 : 30);
  const lastTop = toRef(last, 8, zone.t);
  const lastBottom = toRef(last, w - 8, bottom);
  const bounds = { l: Math.max(8, lastTop.x), t: Math.max(zone.t, lastTop.y), r: Math.min(w - 8, lastBottom.x), b: Math.min(bottom, lastBottom.y) };
  /* A phone has no room for four more names in the crowd around the opened concept. */
  const focusNames = wide ? cast.focusNames : cast.focusNames.slice(0, 1);
  const crowd = cast.focusNames.length > 0 ? cast.focusNames : cast.regions;
  const crowdAt = {
    x: crowd.reduce((sum, i) => sum + map[i]!.x, 0) / Math.max(1, crowd.length),
    y: crowd.reduce((sum, i) => sum + map[i]!.y, 0) / Math.max(1, crowd.length),
  };
  const asked = [
    ...cast.regions.map((i) => ({ i, size: regionSize, from: centre, count: cast.regionCounts.get(i) ?? '' })),
    ...focusNames.map((i) => ({ i, size: focusSize, from: crowdAt, count: '' })),
  ];
  const requests = asked.map(({ i, size, from, count }) => {
    ctx.font = `${FONT_WEIGHT.strong} ${size}px ${palette.sans}`;
    let tw = ctx.measureText(scene.nodes[i]!.label).width;
    if (count) {
      ctx.font = `${countSize}px ${palette.mono}`;
      tw = Math.max(tw, ctx.measureText(count).width);
    }
    const p = projectPoint(w, h, ref, map[i]!.x, map[i]!.y);
    let ox = map[i]!.x - from.x;
    let oy = map[i]!.y - from.y;
    if (Math.hypot(ox, oy) < 1) {
      ox = map[i]!.x - centre.x;
      oy = map[i]!.y - centre.y;
    }
    const len = Math.hypot(ox, oy);
    return {
      x: p.x,
      y: p.y,
      r: mark[i]! * ref.zoom + 2,
      w: tw,
      h: size * 1.25 + (count ? countSize * 1.35 : 0),
      out: len < 1 ? { x: 0, y: 1 } : { x: ox / len, y: oy / len },
    };
  });
  placeLabels(requests, { gap: 12, bounds }).forEach((spot, k) => {
    const req = requests[k]!;
    const anchor = unproject(ref, req.x + spot.dx, req.y + spot.dy);
    names.set(asked[k]!.i, { ax: anchor.x, ay: anchor.y, w: req.w, h: req.h, align: spot.align, leader: spot.leader });
  });

  return {
    w,
    h,
    dpr,
    stamps: new TextStamps(dpr),
    wide,
    text,
    zone,
    centre,
    field,
    map,
    mark,
    panel,
    staged,
    stagedMark,
    keys,
    land,
    edgeStart,
    edgeFromFirst,
    flightStart,
    flightFrom,
    names,
    focusNames,
    regionSize,
    countSize,
    focusSize,
  };
}

/**
 * Draws the whole film off screen in idle time before it plays, a few moments per slice, so every
 * name's bitmap is made before its first frame instead of in the middle of a camera move.
 */
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
      T += 200;
    }
    if (T <= FILM_MS) handle = idle ? requestIdleCallback(slice, { timeout: 400 }) : window.setTimeout(slice, 16);
  };
  handle = idle ? requestIdleCallback(slice, { timeout: 400 }) : window.setTimeout(slice, 16);
  return () => (idle ? cancelIdleCallback(handle) : window.clearTimeout(handle));
}

/** Room around a stamp's text for its halo. */
const STAMP_PAD = 4;

/**
 * Moving text, drawn once into a small canvas and stamped: a stamp lands on fractional pixels as
 * smoothly as a mark does, where text drawn directly snaps a pixel at a time as the camera creeps.
 * A `halo` is a rim of the ground behind the text, so a line passing under it never cuts it.
 */
class TextStamps {
  private stamps = new Map<string, { canvas: HTMLCanvasElement; w: number; h: number; tw: number }>();
  constructor(private readonly dpr: number) {}

  draw(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    { font, size, fill, halo, align = 'start' }: { font: string; size: number; fill: string; halo?: string; align?: CanvasTextAlign },
  ) {
    const key = `${font}|${fill}|${halo ?? ''}|${text}`;
    let stamp = this.stamps.get(key);
    if (!stamp) {
      const canvas = document.createElement('canvas');
      const c = canvas.getContext('2d');
      if (!c) return;
      c.font = font;
      const tw = c.measureText(text).width;
      const w = tw + STAMP_PAD * 2;
      const h = size * 1.5 + STAMP_PAD * 2;
      canvas.width = Math.ceil(w * this.dpr);
      canvas.height = Math.ceil(h * this.dpr);
      c.scale(this.dpr, this.dpr);
      c.font = font;
      c.textBaseline = 'middle';
      if (halo) {
        c.strokeStyle = halo;
        c.lineWidth = 5;
        c.lineJoin = 'round';
        c.strokeText(text, STAMP_PAD, h / 2);
      }
      c.fillStyle = fill;
      c.fillText(text, STAMP_PAD, h / 2);
      stamp = { canvas, w, h, tw };
      this.stamps.set(key, stamp);
    }
    const left = align === 'center' ? x - stamp.tw / 2 : align === 'end' || align === 'right' ? x - stamp.tw : x;
    ctx.drawImage(stamp.canvas, left - STAMP_PAD, y - stamp.h / 2, stamp.w, stamp.h);
  }
}

/** The point at `t` along a quadratic curve from `a` through control `c` to `b`. */
function along(a: Point, c: Point, b: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

/** Adds to `path` a curve from `a` to `b` through control `c`, drawn to fraction `t`. */
function curve(path: Path2D, a: Point, c: Point, b: Point, t: number) {
  if (t <= 0) return;
  path.moveTo(a.x, a.y);
  /* The first `t` of a quadratic curve is itself a quadratic curve. */
  const c1 = { x: lerp(a.x, c.x, t), y: lerp(a.y, c.y, t) };
  const end = { x: lerp(c1.x, lerp(c.x, b.x, t), t), y: lerp(c1.y, lerp(c.y, b.y, t), t) };
  path.quadraticCurveTo(c1.x, c1.y, end.x, end.y);
}

/** Adds to `path` the last `HEAD_PX` of a curve drawn to `t`: the bright head that draws a line. */
function head(path: Path2D, a: Point, c: Point, b: Point, t: number) {
  if (t <= 0) return;
  const len = (Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(b.x - c.x, b.y - c.y)) / 2;
  const from = Math.max(0, t - HEAD_PX / Math.max(1, len));
  const p0 = along(a, c, b, from);
  path.moveTo(p0.x, p0.y);
  for (let s = 1; s <= 3; s += 1) {
    const p = along(a, c, b, lerp(from, t, s / 3));
    path.lineTo(p.x, p.y);
  }
}

/** The control point that bows a line by `bow` of its length away from `hub`; none for a straight line. */
function bowed(a: Point, b: Point, bow: number, hub: Point): Point {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  if (bow <= 0) return { x: mx, y: my };
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  let ox = mx - hub.x;
  let oy = my - hub.y;
  if (Math.hypot(ox, oy) < 1) {
    ox = -(b.y - a.y);
    oy = b.x - a.x;
  }
  const n = Math.hypot(ox, oy) || 1;
  return { x: mx + (ox / n) * len * bow, y: my + (oy / n) * len * bow };
}

/** Strokes collected lines in one path per colour, alpha and width. */
class LineBatch {
  private buckets = new Map<string, { color: string; alpha: number; width: number; path: Path2D }>();
  add(color: string, alpha: number, width: number): Path2D {
    const a = Math.round(alpha * 100) / 100;
    const key = `${color}|${a}|${width}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { color, alpha: a, width, path: new Path2D() };
      this.buckets.set(key, bucket);
    }
    return bucket.path;
  }
  stroke(ctx: CanvasRenderingContext2D) {
    for (const { color, alpha, width, path } of this.buckets.values()) {
      if (alpha <= 0) continue;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke(path);
    }
    ctx.globalAlpha = 1;
  }
}

interface Sprites {
  indigo: HTMLCanvasElement;
  amber: HTMLCanvasElement;
}

/**
 * One frame of the film at film time `clock` (ms, running on through the hold) and wall clock
 * `time` (ms). Every place is a function of film time; only the floating files' slow drift reads
 * the wall clock.
 */
function drawFilm(
  ctx: CanvasRenderingContext2D,
  cast: FilmCast,
  L: Layout,
  palette: Palette,
  sprites: Sprites,
  clock: number,
  time: number,
) {
  const { w, h, wide } = L;
  const T = Math.min(clock, FILM_MS);
  ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const { scene, pick } = cast;
  const shot = cameraAt(L.keys, T / FILM_MS, CREEP);
  const before = cameraAt(L.keys, Math.max(0, T - STREAK_MS) / FILM_MS, CREEP);
  const toScreen = (p: Point, s: CameraShot = shot) => projectPoint(w, h, s, p.x, p.y);

  /* Act 2's fragment glides from its close-up places to the map in act 3. */
  const glide = easeInOut(span(T, AT.flights, 700));
  const worldOf = (i: number): Point => {
    const staged = L.staged.get(i);
    const m = L.map[i]!;
    return staged ? { x: lerp(staged.x, m.x, glide), y: lerp(staged.y, m.y, glide) } : m;
  };
  const markOf = (i: number) => {
    const staged = L.stagedMark.get(i);
    return staged === undefined ? L.mark[i]! : lerp(staged, L.mark[i]!, glide);
  };
  const titleLanded = (() => {
    const line = cast.lines.find((l) => l.role === 'title');
    return line ? line.to + HAIRLINE_MS : Infinity;
  })();

  /* Exposure: the map sits a little low while it assembles and comes fully up as it settles. */
  const expose = easeInOut(span(T, AT.expose, 270));
  const focus = easeInOut(span(T, AT.focus, AT.focused - AT.focus));
  /* Nothing is dimmed at the end: the opened concept stands out by its ink lines and halo alone. */
  const nodeLight = lerp(0.8, 1, expose);
  const lineLift = lerp(0.8, 1, expose);

  /* The key light: on the opened file, then its mark, then the project hub, then back to the subject. */
  const subjectScreen = (() => {
    if (!pick) return toScreen(L.centre);
    const card = L.field[pick.index]!;
    const onCard = toScreen(card);
    const onMark = toScreen(worldOf(pick.index));
    const move = easeInOut(span(T, ACT_START[1]!, 420));
    return { x: lerp(onCard.x, onMark.x, move), y: lerp(onCard.y, onMark.y, move) };
  })();
  const root = scene.nodes.findIndex((n) => n.depth === 0);
  const hubScreen = toScreen(root >= 0 ? L.map[root]! : L.centre);
  const toHub = easeInOut(span(T, AT.amber, 270)) * (1 - easeInOut(span(T, AT.focus, 400)));
  const lightAt = { x: lerp(subjectScreen.x, hubScreen.x, toHub), y: lerp(subjectScreen.y, hubScreen.y, toHub) };
  const lightUp = easeInOut(span(T, AT.rack, 330));
  const lightR = wide ? 230 : 150;
  drawKeyLight(ctx, sprites.indigo, lightAt.x, lightAt.y, lightR, 0.14 * lightUp * (1 - toHub));
  drawKeyLight(ctx, sprites.amber, lightAt.x, lightAt.y, lightR, 0.1 * lightUp * toHub);

  /* The ghost numeral counts the relations lit, behind the picture, and lands on the total. */
  const lit = (k: number) => {
    const edge = scene.edges[k]!;
    if (cast.fragmentEdges.has(k)) return T >= Math.max(L.land[edge.from]!, L.land[edge.to]!) + HAIRLINE_MS;
    const start = L.edgeStart[k]!;
    return start >= 0 && T >= start + STROKE_MS;
  };
  const ghostIn = AT.flights + 200;
  /*
   * Below the map's right side, well clear of its lowest marks and of the caption on the left; a
   * stage with no room under the map, or a phone's, where the map fills the picture, has none.
   */
  const baseline = L.zone.b + 150;
  if (wide && baseline <= L.h - 24 && T >= ghostIn && T < AT.expose + 400) {
    let count = 0;
    for (let k = 0; k < scene.edges.length; k += 1) if (lit(k)) count += 1;
    const a = 0.1 * easeInOut(span(T, ghostIn, 260)) * (1 - easeInOut(span(T, AT.expose, 400)));
    if (a > 0) {
      const size = 160;
      ctx.globalAlpha = a;
      ctx.fillStyle = palette.ink;
      ctx.font = `${FONT_WEIGHT.strong} ${size}px ${palette.sans}`;
      ctx.textAlign = 'end';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(count), L.zone.r, baseline);
      const numeral = ctx.measureText(String(scene.edges.length)).width;
      ctx.textAlign = 'start';
      ctx.globalAlpha = 1;
      drawHitRing(ctx, L.zone.r - numeral / 2, baseline - size * 0.36, T - AT.amber, palette.ink, {
        from: size * 0.42,
        reach: 40,
        life: 360,
      });
    }
  }

  drawField(ctx, cast, L, palette, shot, T, time);

  /* The map rolls a few degrees about the stage's centre while the camera pulls back. */
  const roll = rollAt(T);
  ctx.save();
  if (roll !== 0) {
    ctx.translate(w / 2, h / 2);
    ctx.rotate(roll);
    ctx.translate(-w / 2, -h / 2);
  }

  /* Halos under the marks that carry weight, growing as each lands. */
  ctx.globalCompositeOperation = 'lighter';
  const haloOf = (i: number, from: number) => {
    const grow = easeOut(span(T, from, HALO_MS));
    if (grow <= 0) return;
    const p = toScreen(worldOf(i));
    const r = markOf(i) * shot.zoom * HALO_SCALE * grow;
    const sprite = scene.nodes[i]!.kind === 'project' ? sprites.amber : sprites.indigo;
    drawHalo(ctx, sprite, p.x, p.y, r, HALO_ALPHA * nodeLight);
  };
  for (const i of cast.halos) haloOf(i, L.land[i]!);
  if (pick && !cast.halos.includes(pick.index)) haloOf(pick.index, AT.focus);

  /*
   * Relations carry light: one wide faint pass and a thin core, added together, so bundles brighten
   * where they meet a hub. Each draws behind a bright head and cools to its own alpha.
   */
  const glow = new LineBatch();
  const core = new LineBatch();
  const heads = new Path2D();
  let headsDrawn = false;
  const hubAt = toScreen(L.centre);
  const isLit = (k: number) => {
    const edge = scene.edges[k]!;
    return pick !== null && (edge.from === pick.index || edge.to === pick.index);
  };
  const geometry = (k: number, fromFirst: boolean) => {
    const edge = scene.edges[k]!;
    const near = fromFirst ? edge.from : edge.to;
    const far = near === edge.from ? edge.to : edge.from;
    const a = toScreen(worldOf(near));
    const b = toScreen(worldOf(far));
    const bow = crossesClusters(scene, edge) ? 0.18 : 0;
    return { a, b, near, control: bowed(a, b, bow, hubAt) };
  };
  scene.edges.forEach((edge, k) => {
    const fragmentEdge = cast.fragmentEdges.has(k);
    const start = fragmentEdge ? Math.max(L.land[edge.from]!, L.land[edge.to]!) : L.edgeStart[k]!;
    if (start < 0 || T < start) return;
    const strokeMs = fragmentEdge ? HAIRLINE_MS : STROKE_MS;
    const grow = fragmentEdge ? easeOut(span(T, start, strokeMs)) : easeInOut(span(T, start, strokeMs));
    if (grow <= 0) return;
    const { a, b, near, control: bow } = geometry(k, L.edgeFromFirst[k]!);
    let control = bow;
    const color = edge.contains ? palette.ink : palette.indigo;
    const heat = 1 - easeOut(span(T, start + strokeMs * 0.5, COOL_MS));
    const ownLit = isLit(k);
    let alpha: number;
    if (fragmentEdge) {
      /* In the close-up a dependency hangs off its concept like a branch of a file tree. */
      const elbow = edge.contains ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: near === pick!.index ? a.x : b.x, y: near === pick!.index ? b.y : a.y };
      control = { x: lerp(elbow.x, bow.x, glide), y: lerp(elbow.y, bow.y, glide) };
      alpha = lerp(0.85, edge.contains ? 0.26 : 0.34, glide);
    } else {
      alpha = (edge.contains ? 0.26 : 0.34) * lineLift;
    }
    alpha = lerp(alpha, 0.85, heat);
    curve(glow.add(color, 0.05 * lineLift, 4), a, control, b, grow);
    const keep = ownLit ? 1 - focus : 1;
    if (keep > 0) curve(core.add(color, alpha * keep, 1.25), a, control, b, grow);
    /* At the end the opened concept's relations turn to 2px ink. */
    if (ownLit && focus > 0) curve(core.add(palette.ink, 0.9 * focus, 2), a, control, b, grow);
    /* The head burns along the line and fades where it arrives. */
    const headLight = 1 - easeInOut(span(T, start + strokeMs, 90));
    if (headLight > 0) {
      head(heads, a, control, b, grow);
      headsDrawn = true;
    }
  });
  ctx.lineCap = 'round';
  glow.stroke(ctx);
  core.stroke(ctx);
  if (headsDrawn) {
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = palette.pale;
    ctx.lineWidth = 2;
    ctx.stroke(heads);
  }
  /* From the push-in through the hold, a pulse leaves the opened concept along each relation in turn. */
  if (pick && cast.litEdges.length > 0 && clock >= AT.focused) {
    const n = Math.floor((clock - AT.focused) / PULSE_EVERY_MS);
    const local = clock - AT.focused - n * PULSE_EVERY_MS;
    if (local < PULSE_MS) {
      const k = cast.litEdges[n % cast.litEdges.length]!;
      const fromPick = scene.edges[k]!.from === pick.index;
      const { a, b, control } = geometry(k, fromPick);
      const f = local / PULSE_MS;
      const pulse = new Path2D();
      head(pulse, a, control, b, easeInOut(f));
      ctx.globalAlpha = 0.95 * easeInOut(Math.min(f, 1 - f) / 0.15);
      ctx.strokeStyle = palette.pale;
      ctx.lineWidth = 2;
      ctx.stroke(pulse);
    }
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
  ctx.globalCompositeOperation = 'source-over';

  /* Files flying in from outside the frame, then resting as marks on the map. */
  const flyingAt = (i: number, s: CameraShot, t: number): Point | null => {
    const start = L.flightStart[i]!;
    const f = clamp01((t - start) / FLIGHT_MS);
    if (start < 0 || t < start) return null;
    /* Fast in from outside the frame, settling onto its place. */
    const e = easeOut(f);
    const from = L.flightFrom[i]!;
    const to = toScreen(L.map[i]!, s);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const arc = Math.sin(Math.PI * e) * len * 0.08 * (scene.nodes[i]!.seed < 0.5 ? -1 : 1);
    return { x: lerp(from.x, to.x, e) - (dy / len) * arc, y: lerp(from.y, to.y, e) + (dx / len) * arc };
  };
  const dots = new Map<string, Path2D>();
  const dot = (color: string, alpha: number, p: Point, r: number) => {
    const key = `${color}|${Math.round(alpha * 50) / 50}`;
    let path = dots.get(key);
    if (!path) dots.set(key, (path = new Path2D()));
    path.moveTo(p.x + r, p.y);
    path.arc(p.x, p.y, r, 0, Math.PI * 2);
  };
  const rings: { p: Point; age: number; color: string; r: number }[] = [];
  scene.nodes.forEach((node, i) => {
    if (cast.fragment.has(i)) return;
    const p = flyingAt(i, shot, T);
    if (!p) return;
    const tone = node.kind === 'project' ? palette.amber : palette.indigo;
    const r = L.mark[i]! * shot.zoom;
    const f = clamp01((T - L.flightStart[i]!) / FLIGHT_MS);
    const alpha = nodeLight * easeOut(f / 0.2);
    if (f < 1) {
      const prev = flyingAt(i, before, T - STREAK_MS) ?? L.flightFrom[i]!;
      drawStreak(ctx, prev, p, tone, 0.35 * easeOut(f / 0.2));
    }
    dot(tone, alpha, p, r);
    const beat = cast.beatHubs.indexOf(i);
    if (beat >= 0) rings.push({ p, age: T - AT.beats[beat]!, color: tone, r });
  });

  /* The fragment: the opened concept, its domain and its dependencies, landing one by one. */
  if (pick) {
    for (const i of cast.fragment) {
      const land = L.land[i]!;
      const enter = easeOut(span(T, land - 60, 150));
      if (enter <= 0) continue;
      const p = toScreen(worldOf(i));
      const node = scene.nodes[i]!;
      const r = markOf(i) * shot.zoom * lerp(0.6, 1, enter);
      dot(node.kind === 'project' ? palette.amber : palette.indigo, enter * lerp(1, nodeLight, glide), p, r);
      rings.push({ p, age: T - land, color: palette.indigo, r });
      if (i === pick.index) rings.push({ p, age: T - titleLanded, color: palette.indigo, r });
    }
  }
  for (const [key, path] of dots) {
    const [color, alpha] = key.split('|');
    ctx.globalAlpha = Number(alpha);
    ctx.fillStyle = color!;
    ctx.fill(path);
  }
  ctx.globalAlpha = 1;
  for (const ring of rings) drawHitRing(ctx, ring.p.x, ring.p.y, ring.age, ring.color, { from: ring.r });

  /* The fragment's names beside the close-up ride the roll with their marks. */
  ctx.textBaseline = 'middle';
  if (pick && T >= AT.landings[0]! && T < AT.flights + 300) {
    const size = wide ? 18 : 13;
    const look = { font: `${FONT_WEIGHT.strong} ${size}px ${palette.sans}`, size, fill: palette.ink, halo: palette.ground };
    const leave = 1 - easeInOut(span(T, AT.fold, 200));
    const nameAt = (i: number, text: string, light: number) => {
      if (light <= 0) return;
      const p = toScreen(worldOf(i));
      const r = markOf(i) * shot.zoom;
      ctx.globalAlpha = light;
      const rise = (1 - light) * LABEL_RISE;
      if (wide) {
        L.stamps.draw(ctx, text, p.x + r + 12, p.y + rise, look);
      } else {
        /* On a phone the domain's name sits above its mark and the concept's below, so the two never meet. */
        const side = i === pick.parent ? -1 : 1;
        L.stamps.draw(ctx, text, p.x, p.y + side * (r + 6 + size / 2) + rise, { ...look, align: 'center' });
      }
    };
    const nameIn = (i: number) => easeOut(span(T, L.land[i]!, LABEL_MS)) * leave;
    nameAt(pick.parent, scene.nodes[pick.parent]!.label, nameIn(pick.parent));
    if (wide) pick.dependencies.forEach((dep) => nameAt(dep, scene.nodes[dep]!.label, nameIn(dep)));
    const titled = easeInOut(span(T, titleLanded, LABEL_MS));
    nameAt(pick.index, cast.slug, nameIn(pick.index) * (1 - titled));
    nameAt(pick.index, scene.nodes[pick.index]!.label, nameIn(pick.index) * titled);
  }
  ctx.restore();

  if (pick) drawPanel(ctx, cast, L, palette, shot, T, time, toScreen(worldOf(pick.index)), markOf(pick.index) * shot.zoom);

  /* Names on the finished map: the regions with how much each holds, then the opened concept's crowd. */
  ctx.textBaseline = 'middle';
  if (T >= AT.expose) {
    /* A name rides the camera at its anchor; one that stands off its mark is joined to it by a leader. */
    const nameAt = (i: number, size: number, light: number, rise: number, count = '') => {
      const spot = L.names.get(i);
      if (!spot || light <= 0) return;
      const a = toScreen({ x: spot.ax, y: spot.ay });
      if (spot.leader) {
        const node = toScreen(L.map[i]!);
        const box = labelBox(a.x, a.y, spot.w, spot.h, spot.align);
        const q = { x: Math.min(box.r, Math.max(box.l, node.x)), y: Math.min(box.b, Math.max(box.t, node.y)) };
        const len = Math.hypot(q.x - node.x, q.y - node.y) || 1;
        const ux = (q.x - node.x) / len;
        const uy = (q.y - node.y) / len;
        const from = L.mark[i]! * shot.zoom + 3;
        if (len > from + 6) {
          ctx.globalAlpha = light * 0.5;
          ctx.strokeStyle = palette.ink;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(node.x + ux * from, node.y + uy * from);
          ctx.lineTo(q.x - ux * 3, q.y - uy * 3);
          ctx.stroke();
        }
      }
      const top = a.y - spot.h / 2 + rise;
      const nameY = count ? top + (size * 1.25) / 2 : a.y + rise;
      ctx.globalAlpha = light;
      L.stamps.draw(ctx, scene.nodes[i]!.label, a.x, nameY, {
        font: `${FONT_WEIGHT.strong} ${size}px ${palette.sans}`,
        size,
        fill: palette.ink,
        halo: palette.ground,
        align: spot.align,
      });
      if (count) {
        L.stamps.draw(ctx, count, a.x, top + size * 1.25 + (L.countSize * 1.35) / 2, {
          font: `${L.countSize}px ${palette.mono}`,
          size: L.countSize,
          fill: palette.secondary,
          halo: palette.ground,
          align: spot.align,
        });
      }
    };
    cast.regions.forEach((i, k) => {
      const enter = easeOut(span(T, AT.expose + 70 + k * 80, LABEL_MS));
      nameAt(i, L.regionSize, enter, (1 - enter) * LABEL_RISE, cast.regionCounts.get(i));
    });
    /* The closing names come in quickly and in place, so none lingers half-lit beside another. */
    const named = easeOut(span(T, AT.focus, 270));
    if (named > 0) L.focusNames.forEach((i) => nameAt(i, L.focusSize, named, 0));
  }
  ctx.textAlign = 'start';
  ctx.globalAlpha = 1;
}

/** Act 1's floating files on three depths; they fall back in act 2 and are gone before the flight. */
function drawField(
  ctx: CanvasRenderingContext2D,
  cast: FilmCast,
  L: Layout,
  palette: Palette,
  shot: CameraShot,
  T: number,
  time: number,
) {
  const recede = lerp(1, 0.07, easeInOut(span(T, AT.open, 330))) * (1 - easeInOut(span(T, AT.landings[0]! + 130, 400)));
  if (recede <= 0) return;
  const rack = easeInOut(span(T, AT.rack, 270));
  const { w, h } = L;
  ctx.textBaseline = 'middle';
  for (const layer of [0, 1, 2] as const) {
    const back = layer < 2 ? rack : 0;
    const s = depthShot(shot, DEPTH[layer]!, w, h);
    s.zoom *= lerp(1, 0.96, back);
    /* Rack focus: the far and mid files fall back; the near ones step down a little beside the lit one. */
    const tone = recede * lerp(1, [0.25, 0.45, 0.8][layer]!, rack) * LAYER_TONE[layer]!;
    const amp = DRIFT_PX[layer]! * (L.wide ? 1 : 0.7);
    const drop = (item: FieldItem, i: number) => {
      const node = cast.scene.nodes[i]!;
      const enter = easeOut(span(T, AT.layers[layer]! + item.col * STAGGER_MS, ENTER_MS));
      const drift = amp * Math.sin((time / DRIFT_MS[layer]!) * Math.PI * 2 + node.seed * Math.PI * 2);
      return { enter, drift };
    };
    /* The blank slips are drawn in stage space under the layer's camera, as the kit applies it. */
    applyCamera(ctx, L.dpr, w, h, { ...shot, zoom: (s.zoom - 1) / DEPTH[layer]! + 1 }, DEPTH[layer]!);
    ctx.fillStyle = palette.edge;
    L.field.forEach((item, i) => {
      if (item.layer !== layer || item.named) return;
      const { enter, drift } = drop(item, i);
      if (enter <= 0) return;
      ctx.globalAlpha = tone * enter * 0.55;
      ctx.beginPath();
      ctx.roundRect(item.x - item.w / 2, item.y + drift + ((1 - enter) * DROP_PX) / s.zoom - item.h / 2, item.w, item.h, 2);
      ctx.fill();
    });
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    /* The named files are placed by the same camera but keep their 15px names at full size. */
    L.field.forEach((item, i) => {
      if (item.layer !== layer || !item.named || i === cast.pick?.index) return;
      const node = cast.scene.nodes[i]!;
      const { enter, drift } = drop(item, i);
      if (enter <= 0) return;
      const p = projectPoint(w, h, s, item.x, item.y + drift);
      const y = p.y + (1 - enter) * DROP_PX;
      const bw = item.w * s.zoom;
      const bh = item.h * s.zoom;
      ctx.beginPath();
      ctx.roundRect(p.x - bw / 2, y - bh / 2, bw, bh, 8);
      /* A file the camera carries past the stage's edge fades as it goes, so no name is cut mid-word. */
      const inside = Math.min(p.x - bw / 2, w - p.x - bw / 2);
      const edge = clamp01((inside + bw * 0.3) / (bw * 0.6));
      if (edge <= 0) return;
      /* A file is opaque, so nothing behind it shows through. */
      ctx.globalAlpha = tone * enter * edge;
      ctx.fillStyle = palette.ground;
      ctx.fill();
      ctx.fillStyle = palette.card;
      ctx.fill();
      ctx.strokeStyle = palette.edge;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = node.kind === 'project' ? palette.amber : palette.indigo;
      ctx.beginPath();
      ctx.arc(p.x - bw / 2 + 15, y, 3, 0, Math.PI * 2);
      ctx.fill();
      L.stamps.draw(ctx, node.file, p.x - bw / 2 + 27, y + 1, { font: `${L.text}px ${palette.mono}`, size: L.text, fill: palette.ink });
    });
  }
  ctx.globalAlpha = 1;
}

/**
 * The opened file: one of the near cards in act 1; as act 1 ends it grows into the panel and its
 * frontmatter types itself, each finished line shooting a hairline to the mark it became; as act
 * 2 ends it folds back into that mark.
 */
function drawPanel(
  ctx: CanvasRenderingContext2D,
  cast: FilmCast,
  L: Layout,
  palette: Palette,
  shot: CameraShot,
  T: number,
  time: number,
  selfAt: Point,
  selfR: number,
) {
  const { scene, pick, lines } = cast;
  if (!pick) return;
  /* The fold: the panel closes up to its title bar, then the bar draws into the mark. */
  const shut = easeInOut(span(T, AT.fold, 140));
  const fold = easeInOut(span(T, AT.fold + 120, 160));
  if (fold >= 1) return;
  const node = scene.nodes[pick.index]!;
  const card = L.field[pick.index]!;
  const P = L.panel;
  const open = easeInOut(span(T, AT.open, OPEN_MS));
  const enter = easeOut(span(T, AT.layers[2]! + card.col * STAGGER_MS, ENTER_MS));
  if (enter <= 0) return;
  const drift = DRIFT_PX[2]! * (L.wide ? 1 : 0.7) * Math.sin((time / DRIFT_MS[2]!) * Math.PI * 2 + node.seed * Math.PI * 2);
  const c = projectPoint(L.w, L.h, shot, card.x, card.y + drift * (1 - open));
  const cw = card.w * shot.zoom;
  const ch = card.h * shot.zoom;
  let x = lerp(c.x - cw / 2, P.x, open);
  let y = lerp(c.y - ch / 2 + (1 - enter) * DROP_PX, P.y, open);
  let bw = lerp(cw, P.w, open);
  let bh = lerp(lerp(ch, P.h, open), P.barH, shut);
  let corner = lerp(8, 12, open);
  if (fold > 0) {
    x = lerp(x, selfAt.x - selfR, fold);
    y = lerp(y, selfAt.y - selfR, fold);
    bw = lerp(bw, selfR * 2, fold);
    bh = lerp(bh, selfR * 2, fold);
    corner = lerp(corner, selfR, fold);
  }
  const light = enter * (1 - clamp01((fold - 0.7) / 0.3));
  if (light <= 0) return;

  ctx.globalAlpha = light;
  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh, Math.min(corner, bw / 2, bh / 2));
  ctx.fillStyle = palette.ground;
  ctx.fill();
  ctx.fillStyle = palette.card;
  ctx.fill();
  /* Lit by the key light, the opened file's edge takes the mark's colour before it opens. */
  const lit = easeInOut(span(T, AT.rack, 330)) * (1 - open);
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 1;
  ctx.stroke();
  if (lit > 0) {
    ctx.globalAlpha = light * lit * 0.8;
    ctx.strokeStyle = palette.indigo;
    ctx.stroke();
  }
  /* Folding, the bar takes its mark's colour as it closes on it. */
  if (fold > 0) {
    ctx.globalAlpha = light * fold;
    ctx.fillStyle = palette.indigo;
    ctx.fill();
  }

  /* The lines leave as the panel closes; the title bar's name leaves as the bar draws in. */
  const chrome = light * (1 - clamp01(fold / 0.4));
  if (chrome <= 0) return;
  /* The title row: the kind dot and the file name, moving from the card's row to the panel's bar. */
  const rowY = lerp(y + bh / 2, y + Math.min(bh, P.barH) / 2, open);
  ctx.globalAlpha = chrome;
  ctx.fillStyle = palette.indigo;
  ctx.beginPath();
  ctx.arc(x + lerp(15, P.padX, open), rowY, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `${L.text}px ${palette.mono}`;
  ctx.textBaseline = 'middle';
  const nameX = x + lerp(27, P.padX + 14, open);
  const nameFont = `${L.text}px ${palette.mono}`;
  ctx.globalAlpha = chrome * (1 - open);
  L.stamps.draw(ctx, node.file, nameX, rowY + 1, { font: nameFont, size: L.text, fill: palette.ink });
  ctx.globalAlpha = chrome * open;
  L.stamps.draw(ctx, node.file, nameX, rowY + 1, { font: nameFont, size: L.text, fill: palette.secondary });
  if (open <= 0) return;
  /* The bar's rule comes in once the name has risen into the bar. */
  ctx.globalAlpha = chrome * clamp01((open - 0.6) / 0.4) * 0.8 * (1 - shut);
  ctx.fillStyle = palette.edge;
  ctx.fillRect(x, y + P.barH, bw, 1);

  const textLight = chrome * (1 - clamp01(shut / 0.6)) * clamp01((open - 0.8) / 0.2);
  if (textLight <= 0) return;
  /* While the panel closes, its lines stay inside it. */
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y + P.barH, bw, Math.max(0, bh - P.barH));
  ctx.clip();
  const top = y + P.barH + P.padY;
  ctx.font = `${P.font}px ${palette.mono}`;
  let caret: Point | null = null;
  const traces: { start: Point; end: Point; lit: number; trace: number }[] = [];
  lines.forEach((line, row) => {
    const typed = span(T, line.from, Math.max(1, line.to - line.from));
    if (typed <= 0 && line.from > T) return;
    const ly = top + row * P.lineH + P.lineH / 2;
    const full = (line.key ? `${line.key}: ` : '') + line.value;
    let budget = Math.floor(typed * full.length);
    let lx = x + P.padX;
    const lit = line.role ? easeOut(span(T, line.to, HAIRLINE_MS)) : 0;
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
    };
    if (line.key) {
      write(line.key, palette.dim, lit);
      write(': ', palette.dim);
    }
    write(line.value, line.key || line.dep !== undefined ? palette.ink : palette.dim);
    if (T >= line.from) caret = { x: lx, y: ly };

    /* The hairline from the finished line to its mark; none on a phone, where it would cross the file. */
    const trace = textLight * (1 - clamp01(shut / 0.3)) * 0.6 * (1 - easeInOut(span(T, line.to + 870, 270)));
    if (!L.wide || lit <= 0 || trace <= 0) return;
    const target = hairlineTarget(cast, line, L, shot);
    if (!target) return;
    traces.push({ start: { x: lx + 12, y: ly }, end: { x: target.x - 14 - (target.r ?? 0), y: target.y }, lit, trace });
  });
  const last = lines[lines.length - 1];
  if (caret && last && T < last.to + 140) {
    const at = caret as Point;
    ctx.globalAlpha = textLight * (0.55 + 0.45 * Math.sin(T / 120));
    ctx.fillStyle = palette.indigo;
    ctx.fillRect(at.x + 2, at.y - P.font * 0.6, 2, P.font * 1.2);
  }
  ctx.restore();
  /* Each hairline shoots from its line's end along a curve to the mark that line became. */
  ctx.strokeStyle = palette.indigo;
  ctx.lineWidth = 1;
  for (const { start, end, lit, trace } of traces) {
    const path = new Path2D();
    curve(path, start, { x: lerp(start.x, end.x, 0.55), y: start.y }, end, lit);
    ctx.globalAlpha = trace;
    ctx.stroke(path);
  }
  ctx.globalAlpha = 1;
}

/** Where a frontmatter line's hairline ends: just short of the mark it became, on screen. */
function hairlineTarget(cast: FilmCast, line: FrontmatterLine, L: Layout, shot: CameraShot): (Point & { r?: number }) | null {
  const { pick } = cast;
  if (!pick) return null;
  const i =
    line.role === 'domain'
      ? pick.parent
      : line.role === 'kind' || line.role === 'title'
        ? pick.index
        : line.dep === undefined
          ? undefined
          : pick.dependencies[line.dep];
  if (i === undefined) return null;
  const stage = L.staged.get(i);
  if (!stage) return null;
  const p = projectPoint(L.w, L.h, shot, stage.x, stage.y);
  return { ...p, r: (L.stagedMark.get(i) ?? 0) * shot.zoom };
}

/** A caption's headline and body light at film time `T`: in with a rise, out before the next act. */
function captionLight(act: number, T: number): { head: number; body: number; out: number } {
  const start = ACT_START[act - 1]!;
  const end = start + ACT_MS[act - 1]!;
  const out = act === ACT_MS.length ? 0 : easeInOut(span(T, end - 120, 120));
  const head = T < start ? 0 : easeOut(span(T, start, 160));
  const body = T < start ? 0 : easeOut(span(T, start + 40, 160));
  return { head, body, out };
}

/** Frontmatter lines and when each types: a line that becomes a mark ends on its landing beat. */
function frontmatter(scene: FilmScene, pick: FilmCloseUp, locale: string, slugOf: (i: number) => string): FrontmatterLine[] {
  const node = scene.nodes[pick.index]!;
  const rows: Omit<FrontmatterLine, 'from' | 'to'>[] = [
    { key: null, value: '---', role: null },
    { key: 'domain', value: slugOf(pick.parent), role: 'domain' },
    { key: 'kind', value: node.kind, role: 'kind' },
    { key: locale === 'en' ? 'title' : `display_${locale}`, value: node.label, role: 'title' },
    { key: 'dependencies', value: '', role: null },
    ...pick.dependencies.map((dep, k) => ({ key: null, value: `  - ${slugOf(dep)}`, role: 'dependency' as const, dep: k })),
    { key: null, value: '---', role: null },
  ];
  const times = scheduleTyping(rows, AT.landings, AT.open + OPEN_MS, TYPE_MS);
  return rows.map((row, k) => ({ ...row, ...times[k]! }));
}

/**
 * The page's film: once its stage is in view it plays by itself, act after act, as the
 * repository's real concepts go from Markdown files to the map, then rests and plays again.
 * Without a script or under reduced motion the finished map is one still frame and the four
 * acts are a list.
 */
export function FilmSection({ graph }: { graph: StageGraph }) {
  const t = useTranslations('download.film');
  const scene = useMemo(() => buildFilmScene(graph), [graph]);
  const locale = useLocale();
  const closeUp = useMemo(() => pickCloseUp(scene), [scene]);
  const cast = useMemo<FilmCast>(() => {
    const slugOf = (i: number) => scene.nodes[i]!.id.split(':').pop() ?? scene.nodes[i]!.id;
    const neighbours = new Set<number>();
    const fragmentEdges = new Set<number>();
    const fragment = new Set<number>();
    const litEdges: number[] = [];
    if (closeUp) {
      fragment.add(closeUp.index);
      fragment.add(closeUp.parent);
      closeUp.dependencies.forEach((dep) => fragment.add(dep));
      neighbours.add(closeUp.index);
      scene.edges.forEach((edge, k) => {
        if (edge.from === closeUp.index) neighbours.add(edge.to);
        if (edge.to === closeUp.index) neighbours.add(edge.from);
        if ((edge.from === closeUp.index || edge.to === closeUp.index) && edge.from !== edge.to) litEdges.push(k);
        const holds = edge.contains && edge.from === closeUp.parent && edge.to === closeUp.index;
        const relies = !edge.contains && edge.from === closeUp.index && closeUp.dependencies.includes(edge.to);
        if (holds || relies) fragmentEdges.add(k);
      });
      /* The closing pulses go round the opened concept clockwise, starting from the top. */
      const angleOf = (k: number) => {
        const edge = scene.edges[k]!;
        const other = scene.nodes[edge.from === closeUp.index ? edge.to : edge.from]!;
        const self = scene.nodes[closeUp.index]!;
        return (Math.atan2(other.y - self.y, other.x - self.x) + Math.PI * 2.5) % (Math.PI * 2);
      };
      litEdges.sort((a, b) => angleOf(a) - angleOf(b) || a - b);
    }
    const root = scene.nodes.findIndex((node) => node.depth === 0);
    /* The project and its largest clusters: five names on the finished map. */
    const ring = scene.nodes
      .map((node, i) => ({ node, i }))
      .filter(({ node }) => node.depth === 1)
      .sort((a, b) => b.node.degree - a.node.degree || a.node.id.localeCompare(b.node.id))
      .map(({ i }) => i);
    const regions = (root < 0 ? ring : [root, ...ring]).slice(0, 5);
    const regionCounts = new Map<number, string>();
    regions.forEach((i) => {
      const count = i === root ? scene.nodes.length : scene.nodes.filter((node) => node.cluster === i).length;
      regionCounts.set(i, t('regionCount', { count }));
    });
    const beatHubs = regions.filter((i) => !fragment.has(i)).slice(0, AT.beats.length);
    /* Names in the closing push-in: the opened file's concept and the dependencies it typed. */
    const focusNames = closeUp ? [closeUp.index, ...closeUp.dependencies].filter((i) => !regions.includes(i)) : [];
    return {
      scene,
      pick: closeUp,
      lines: closeUp ? frontmatter(scene, closeUp, locale, slugOf) : [],
      slug: closeUp ? slugOf(closeUp.index) : '',
      regions,
      regionCounts,
      beatHubs,
      neighbours,
      litEdges,
      focusNames,
      fragmentEdges,
      fragment,
      halos: haloMarks(scene),
    };
  }, [scene, closeUp, locale, t]);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const column = useRef<HTMLHeadingElement>(null);
  const captions = useRef<(HTMLLIElement | null)[]>([]);
  const heads = useRef<(HTMLHeadingElement | null)[]>([]);
  const bodies = useRef<(HTMLParagraphElement | null)[]>([]);
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
    const sprites = { indigo: lightSprite(palette.indigo), amber: lightSprite(palette.amber) };
    let layout: Layout | null = null;
    let stopWarm = () => {};
    /* Film time in ms; it runs on past the last act through the hold. */
    let shown = film ? 0 : STILL_MS;
    let clock = 0;
    let veil = 1;
    const time = createFilmClock(ACT_SPANS, ACT_MS, { holdMs: HOLD_MS, fadeMs: FADE_MS });

    const paint = () => {
      if (!layout) return;
      const T = Math.min(shown, FILM_MS);
      drawFilm(ctx, cast, layout, palette, sprites, shown, clock);
      if (!film) return;
      const light = isMotionPaused() ? 1 : time.fade() * veil;
      el.style.opacity = String(light);
      captions.current.forEach((caption, i) => {
        const head = heads.current[i];
        const body = bodies.current[i];
        if (!caption || !head) return;
        const lit = captionLight(i + 1, T);
        const fade = (1 - lit.out) * light;
        head.style.opacity = String(lit.head * fade);
        head.style.transform = `translateY(${(1 - lit.head) * 12}px)`;
        if (body) {
          body.style.opacity = String(lit.body * fade);
          body.style.transform = `translateY(${(1 - lit.body) * 12}px)`;
        }
        caption.style.visibility = Math.max(lit.head, lit.body) * fade > 0.01 ? 'visible' : 'hidden';
      });
      const act = time.act();
      fills.current.forEach((fill, i) => {
        if (!fill) return;
        fill.style.transform = `scaleX(${i < act ? 1 : i > act ? 0 : clamp01((T - ACT_START[i]!) / ACT_MS[i]!)})`;
      });
    };
    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      /* The backing store stays under six million pixels, so a large screen draws as fast as a laptop. */
      const dpr = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(6e6 / Math.max(1, w * h)));
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const box = el.getBoundingClientRect();
      const col = column.current?.getBoundingClientRect();
      const lane = col && col.width > 0 ? { left: col.left - box.left, width: col.width } : { left: 24, width: w - 48 };
      layout = layoutFilm(ctx, cast, palette, w, h, dpr, lane, film);
      stopWarm();
      if (film) {
        const warmed = layout;
        stopWarm = warmFilm((scratch, T) => drawFilm(scratch, cast, warmed, palette, sprites, T, 0));
      }
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
        time.advance(dtMs);
        shown = time.elapsed();
        veil = Math.min(1, veil + dtMs / 300);
        paint();
      },
      undefined,
      { keepAwake: true },
    );
    /* Paused, a still frame lands well inside its act, where its picture and caption are whole. */
    const settle = (act: number) => {
      time.advance(ACT_MS[act]! * SETTLE[act]!);
      return time.elapsed();
    };
    seek.current = (act) => {
      time.seek(act);
      const paused = isMotionPaused();
      shown = paused ? settle(act) : time.elapsed();
      /* A jump fades in from dark instead of cutting; paused, it shows the act at once. */
      veil = paused ? 1 : 0;
      paint();
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
      observer.disconnect();
      stopWarm();
      unregister();
      offPause();
      seek.current = () => {};
    };
  }, [film, scene, cast]);

  const counts = { concepts: graph.nodes.length, relations: graph.edges.length };
  const lastAct = ACTS[ACTS.length - 1];

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
          <>
            {/* The camera's push-ins carry the map past the picture's edges: it fades under the title and the caption. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-t from-transparent to-[color:var(--color-canvas)]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[22%] bg-gradient-to-b from-transparent to-[color:var(--color-canvas)]"
            />
          </>
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
              {/* While it plays each act shows its headline; the last also shows the map's two counts. */}
              <ol className="grid w-full">
                {ACTS.map((act, i) => (
                  <li
                    key={act}
                    ref={(node) => {
                      captions.current[i] = node;
                    }}
                    className="invisible flex max-w-[40rem] flex-col self-end [grid-area:1/1]"
                  >
                    <h3
                      ref={(node) => {
                        heads.current[i] = node;
                      }}
                      className="[text-wrap:balance] text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)] opacity-0 sm:text-hero-lg"
                    >
                      {t(`acts.${act}.title`)}
                    </h3>
                    {act === lastAct ? (
                      <p
                        ref={(node) => {
                          bodies.current[i] = node;
                        }}
                        className="mt-3 max-w-[30rem] text-title leading-title text-[color:var(--color-text-secondary)] opacity-0"
                      >
                        {t(`acts.${lastAct}.caption`, counts)}
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
                className="pointer-events-auto mt-6"
              />
            </div>
          </div>
        ) : null}
      </div>
      {film ? null : (
        <div className={PAGE_GUTTER}>
          <ol className={cn(PAGE_COLUMN, 'mt-8 grid gap-6 @container sm:grid-cols-2 lg:grid-cols-4')}>
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
