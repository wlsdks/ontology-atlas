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
  pickCloseUp,
  pickNamedFiles,
  scheduleTyping,
  type FilmCloseUp,
  type FilmScene,
} from '../lib/film-scene';
import {
  applyCamera,
  cameraAt,
  clamp01,
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

const ACTS = [1, 2, 3, 4, 5] as const;
/** How long each act plays: the files, one file opened, the flight, the lines, the map. */
const ACT_MS = [2600, 4200, 2600, 2800, 3400];
const FILM_MS = ACT_MS.reduce((a, b) => a + b, 0);
const ACT_START = ACT_MS.map((_, i) => ACT_MS.slice(0, i).reduce((a, b) => a + b, 0));
/** Each act's span of the choreography, in proportion to its time, so progress maps to one film clock. */
const ACT_SPANS = ACT_MS.map((ms, i) => [ACT_START[i]! / FILM_MS, (ACT_START[i]! + ms) / FILM_MS] as const);

/** Beats of the film, in milliseconds from its start. */
const AT = {
  /** Far, mid and near layers of files drop in on three beats. */
  layers: [0, 150, 300],
  /** The far and mid layers fall back and the key light lands on the opened file. */
  rack: 1400,
  /** The opened file's card becomes the file panel. */
  open: 2200,
  /** When each frontmatter line that becomes a mark is typed to its end. */
  landings: [3000, 3400, 3800, 4300, 4650, 5000],
  /** The fragment owns the frame at its closest. */
  close: 6000,
  /** The panel folds back into its mark and the camera pulls back. */
  fold: 6400,
  /** The other files fly in from outside the frame. */
  flights: 6800,
  /** The four cluster hubs land. */
  beats: [7400, 7800, 8200, 8600],
  /** The camera reaches the whole map. */
  whole: 8600,
  /** Relations radiate out from the opened concept. */
  radiate: 9400,
  radiateMs: 1900,
  /** The project hub takes the key light. */
  amber: 11300,
  /** The map comes up to full exposure and its regions are named. */
  expose: 12200,
  /** The camera pushes in on the opened concept and its neighbours. */
  focus: 13400,
  focused: 14600,
} as const;
/** Where a still frame of the finished map is taken: regions named, nothing dimmed. */
const STILL_MS = 13300;

const ENTER_MS = 360;
const DROP_PX = 24;
const STAGGER_MS = 30;
const OPEN_MS = 440;
const TYPE_MS = 380;
const HAIRLINE_MS = 220;
const LABEL_MS = 240;
const LABEL_RISE = 12;
const FLIGHT_MS = 700;
const STROKE_MS = 260;
const STREAK_MS = 48;
/** The camera's slow push: 2% per act, so no frame is ever quite still. */
const CREEP = 0.1;

/** Three depth layers of the floating files: parallax, size, tone, drift. */
const DEPTH = [0.4, 0.7, 1];
const LAYER_SCALE = [0.6, 0.8, 1];
const LAYER_TONE = [0.5, 0.75, 1];
const DRIFT_PX = [6, 10, 16];
const DRIFT_MS = [7000, 8000, 9000];
/** Grid cells of the twelve named files, so the opened file sits in the second row. */
const CARD_CELLS = [5, 0, 10, 3, 6, 9, 1, 11, 4, 8, 2, 7];

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
interface FieldItem extends Box {
  layer: 0 | 1 | 2;
  named: boolean;
  /** Its column across the stage, for the left-to-right drop-in. */
  col: number;
}
interface NameSpot {
  dx: number;
  dy: number;
  align: CanvasTextAlign;
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
  /** When each relation starts to draw in act 4; -1 for those the fragment already drew. */
  edgeStart: number[];
  /** Whether a relation draws from its `from` end (the end nearer the opened concept). */
  edgeFromNear: boolean[];
  /** When each file's flight starts in act 3; -1 for the fragment. */
  flightStart: number[];
  /** Where each flying file enters from, a screen point outside the frame. */
  flightFrom: Point[];
  names: Map<number, NameSpot>;
}

function markRadius(kind: string, wide: boolean): number {
  const r = kind === 'project' ? 7 : kind === 'domain' ? 5.5 : kind === 'capability' ? 3.6 : 2.6;
  return wide ? r : r * 0.85;
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

interface FilmCast {
  scene: FilmScene;
  pick: FilmCloseUp | null;
  lines: readonly FrontmatterLine[];
  /** The opened file's name for its concept before its title line is typed. */
  slug: string;
  /** The project and the cluster hubs, named on the finished map. */
  regions: number[];
  /** Hubs that land on the act-3 beats, in beat order. */
  beatHubs: number[];
  /** The opened concept's own relations, which stay lit at the end. */
  neighbours: ReadonlySet<number>;
  /** Names shown in the closing push-in besides the regions. */
  focusNames: number[];
  /** Relations the opened file drew in its close-up, which never leave the stage. */
  fragmentEdges: ReadonlySet<number>;
  fragment: ReadonlySet<number>;
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

  /* Twelve files keep their names (six on a phone); the rest are blank slips on three depths. */
  ctx.font = `${text}px ${palette.mono}`;
  const cols = wide ? 4 : 1;
  const rows = wide ? 3 : 6;
  const cellW = zoneW / cols;
  /* The camera pushes in on the files, so they start a little inside the picture's top and bottom. */
  const fieldT = zone.t + zoneH * 0.06;
  const cellH = (zoneH * 0.9) / rows;
  const cardMax = wide ? cellW - 16 : Math.min(260, zoneW - 48);
  const cardH = wide ? 52 : 40;
  const fits = (file: string) => ctx.measureText(file).width + 60 <= cardMax;
  const named = pickNamedFiles(scene, pick?.index ?? null, cols * rows, fits);
  const namedAt = new Map(named.map((i, k) => [i, k]));
  const cards: Box[] = named.map((i, k) => {
    const node = scene.nodes[i]!;
    const cardW = Math.min(cardMax, ctx.measureText(node.file).width + 60);
    const jx = node.seed * 2 - 1;
    const jy = node.gy * 2 - 1;
    if (wide) {
      const cell = CARD_CELLS[k] ?? k;
      return {
        x: zone.l + ((cell % cols) + 0.5) * cellW + jx * ((cellW - cardW) / 2) * 0.9,
        y: fieldT + (Math.floor(cell / cols) + 0.5) * cellH + jy * ((cellH - cardH) / 2) * 0.7,
        w: cardW,
        h: cardH,
      };
    }
    /* One column on a phone, each file stepping left and right of the one above. */
    const room = zoneW - cardW;
    const across = k % 2 === 0 ? 0.08 + 0.22 * node.seed : 0.7 + 0.22 * node.seed;
    return { x: zone.l + cardW / 2 + room * across, y: fieldT + (k + 0.5) * cellH, w: cardW, h: cardH };
  });

  const slab = wide ? { w: 28, h: 8 } : { w: 22, h: 6 };
  const field: FieldItem[] = scene.nodes.map((node, i) => {
    const k = namedAt.get(i);
    if (k !== undefined) {
      const card = cards[k]!;
      return { ...card, layer: 2, named: true, col: Math.floor(((card.x - zone.l) / zoneW) * 12) };
    }
    const layer = node.layer;
    let x = zone.l + node.gx * zoneW;
    let y = zone.t + node.gy * zoneH;
    /* A near slip never sits under a named file, so no edge peeks out from behind one. */
    for (const card of layer === 2 ? cards : []) {
      const clearX = card.w / 2 + slab.w / 2 + 10;
      const clearY = card.h / 2 + slab.h / 2 + 10;
      if (Math.abs(x - card.x) < clearX && Math.abs(y - card.y) < clearY) {
        y = card.y + Math.sign(y - card.y || 1) * clearY;
        x = Math.min(zone.r - slab.w / 2, Math.max(zone.l + slab.w / 2, x));
      }
    }
    const s = LAYER_SCALE[layer]!;
    return { x, y, w: slab.w * s, h: slab.h * s, layer, named: false, col: Math.floor(node.gx * 12) };
  });

  /* The map fills the picture: x by 0.36 of the stage, y by 0.27 (0.42 and 0.24 on a phone). */
  const sx = Math.min(w * (wide ? 0.36 : 0.42), zoneW / 2 - 8);
  const sy = Math.min(h * (wide ? 0.27 : 0.24), zoneH / 2 - 14);
  const map = scene.nodes.map((node) => ({ x: centre.x + node.x * sx, y: centre.y + node.y * sy }));
  const mark = scene.nodes.map((node) => markRadius(node.kind, wide));

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
  const keys: CameraKey[] = [shotKey(w, h, 0, centre, centre, 0.92)];
  let subject = centre;
  if (pick) {
    const card = field[pick.index]!;
    keys.push(shotKey(w, h, ACT_START[1]!, { x: lerp(centre.x, card.x, 0.55), y: lerp(centre.y, card.y, 0.55) }, centre, 1.08));
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
  keys.push(shotKey(w, h, AT.whole, centre, centre, 1));
  keys.push(shotKey(w, h, AT.focus, centre, centre, 1, AT.whole));
  /* The closing push-in: on the opened concept and its real neighbours. */
  const lit = [...cast.neighbours];
  const focusAt =
    lit.length > 0
      ? { x: lit.reduce((s, i) => s + map[i]!.x, 0) / lit.length, y: lit.reduce((s, i) => s + map[i]!.y, 0) / lit.length }
      : centre;
  /*
   * Sideways only, and a little low: the map then grows past the picture into the room above the
   * caption, never under the title.
   */
  /* A phone's map already spans its width, so it pushes in less there and barely turns. */
  keys.push(
    shotKey(w, h, AT.focused, { x: lerp(centre.x, focusAt.x, wide ? 0.5 : 0.25), y: centre.y }, { x: centre.x, y: centre.y + (wide ? 40 : 24) }, wide ? 1.22 : 1.1),
  );

  /* Act 4: relations radiate from the opened concept, nearest first, slowly and then in a rush. */
  const dist = (i: number) => Math.hypot(map[i]!.x - subject.x, map[i]!.y - subject.y);
  const edgeFromNear = scene.edges.map((edge) => dist(edge.from) <= dist(edge.to));
  const order = scene.edges
    .map((edge, k) => ({ k, d: Math.min(dist(edge.from), dist(edge.to)) }))
    .filter(({ k }) => !cast.fragmentEdges.has(k))
    .sort((a, b) => a.d - b.d || a.k - b.k);
  const edgeStart = scene.edges.map(() => -1);
  order.forEach(({ k }, rank) => {
    const r = order.length <= 1 ? 0 : rank / (order.length - 1);
    edgeStart[k] = AT.radiate + (AT.radiateMs - STROKE_MS) * r ** 0.55;
  });

  /* Act 3: each cluster's files land around their hub's beat; the rest spread over the act. */
  const beatOf = new Map<number, number>();
  cast.beatHubs.forEach((hub, k) => beatOf.set(hub, AT.beats[k]!));
  const flightStart = scene.nodes.map((node, i) => {
    if (cast.fragment.has(i)) return -1;
    const hubBeat = cast.beatHubs.indexOf(i);
    if (hubBeat >= 0) return AT.beats[hubBeat]! - FLIGHT_MS;
    const beat = beatOf.get(node.cluster);
    if (beat !== undefined) return Math.max(AT.flights, beat - FLIGHT_MS - 220 + node.seed * 440);
    return AT.flights + node.order * (AT.beats[0]! - AT.flights) + node.seed * 200;
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

  /*
   * Names on the finished map: placed once where the closing push-in ends, where marks sit
   * closest to their names, so no name ever changes side or meets another as the camera moves.
   */
  const names = new Map<number, NameSpot>();
  const taken: Box[] = [];
  const closing = cameraAt(keys, AT.focused / FILM_MS, CREEP);
  const place = (i: number, size: number) => {
    ctx.font = `${FONT_WEIGHT.strong} ${size}px ${palette.sans}`;
    const at = projectPoint(w, h, closing, map[i]!.x, map[i]!.y);
    names.set(i, placeName(ctx, taken, at, mark[i]! * closing.zoom, size, scene.nodes[i]!.label, w));
  };
  cast.regions.forEach((i) => place(i, wide ? 22 : 15));
  cast.focusNames.forEach((i) => place(i, wide ? 16 : 13));

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
    edgeStart,
    edgeFromNear,
    flightStart,
    flightFrom,
    names,
  };
}

/**
 * Where a name goes beside its mark: under it if that space is free, else above, to the right or
 * to the left. The first spot that covers no placed name and stays on the stage wins.
 */
function placeName(
  ctx: CanvasRenderingContext2D,
  taken: Box[],
  at: Point,
  r: number,
  size: number,
  name: string,
  stageW: number,
): NameSpot {
  const w = ctx.measureText(name).width;
  const h = size + 4;
  const down = r + 6 + size / 2;
  const side = r + 8;
  const options: NameSpot[] = [
    { dx: 0, dy: down, align: 'center' },
    { dx: 0, dy: -down, align: 'center' },
    { dx: side, dy: 0, align: 'start' },
    { dx: -side, dy: 0, align: 'end' },
    { dx: side, dy: down, align: 'start' },
    { dx: -side, dy: down, align: 'end' },
    { dx: side, dy: -down, align: 'start' },
    { dx: -side, dy: -down, align: 'end' },
    { dx: 0, dy: down + h, align: 'center' },
    { dx: 0, dy: -down - h, align: 'center' },
  ];
  const boxOf = (o: NameSpot): Box => ({
    x: at.x + o.dx + (o.align === 'center' ? 0 : o.align === 'start' ? w / 2 : -w / 2),
    y: at.y + o.dy,
    w,
    h,
  });
  /* A name cut by the stage's edge costs as much as one covering another. */
  const overlap = (b: Box) =>
    taken.reduce((sum, o) => {
      const ox = (o.w + b.w + 8) / 2 - Math.abs(o.x - b.x);
      const oy = (o.h + b.h + 4) / 2 - Math.abs(o.y - b.y);
      return sum + (ox > 0 && oy > 0 ? ox * oy : 0);
    }, 0) + Math.max(0, 8 - (b.x - b.w / 2), b.x + b.w / 2 - (stageW - 8)) * b.h;
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
  return best;
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

/** Adds to `path` a curve from `a` to `b` through control `c`, drawn to fraction `t`. */
function curve(path: Path2D, a: Point, c: Point, b: Point, t: number) {
  if (t <= 0) return;
  path.moveTo(a.x, a.y);
  /* The first `t` of a quadratic curve is itself a quadratic curve. */
  const c1 = { x: lerp(a.x, c.x, t), y: lerp(a.y, c.y, t) };
  const end = { x: lerp(c1.x, lerp(c.x, b.x, t), t), y: lerp(c1.y, lerp(c.y, b.y, t), t) };
  path.quadraticCurveTo(c1.x, c1.y, end.x, end.y);
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
    const a = Math.round(alpha * 50) / 50;
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
      ctx.globalAlpha = alpha;
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
 * One frame of the film at film time `T` (ms) and wall clock `time` (ms). Every place is a function
 * of `T`; only the floating files' slow drift reads the clock.
 */
function drawFilm(
  ctx: CanvasRenderingContext2D,
  cast: FilmCast,
  L: Layout,
  palette: Palette,
  sprites: Sprites,
  T: number,
  time: number,
) {
  const { w, h, wide } = L;
  ctx.clearRect(0, 0, w, h);
  const { scene, pick } = cast;
  const shot = cameraAt(L.keys, T / FILM_MS, CREEP);
  const before = cameraAt(L.keys, Math.max(0, T - STREAK_MS) / FILM_MS, CREEP);
  const toScreen = (p: Point, s: CameraShot = shot) => projectPoint(w, h, s, p.x, p.y);

  /* Act 2's fragment glides from its close-up places to the map in act 3. */
  const glide = easeInOut(span(T, AT.flights, 1000));
  const worldOf = (i: number): Point => {
    const staged = L.staged.get(i);
    const m = L.map[i]!;
    return staged ? { x: lerp(staged.x, m.x, glide), y: lerp(staged.y, m.y, glide) } : m;
  };
  const markOf = (i: number) => {
    const staged = L.stagedMark.get(i);
    return staged === undefined ? L.mark[i]! : lerp(staged, L.mark[i]!, glide);
  };

  /* When each frontmatter line that becomes a mark is done; its mark lands a hairline later. */
  const landed = (role: FrontmatterLine['role'], dep?: number) => {
    const line = cast.lines.find((l) => l.role === role && (dep === undefined || l.dep === dep));
    return line ? line.to + HAIRLINE_MS : Infinity;
  };
  const landOf = new Map<number, number>();
  if (pick) {
    landOf.set(pick.parent, landed('domain'));
    landOf.set(pick.index, landed('kind'));
    pick.dependencies.forEach((dep, k) => landOf.set(dep, landed('dependency', k)));
  }

  /* Exposure: the map sits a little low in acts 3 and 4 and comes fully up in act 5. */
  const expose = easeInOut(span(T, AT.expose, 400));
  const focus = easeInOut(span(T, AT.focus, AT.focused - AT.focus));
  const rest = lerp(1, 0.6, focus);
  const nodeLight = lerp(0.78, 1, expose);
  const lineLift = lerp(1, 0.38 / 0.3, expose);

  /* The key light: on the opened file, then its mark, then the project hub, then back to the subject. */
  const subjectScreen = (() => {
    if (!pick) return toScreen(L.centre);
    const card = L.field[pick.index]!;
    const onCard = toScreen(card);
    const onMark = toScreen(worldOf(pick.index));
    return {
      x: lerp(onCard.x, onMark.x, easeInOut(span(T, ACT_START[1]!, 620))),
      y: lerp(onCard.y, onMark.y, easeInOut(span(T, ACT_START[1]!, 620))),
    };
  })();
  const root = scene.nodes.findIndex((n) => n.depth === 0);
  const hubScreen = toScreen(root >= 0 ? L.map[root]! : L.centre);
  const toHub = easeInOut(span(T, AT.amber, 400)) * (1 - easeInOut(span(T, AT.focus, 600)));
  const lightAt = { x: lerp(subjectScreen.x, hubScreen.x, toHub), y: lerp(subjectScreen.y, hubScreen.y, toHub) };
  const lightUp = easeInOut(span(T, AT.rack, 500));
  const lightR = wide ? 230 : 150;
  drawKeyLight(ctx, sprites.indigo, lightAt.x, lightAt.y, lightR, 0.14 * lightUp * (1 - toHub));
  drawKeyLight(ctx, sprites.amber, lightAt.x, lightAt.y, lightR, 0.1 * lightUp * toHub);

  /* Act 4's ghost numeral counts the lines drawn, behind the picture. */
  const fragmentCount = cast.fragmentEdges.size;
  if (T >= AT.radiate - 300 && T < AT.expose + 600) {
    let count = fragmentCount;
    for (const start of L.edgeStart) if (start >= 0 && T >= start) count += 1;
    const hit = span(T, AT.amber, 320);
    const bump = T >= AT.amber ? 0.08 * (1 - easeOut(hit)) : 0;
    const a = (0.06 + bump) * easeInOut(span(T, AT.radiate - 300, 300)) * (1 - easeInOut(span(T, AT.expose, 600)));
    if (a > 0) {
      ctx.globalAlpha = a;
      ctx.fillStyle = palette.ink;
      ctx.font = `${FONT_WEIGHT.strong} ${wide ? 220 : 120}px ${palette.sans}`;
      ctx.textAlign = 'end';
      ctx.textBaseline = 'alphabetic';
      /* Under the map's right side, clear of the caption on the left. */
      ctx.fillText(String(count), L.zone.r, Math.min(L.h - 24, L.zone.b + (wide ? 70 : 40)));
      ctx.textAlign = 'start';
      ctx.globalAlpha = 1;
    }
  }

  drawField(ctx, cast, L, palette, shot, T, time);

  /* Relations: the fragment's own persist from act 2; the rest radiate in act 4. */
  const lines = new LineBatch();
  const hubAt = toScreen(L.centre);
  const isLit = (k: number) => {
    const edge = scene.edges[k]!;
    return pick !== null && (edge.from === pick.index || edge.to === pick.index);
  };
  scene.edges.forEach((edge, k) => {
    const fragmentEdge = cast.fragmentEdges.has(k);
    let grow: number;
    if (fragmentEdge) {
      const land = Math.max(landOf.get(edge.from) ?? Infinity, landOf.get(edge.to) ?? Infinity);
      grow = easeOut(span(T, land, HAIRLINE_MS));
    } else {
      const start = L.edgeStart[k]!;
      grow = start < 0 ? 0 : easeInOut(span(T, start, STROKE_MS));
    }
    if (grow <= 0) return;
    const near = L.edgeFromNear[k] ? edge.from : edge.to;
    const far = near === edge.from ? edge.to : edge.from;
    const a = toScreen(worldOf(near));
    const b = toScreen(worldOf(far));
    const bow = crossesClusters(scene, edge) ? 0.18 : 0;
    let control = bowed(a, b, bow, hubAt);
    if (fragmentEdge) {
      /* In the close-up a dependency hangs off its concept like a branch of a file tree. */
      const elbow = edge.contains ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: near === pick!.index ? a.x : b.x, y: near === pick!.index ? b.y : a.y };
      control = { x: lerp(elbow.x, control.x, glide), y: lerp(elbow.y, control.y, glide) };
      const alpha = lerp(lerp(0.85, 0.55, glide), 0.85, focus);
      curve(lines.add(edge.contains || focus > 0.5 ? palette.ink : palette.indigo, alpha, 1.5), a, control, b, grow);
      return;
    }
    const lit = isLit(k);
    if (lit && focus > 0) {
      curve(lines.add(palette.ink, 0.85 * focus, 1.5), a, control, b, grow);
      if (focus >= 1) return;
    }
    const base = (edge.contains ? 0.2 : 0.3) * lineLift * (lit ? 1 - focus : rest);
    curve(lines.add(edge.contains ? palette.ink : palette.indigo, base, 1), a, control, b, grow);
  });
  lines.stroke(ctx);

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
    const alpha = nodeLight * easeOut(f / 0.2) * (cast.neighbours.has(i) ? 1 : rest);
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
      const land = landOf.get(i) ?? Infinity;
      const enter = easeOut(span(T, land - 80, 200));
      if (enter <= 0) continue;
      const p = toScreen(worldOf(i));
      const node = scene.nodes[i]!;
      const r = markOf(i) * shot.zoom * lerp(0.6, 1, enter);
      dot(node.kind === 'project' ? palette.amber : palette.indigo, enter * lerp(1, nodeLight, glide), p, r);
      rings.push({ p, age: T - land, color: palette.indigo, r });
      if (i === pick.index) rings.push({ p, age: T - landed('title'), color: palette.indigo, r });
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

  if (pick) drawPanel(ctx, cast, L, palette, shot, T, time, toScreen(worldOf(pick.index)), markOf(pick.index) * shot.zoom);

  /* Names: the fragment's beside the close-up, the regions' and the focus's on the finished map. */
  ctx.textBaseline = 'middle';
  if (pick && T >= AT.landings[0]! && T < AT.flights + 400) {
    const size = wide ? 18 : 13;
    const look = { font: `${FONT_WEIGHT.strong} ${size}px ${palette.sans}`, size, fill: palette.ink, halo: palette.ground };
    const leave = 1 - easeInOut(span(T, AT.fold, 300));
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
    const nameIn = (i: number) => easeOut(span(T, landOf.get(i) ?? Infinity, LABEL_MS)) * leave;
    nameAt(pick.parent, scene.nodes[pick.parent]!.label, nameIn(pick.parent));
    if (wide) pick.dependencies.forEach((dep) => nameAt(dep, scene.nodes[dep]!.label, nameIn(dep)));
    const titled = easeInOut(span(T, landed('title'), LABEL_MS));
    nameAt(pick.index, cast.slug, nameIn(pick.index) * (1 - titled));
    nameAt(pick.index, scene.nodes[pick.index]!.label, nameIn(pick.index) * titled);
  }
  if (T >= AT.expose) {
    const regionSize = wide ? 22 : 15;
    const focusSize = wide ? 16 : 13;
    /* A name keeps its side of the mark and its distance from it. */
    const nameAt = (i: number, size: number, light: number, rise: number) => {
      const spot = L.names.get(i);
      if (!spot || light <= 0) return;
      const p = toScreen(L.map[i]!);
      ctx.globalAlpha = light;
      L.stamps.draw(ctx, scene.nodes[i]!.label, p.x + spot.dx, p.y + spot.dy + rise, {
        font: `${FONT_WEIGHT.strong} ${size}px ${palette.sans}`,
        size,
        fill: palette.ink,
        halo: palette.ground,
        align: spot.align,
      });
    };
    cast.regions.forEach((i, k) => {
      const enter = easeOut(span(T, AT.expose + 100 + k * 120, LABEL_MS));
      nameAt(i, regionSize, enter * (cast.neighbours.has(i) ? 1 : rest), (1 - enter) * LABEL_RISE);
    });
    if (focus > 0) cast.focusNames.forEach((i) => nameAt(i, focusSize, focus, (1 - focus) * LABEL_RISE));
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
  const recede = lerp(1, 0.07, easeInOut(span(T, AT.open, 500))) * (1 - easeInOut(span(T, AT.landings[0]! + 200, 600)));
  if (recede <= 0) return;
  const rack = easeInOut(span(T, AT.rack, 400));
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
      ctx.globalAlpha = tone * enter * 0.4;
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
      /* A file is opaque, so nothing behind it shows through. */
      ctx.globalAlpha = tone * enter;
      ctx.fillStyle = palette.ground;
      ctx.fill();
      ctx.fillStyle = palette.card;
      ctx.fill();
      ctx.strokeStyle = palette.edge;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = node.kind === 'project' ? palette.amber : palette.indigo;
      ctx.beginPath();
      ctx.arc(p.x - bw / 2 + 18, y, 3, 0, Math.PI * 2);
      ctx.fill();
      L.stamps.draw(ctx, node.file, p.x - bw / 2 + 32, y + 1, { font: `${L.text}px ${palette.mono}`, size: L.text, fill: palette.ink });
    });
  }
  ctx.globalAlpha = 1;
}

/**
 * The opened file: one of the near cards in act 1; from 2.2s it grows into the panel and its
 * frontmatter types itself, each finished line shooting a hairline to the mark it became; from
 * 6.4s it folds back into that mark.
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
  const shut = easeInOut(span(T, AT.fold, 200));
  const fold = easeInOut(span(T, AT.fold + 180, 240));
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
  const lit = easeInOut(span(T, AT.rack, 500)) * (1 - open);
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
  ctx.arc(x + lerp(18, P.padX, open), rowY, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `${L.text}px ${palette.mono}`;
  ctx.textBaseline = 'middle';
  const nameX = x + lerp(32, P.padX + 14, open);
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
    const trace = textLight * (1 - clamp01(shut / 0.3)) * 0.6 * (1 - easeInOut(span(T, line.to + 1300, 400)));
    if (!L.wide || lit <= 0 || trace <= 0) return;
    const target = hairlineTarget(cast, line, L, shot);
    if (!target) return;
    traces.push({ start: { x: lx + 12, y: ly }, end: { x: target.x - 14 - (target.r ?? 0), y: target.y }, lit, trace });
  });
  const last = lines[lines.length - 1];
  if (caret && last && T < last.to + 200) {
    const at = caret as Point;
    ctx.globalAlpha = textLight * (0.55 + 0.45 * Math.sin(T / 170));
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
  const out = act === ACT_MS.length ? 0 : easeInOut(span(T, end - 180, 180));
  const head = T < start ? 0 : easeOut(span(T, start, 240));
  const body = T < start ? 0 : easeOut(span(T, start + 60, 240));
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
    const neighbours = new Set<number>();
    const fragmentEdges = new Set<number>();
    const fragment = new Set<number>();
    if (closeUp) {
      fragment.add(closeUp.index);
      fragment.add(closeUp.parent);
      closeUp.dependencies.forEach((dep) => fragment.add(dep));
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
    /* The project and its largest clusters: five names on the finished map. */
    const ring = scene.nodes
      .map((node, i) => ({ node, i }))
      .filter(({ node }) => node.depth === 1)
      .sort((a, b) => b.node.degree - a.node.degree || a.node.id.localeCompare(b.node.id))
      .map(({ i }) => i);
    const regions = (root < 0 ? ring : [root, ...ring]).slice(0, 5);
    const beatHubs = regions.filter((i) => !fragment.has(i)).slice(0, AT.beats.length);
    /* Names in the closing push-in: the opened file's concept and the dependencies it typed. */
    const focusNames = closeUp ? [closeUp.index, ...closeUp.dependencies].filter((i) => !regions.includes(i)) : [];
    return {
      scene,
      pick: closeUp,
      lines: closeUp ? frontmatter(scene, closeUp, locale, slugOf) : [],
      slug: closeUp ? slugOf(closeUp.index) : '',
      regions,
      beatHubs,
      neighbours,
      focusNames,
      fragmentEdges,
      fragment,
    };
  }, [scene, closeUp, locale]);
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
    let shown = film ? 0 : STILL_MS / FILM_MS;
    let clock = 0;
    let veil = 1;
    const time = createFilmClock(ACT_SPANS, ACT_MS);

    const paint = () => {
      if (!layout) return;
      const T = shown * FILM_MS;
      drawFilm(ctx, cast, layout, palette, sprites, T, clock);
      if (!film) return;
      const light = isMotionPaused() ? 1 : time.fade() * veil;
      el.style.opacity = String(light);
      captions.current.forEach((caption, i) => {
        const head = heads.current[i];
        const body = bodies.current[i];
        if (!caption || !head || !body) return;
        const lit = captionLight(i + 1, T);
        const fade = (1 - lit.out) * light;
        head.style.opacity = String(lit.head * fade);
        head.style.transform = `translateY(${(1 - lit.head) * 16}px)`;
        body.style.opacity = String(lit.body * fade);
        body.style.transform = `translateY(${(1 - lit.body) * 16}px)`;
        caption.style.visibility = Math.max(lit.head, lit.body) * fade > 0.01 ? 'visible' : 'hidden';
      });
      const act = time.act();
      fills.current.forEach((fill, i) => {
        if (!fill) return;
        const [start, end] = ACT_SPANS[i]!;
        fill.style.transform = `scaleX(${i < act ? 1 : i > act ? 0 : clamp01((shown - start) / (end - start))})`;
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
  }, [film, scene, cast]);

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
                    <p
                      ref={(node) => {
                        bodies.current[i] = node;
                      }}
                      className="mt-3 max-w-[30rem] text-title leading-title text-[color:var(--color-text-secondary)] opacity-0"
                    >
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
