import {
  ACT_START,
  FILM_MS,
  FLIGHT,
  LIT,
  OPEN,
  WALL,
  arcMidpointMs,
  chipIn,
  flight,
  flightMs,
  flightStart,
  litLineStart,
  local,
  phoneScroll,
  rowHighlight,
  rowStart,
  span,
  wallColumn,
  wallDim,
} from '../../lib/film/film-acts';
import { clamp01, easeInOut, easeInOutSine, easeOut, lerp } from '../../lib/film/film-kit';
import { bowControl, bowedPoints, polylineLength, quadAt, subPolyline, type Pt, type Rect } from '../../lib/film/film-geometry';
import type { FilmLabel, FilmLitLine, FilmMapLayout, InkRole } from '../../lib/film/film-map-layout';
import type { OpenLayout } from '../../lib/film/film-open';
import { rowOnPhone, type PlacedRow, type WallLayout } from '../../lib/film/film-wall';
import type { FilmVault } from '../../lib/film/film-vault';

/* ------------------------------------------------------------------------------------------ */
/* Inks                                                                                         */
/* ------------------------------------------------------------------------------------------ */

export interface FilmInks {
  ground: string;
  halo: string;
  discFill: string;
  name: string;
  strong: string;
  project: string;
  arc: string;
  reach: string;
  agent: string;
  primary: string;
  secondary: string;
  tertiary: string;
  panel: string;
  border: string;
  borderSoft: string;
  /** The mark at rest: the name ink mixed toward the ground by the product's rest share. */
  rest: string;
}

type Rgb = [number, number, number, number];

/** Any CSS colour the canvas understands, as 0..255 channels and an alpha. */
export function parseColor(color: string, probe?: CanvasRenderingContext2D | null): Rgb {
  let value = color.trim();
  if (probe) {
    probe.fillStyle = '#000';
    probe.fillStyle = value;
    value = String(probe.fillStyle);
  }
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = value.match(/rgba?\(([^)]+)\)/i);
  if (rgb) {
    const parts = rgb[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
  }
  return [0, 0, 0, 1];
}

const LEVELS = 48;
const mixCache = new Map<string, string[]>();

/** `a` mixed toward `b` by `t` (0 is `b`, 1 is `a`), opaque and quantised so a frame allocates nothing. */
export function mix(a: string, b: string, t: number): string {
  const level = Math.round(clamp01(t) * LEVELS);
  if (level >= LEVELS) return a;
  const key = `${a}|${b}`;
  let row = mixCache.get(key);
  if (!row) mixCache.set(key, (row = []));
  if (!row[level]) {
    const x = parseColor(a);
    const y = parseColor(b);
    const k = level / LEVELS;
    const c = (i: number) => Math.round(y[i]! + (x[i]! - y[i]!) * k);
    row[level] = `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
  }
  return row[level]!;
}

export function rgba(color: string, alpha: number): string {
  const [r, g, b] = parseColor(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(clamp01(alpha) * 1000) / 1000})`;
}

/* ------------------------------------------------------------------------------------------ */
/* Text stamps                                                                                  */
/* ------------------------------------------------------------------------------------------ */

const STAMP_PAD = 6;

/**
 * Text drawn once into a small canvas and stamped: a stamp lands on fractional pixels as smoothly as
 * a mark does, and a fading or sunk name is the same stamp under `globalAlpha`. A halo is a rim of
 * the ground behind the text, so a line passing under it never cuts it.
 */
export class TextStamps {
  private stamps = new Map<string, { canvas: HTMLCanvasElement; w: number; h: number; tw: number }>();
  private readonly dpr: number;
  constructor(dpr: number) {
    this.dpr = dpr;
  }

  get size() {
    return this.stamps.size;
  }

  width(text: string, font: string): number {
    return this.stamp(text, font, '#fff', null)?.tw ?? 0;
  }

  private stamp(text: string, font: string, fill: string, halo: string | null) {
    const key = `${font}|${fill}|${halo ?? ''}|${text}`;
    let stamp = this.stamps.get(key);
    if (stamp) return stamp;
    const canvas = document.createElement('canvas');
    const c = canvas.getContext('2d');
    if (!c) return null;
    c.font = font;
    const tw = c.measureText(text).width;
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 15);
    const w = tw + STAMP_PAD * 2;
    const h = size * 1.5 + STAMP_PAD * 2;
    canvas.width = Math.max(1, Math.ceil(w * this.dpr));
    canvas.height = Math.max(1, Math.ceil(h * this.dpr));
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
    return stamp;
  }

  /** Draws `text` with its left edge, centre or right edge at `x` and its middle at `y`; returns its width. */
  draw(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    font: string,
    fill: string,
    { halo = null, align = 'left', scale = 1 }: { halo?: string | null; align?: 'left' | 'center' | 'right'; scale?: number } = {},
  ): number {
    const stamp = this.stamp(text, font, fill, halo);
    if (!stamp) return 0;
    const tw = stamp.tw * scale;
    const left = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
    ctx.drawImage(stamp.canvas, left - STAMP_PAD * scale, y - (stamp.h * scale) / 2, stamp.w * scale, stamp.h * scale);
    return stamp.tw;
  }
}

/* ------------------------------------------------------------------------------------------ */
/* The scene: everything a frame reads, made once per layout                                    */
/* ------------------------------------------------------------------------------------------ */

interface FlightPlan {
  id: string;
  start: number;
  /** The name's middle when the flight starts. */
  from: Pt;
  text: string;
  /** The row's own light when the flight starts. */
  rowAlpha: number;
  side: number;
  /** Phone elements: the dot alone travels; the name fades where it stands. */
  dropText: boolean;
  /** How long it flies: longer for a far row, so no frame moves it too far. */
  ms: number;
}

interface LitPlan {
  line: FilmLitLine;
  start: number;
  len: number;
  /** Dots of a `relates` line, from the pick outward. */
  dots: Pt[];
  path: Path2D | null;
  glint: number;
}

interface ArcPlan {
  index: number;
  start: number;
  path: Path2D;
}

/** What one frame drew, for the test probe: every mark and label by key. */
export interface FrameRecord {
  set(key: string, x: number, y: number, alpha: number): void;
}

export interface FilmScene {
  vault: FilmVault;
  map: FilmMapLayout;
  wall: WallLayout;
  open: OpenLayout | null;
  inks: FilmInks;
  stamps: TextStamps;
  sprites: Map<string, HTMLCanvasElement>;
  flights: Map<string, FlightPlan>;
  /** The pick, its domain and its elements: the close-up of act 2. */
  fragment: Set<string>;
  arcs: ArcPlan[];
  lit: LitPlan[];
  /** Which wall row stands for each concept. */
  rowOf: Map<string, PlacedRow>;
  slotSide: Map<string, number>;
  /** How long act 3 carries the close-up's marks to the map: longer where they travel far on a small stage. */
  travelMs: number;
  /** Ink share kept by unrelated clusters while lit. */
  sink: number;
  mono: string;
  record: FrameRecord | null;
}

const RIBBON_FADE_PX = 90;

/** A tapered ribbon's polygon for the part `from`..`to` of a line, keeping the whole line's taper. */
function ribbonPath(pts: readonly Pt[], w0: number, from: number, to: number, wideAtStart: boolean): Path2D {
  const path = new Path2D();
  const part = subPolyline(pts, from, to);
  if (part.length < 2) return path;
  const total = polylineLength(pts) || 1;
  const left: Pt[] = [];
  const right: Pt[] = [];
  let run = from * total;
  for (let i = 0; i < part.length; i += 1) {
    const p = part[i]!;
    if (i > 0) run += Math.hypot(p.x - part[i - 1]!.x, p.y - part[i - 1]!.y);
    const a = part[Math.max(0, i - 1)]!;
    const b = part[Math.min(part.length - 1, i + 1)]!;
    const tl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const share = run / total;
    const half = (w0 * (wideAtStart ? 1 - share : share)) / 2 + 0.25;
    left.push({ x: p.x - ((b.y - a.y) / tl) * half, y: p.y + ((b.x - a.x) / tl) * half });
    right.push({ x: p.x + ((b.y - a.y) / tl) * half, y: p.y - ((b.x - a.x) / tl) * half });
  }
  path.moveTo(left[0]!.x, left[0]!.y);
  for (const p of left) path.lineTo(p.x, p.y);
  for (let i = right.length - 1; i >= 0; i -= 1) path.lineTo(right[i]!.x, right[i]!.y);
  path.closePath();
  return path;
}

export function buildScene(
  vault: FilmVault,
  map: FilmMapLayout,
  wall: WallLayout,
  open: OpenLayout | null,
  inks: FilmInks,
  stamps: TextStamps,
  sprites: Map<string, HTMLCanvasElement>,
  { sink, mono }: { sink: number; mono: string },
): FilmScene {
  const pick = map.pick;
  const fragment = new Set<string>();
  if (pick && open) {
    const node = vault.byId.get(pick)!;
    fragment.add(pick);
    if (node.domain) fragment.add(node.domain);
    node.elements.forEach((e) => fragment.add(e));
  }
  const rowOf = new Map<string, PlacedRow>();
  for (const row of wall.rows) if (row.row.id) rowOf.set(row.row.id, row);
  const slotSide = new Map(map.order.map((id, i) => [id, i % 2 ? -1 : 1]));
  const flights = new Map<string, FlightPlan>();
  const plan = (id: string, start: number, kind: 'hub' | 'capability' | 'element') => {
    const row = rowOf.get(id);
    if (!row || !map.marks.has(id)) return;
    let at: Pt = { x: row.x + row.width / 2, y: row.y };
    let rowAlpha = 1;
    if (wall.window) {
      const on = rowOnPhone(wall, row, wall.scrollTo);
      at = { x: row.x + row.width / 2, y: Math.min(wall.window.b, Math.max(wall.window.t, on.y)) };
      rowAlpha = on.alpha;
    }
    const domain = map.marks.get(id)!.domain;
    const to = map.marks.get(id)!;
    const side = domain ? slotSide.get(domain) ?? 1 : 1;
    const path = bowedPoints(at, to, FLIGHT.bow * side, 24);
    flights.set(id, {
      ms: flightMs(polylineLength(path), Math.hypot(map.w, map.h)),
      id,
      start,
      from: at,
      text: row.text,
      rowAlpha,
      side,
      dropText: Boolean(wall.window) && kind === 'element',
    });
  };
  const hubs = [...(vault.project ? [vault.project.id] : []), ...map.order].filter((id) => !fragment.has(id));
  hubs.forEach((id, k) => plan(id, flightStart('hub', k), 'hub'));
  let capRank = 0;
  let elementRank = 0;
  for (const domain of map.order) {
    const caps = vault.capabilities.filter((c) => c.domain === domain && !fragment.has(c.id));
    for (const c of caps) plan(c.id, flightStart('capability', capRank++), 'capability');
  }
  for (const domain of map.order) {
    const caps = vault.capabilities.filter((c) => c.domain === domain);
    const elements = [
      ...caps.flatMap((c) => c.elements),
      ...vault.elements.filter((e) => e.domain === domain && !e.capability).map((e) => e.id),
    ].filter((e) => !fragment.has(e));
    for (const e of elements) plan(e, flightStart('element', elementRank++), 'element');
  }

  const arcs = map.restArcs.map((arc, index) => ({
    index,
    start: FLIGHT.arcFrom + index * FLIGHT.arcStep,
    path: ribbonPath(arc.pts, arc.width, 0, 1, true),
  }));

  const lit: LitPlan[] = [];
  if (map.lit) {
    const counts = { needs: map.lit.lines.filter((l) => l.kind === 'needs').length, neededBy: map.lit.lines.filter((l) => l.kind === 'neededBy').length };
    const rank = { needs: 0, neededBy: 0, relates: 0, own: 0 };
    let glint = 0;
    for (const line of map.lit.lines) {
      const len = polylineLength(line.pts);
      const dots: Pt[] = [];
      if (line.kind === 'relates') {
        const gap = map.sizes.wide ? 6.4 : 5.6;
        for (let d = 0; d <= len; d += gap) dots.push(subPolyline(line.pts, 0, d / len).pop() ?? line.pts[0]!);
      }
      lit.push({
        line,
        start: litLineStart(line.kind, rank[line.kind]++, counts),
        len,
        dots,
        path: line.kind === 'own' || line.kind === 'relates' ? null : ribbonPath(line.pts, line.width, 0, 1, !line.towardPick),
        glint: line.kind === 'own' ? -1 : glint++,
      });
    }
  }
  /* The close-up's marks travel to the map at most 2.2% of the stage's diagonal per 60 Hz frame; `easeInOut` peaks at three times the mean speed. */
  let travelMs: number = FLIGHT.travelMs;
  if (pick && open) {
    const node = vault.byId.get(pick)!;
    const legs: [Pt, Pt | undefined][] = [
      [open.pick, map.marks.get(pick)],
      [open.domain, node.domain ? map.marks.get(node.domain) : undefined],
      ...open.dots.map((d, k): [Pt, Pt | undefined] => [d, map.marks.get(node.elements[k]!)]),
    ];
    const far = Math.max(0, ...legs.map(([a, b]) => (b ? Math.hypot(b.x - a.x, b.y - a.y) : 0)));
    const allowed = (0.022 * Math.hypot(map.w, map.h)) / (1000 / 60);
    travelMs = Math.max(FLIGHT.travelMs, (3 * far) / allowed);
  }
  return { vault, map, wall, open, inks, stamps, sprites, flights, fragment, arcs, lit, rowOf, slotSide, travelMs, sink, mono, record: null };
}

/* ------------------------------------------------------------------------------------------ */
/* Primitives                                                                                   */
/* ------------------------------------------------------------------------------------------ */

const TAU = Math.PI * 2;

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rim: number, core: number, ink: string, fill: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = rim;
  ctx.strokeStyle = ink;
  ctx.stroke();
  if (core > 0) {
    ctx.beginPath();
    ctx.arc(x, y, core, 0, TAU);
    ctx.fillStyle = ink;
    ctx.fill();
  }
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ink: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = ink;
  ctx.fill();
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, width: number, ink: string, alpha: number) {
  if (alpha <= 0.002 || r <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.lineWidth = width;
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function light(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement | undefined, x: number, y: number, r: number, alpha: number) {
  if (!sprite || alpha <= 0.002 || r <= 1) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

function inkOf(inks: FilmInks, role: InkRole): string {
  switch (role) {
    case 'primary':
      return inks.primary;
    case 'secondary':
      return inks.secondary;
    case 'tertiary':
      return inks.tertiary;
    case 'name':
      return inks.name;
    case 'strong':
      return inks.strong;
    case 'arc':
      return inks.arc;
    case 'reach':
      return inks.reach;
    case 'agent':
      return inks.agent;
  }
}

function drawLabel(ctx: CanvasRenderingContext2D, scene: FilmScene, label: FilmLabel, alpha: number, dy = 0) {
  if (alpha <= 0.004) return;
  const { stamps, inks } = scene;
  ctx.globalAlpha = Math.min(1, alpha);
  if (label.segments.length === 1) {
    const seg = label.segments[0]!;
    stamps.draw(ctx, seg.text, label.x, label.y + dy, label.font, inkOf(inks, seg.ink), { halo: inks.halo, align: label.align });
  } else {
    let x = label.box.l;
    for (const seg of label.segments) x += stamps.draw(ctx, seg.text, x, label.y + dy, label.font, inkOf(inks, seg.ink), { halo: inks.halo });
  }
  ctx.globalAlpha = 1;
  scene.record?.set(label.key, label.x, label.y + dy, alpha);
}

/** A capability's disc the product's way: a dot under the smallest size, else rim and core. */
function capMark(ctx: CanvasRenderingContext2D, scene: FilmScene, x: number, y: number, r: number, ink: string) {
  const S = scene.map.sizes;
  const min = scene.map.capRadius(0);
  if (r < min + 0.2) disc(ctx, x, y, r, S.capRim, Math.max(1.1, r - 2.6 * S.K), ink, scene.inks.discFill);
  else disc(ctx, x, y, r, S.capRim, Math.max(1.6 * S.K, r - 3.5 * S.K), ink, scene.inks.discFill);
}

function domainMark(ctx: CanvasRenderingContext2D, scene: FilmScene, x: number, y: number, scale: number, ink: string) {
  const S = scene.map.sizes;
  disc(ctx, x, y, S.domainR * scale, S.domainRim * scale, S.domainCore * scale, ink, scene.inks.discFill);
}

function pointer(ctx: CanvasRenderingContext2D, scene: FilmScene, tip: Pt, alpha: number) {
  if (alpha <= 0.004) return;
  const k = 18 / 20;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(tip.x, tip.y);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 17);
  ctx.lineTo(4.6, 13);
  ctx.lineTo(7.6, 20);
  ctx.lineTo(10.4, 18.8);
  ctx.lineTo(7.4, 12);
  ctx.lineTo(13, 12);
  ctx.closePath();
  ctx.fillStyle = scene.inks.strong;
  ctx.fill();
  ctx.lineWidth = 1 / k;
  ctx.strokeStyle = scene.inks.ground;
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------------------------------ */
/* Act 1 and act 2: the wall and the opened file                                                */
/* ------------------------------------------------------------------------------------------ */

/** The wall's rows at act-1 time `t1` under an extra light `fade`; `rowLight` 0 leaves a row to another painter. */
function paintWall(
  ctx: CanvasRenderingContext2D,
  scene: FilmScene,
  t1: number,
  fade: number,
  rowLight: (row: PlacedRow) => number,
  dimmed = true,
) {
  const { wall, inks, stamps } = scene;
  if (fade <= 0.004) return;
  const scroll = wall.window ? wall.scrollTo * phoneScroll(t1) : 0;
  const dim = dimmed ? wallDim(t1) : 1;
  const pickId = scene.map.pick;
  const phoneIn = easeOut(span(t1, 0, WALL.phoneIn));
  for (const row of wall.rows) {
    const own = rowLight(row);
    if (own <= 0.004) continue;
    let y = row.y;
    let alpha = fade * own;
    if (wall.window) {
      const on = rowOnPhone(wall, row, scroll);
      if (on.alpha <= 0) continue;
      y = on.y;
      alpha *= on.alpha * phoneIn;
    } else {
      const col = wallColumn(t1, row.col);
      alpha *= col.alpha;
      y += col.rise;
    }
    const isPick = row.row.id !== null && row.row.id === pickId;
    if (!isPick) alpha *= dim;
    if (alpha <= 0.004) continue;
    ctx.globalAlpha = alpha;
    const ink = isPick ? mix(inks.primary, inks.tertiary, chipIn(t1)) : row.row.id === null ? inks.secondary : inks.tertiary;
    stamps.draw(ctx, row.text, row.x, y, wall.font, ink);
    if (row.row.count !== null) stamps.draw(ctx, String(row.row.count), row.x + row.width + wall.countGap, y, wall.font, inks.tertiary);
    ctx.globalAlpha = 1;
    scene.record?.set(`row:${row.row.key}`, row.x, y, alpha);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, rect: Rect, radius: number) {
  ctx.beginPath();
  ctx.roundRect(rect.l, rect.t, rect.r - rect.l, rect.b - rect.t, radius);
}

const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({ l: lerp(a.l, b.l, t), t: lerp(a.t, b.t, t), r: lerp(a.r, b.r, t), b: lerp(a.b, b.b, t) });

/** The pick's chip (`open` 0) or its file panel (`open` 1), and the file name riding between them. */
function paintChipOrPanel(ctx: CanvasRenderingContext2D, scene: FilmScene, open: number, chipLight: number, rowsLight: number, t2: number, scroll: number) {
  const { wall, inks, stamps } = scene;
  const O = scene.open;
  const chip0 = wall.chip;
  if (!chip0) return;
  const pickRow = wall.rows[wall.pickRow]!;
  const chip: Rect = { l: chip0.l, t: chip0.t - scroll, r: chip0.r, b: chip0.b - scroll };
  const rect = O ? lerpRect(chip, O.panel, open) : chip;
  const radius = O ? lerp(chip0.radius, O.radius, open) : chip0.radius;
  if (chipLight > 0.004) {
    ctx.globalAlpha = chipLight * (1 - open);
    roundRect(ctx, rect, radius);
    ctx.fillStyle = rgba(inks.primary, 0.06);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(inks.primary, 0.14);
    ctx.stroke();
    if (O && open > 0) {
      ctx.globalAlpha = chipLight * open;
      roundRect(ctx, rect, radius);
      ctx.fillStyle = inks.panel;
      ctx.fill();
      ctx.strokeStyle = inks.border;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  /* The file name rides from its row to the panel's header. */
  const fileFont = wall.font;
  const from = { x: pickRow.x, y: pickRow.y - scroll };
  const dirW = O ? O.dirW : 0;
  const to = O ? { x: O.headerX + dirW, y: O.headerY } : from;
  const x = lerp(from.x, to.x, open);
  const y = lerp(from.y, to.y, open);
  const text = open > 0.5 && O ? O.file : pickRow.text;
  const nameLight = chipLight;
  if (nameLight > 0.004) {
    ctx.globalAlpha = nameLight;
    stamps.draw(ctx, text, x, y, fileFont, inks.primary);
    ctx.globalAlpha = 1;
    scene.record?.set('file', x, y, nameLight);
  }
  if (!O || rowsLight <= 0.004) return;
  /* Header path, the separator and the frontmatter. */
  const header = easeOut(span(t2, OPEN.headerFrom, OPEN.headerMs)) * rowsLight;
  if (header > 0.004) {
    ctx.globalAlpha = header;
    stamps.draw(ctx, O.dir, O.headerX, O.headerY, `400 ${scene.map.sizes.wide ? 15 : 13}px ${scene.mono}`, inks.tertiary);
    ctx.strokeStyle = inks.borderSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(O.panel.l, O.panel.t + O.barH);
    ctx.lineTo(O.panel.r, O.panel.t + O.barH);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const keyRows = O.lines.filter((l) => l.role !== 'rule').length;
  O.lines.forEach((line, i) => {
    let k = -1;
    let alpha: number;
    if (line.role === 'rule') alpha = i === 0 ? header : easeOut(span(t2, rowStart(keyRows - 1), OPEN.rowInMs)) * rowsLight;
    else {
      k = i - 1;
      alpha = easeOut(span(t2, rowStart(k), OPEN.rowInMs)) * rowsLight;
    }
    if (alpha <= 0.004) return;
    if (k >= 0) {
      const hi = rowHighlight(t2, k, keyRows) * alpha;
      if (hi > 0.004) {
        ctx.globalAlpha = hi;
        roundRect(ctx, { l: O.panel.l + 10, t: line.y - O.lineH / 2 + 2, r: O.panel.r - 10, b: line.y + O.lineH / 2 - 2 }, 6);
        ctx.fillStyle = rgba(inks.primary, 0.06);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = alpha;
    if (line.key) {
      stamps.draw(ctx, `${line.key}:`, line.x, line.y, O.font, inks.tertiary);
      stamps.draw(ctx, line.value, line.valueX, line.y, O.font, inks.primary);
    } else stamps.draw(ctx, line.value, line.x, line.y, O.font, inks.tertiary);
    ctx.globalAlpha = 1;
    scene.record?.set(`fm:${i}`, line.x, line.y, alpha);
  });
}

/** Where each active row's hairline ends: the thing that row just drew. */
function hairTarget(O: OpenLayout, k: number, r: number): Pt {
  switch (k) {
    case 0:
      return { x: O.pick.x - r - 8, y: O.pick.y };
    case 1:
      return { x: O.pickName.x - 8, y: O.pickName.y };
    case 2:
      return { x: O.domain.x - O.domainR - 8, y: O.domain.y };
    case 3: {
      const mid = O.dots[Math.floor(O.dots.length / 2)] ?? O.pick;
      return { x: mid.x, y: mid.y + 10 };
    }
    default: {
      const line = O.leaving[0];
      return line ? { x: lerp(line.from.x, line.to.x, 0.25), y: lerp(line.from.y, line.to.y, 0.25) + 8 } : O.pick;
    }
  }
}

/** Act 2's close-up at `t2`, faded by `out` (act 3's fold), its parts at `travel` toward the map. */
function paintFragment(
  ctx: CanvasRenderingContext2D,
  scene: FilmScene,
  t2: number,
  linesLight: number,
  travel: number,
  namesLight: number,
  pass: 'light' | 'marks',
) {
  const O = scene.open;
  const { map, inks, stamps, vault } = scene;
  const pick = map.pick;
  if (!O || !pick) return;
  const S = map.sizes;
  const node = vault.byId.get(pick)!;
  const pickMap = map.marks.get(pick)!;
  const domainMap = node.domain ? map.marks.get(node.domain) : undefined;
  const cluster = map.clusters.find((c) => c.id === node.domain);
  const at = (from: Pt, to: Pt | undefined) => (to ? { x: lerp(from.x, to.x, travel), y: lerp(from.y, to.y, travel) } : from);
  const appear = (k: number) => easeOut(span(t2, rowStart(k) + OPEN.drawDelay, OPEN.drawMs));
  const kindIn = appear(0);
  const titleIn = appear(1);
  const domainIn = appear(2);
  const grow = easeInOut(span(t2, rowStart(3) + OPEN.drawDelay, OPEN.growMs));
  const depsIn = appear(4);

  const P = at(O.pick, pickMap);
  const D = domainMap ? at(O.domain, domainMap) : O.domain;
  /* The light pool travels with its domain and settles to the map's. */
  if (pass === 'light') {
    if (domainIn > 0.004 && cluster) light(ctx, scene.sprites.get(inks.rest), D.x, D.y, lerp(O.light.r, cluster.footprint * 1.8, travel), 0.2 * domainIn);
    return;
  }
  /* Leaving lines, then the hairline of the row being read. */
  if (depsIn > 0 && linesLight > 0.004) {
    O.leaving.forEach((line, i) => {
      const grown = easeOut(span(t2, rowStart(4) + OPEN.drawDelay + i * OPEN.lineStep, OPEN.lineMs));
      if (grown <= 0) return;
      const pts = [line.from, { x: lerp(line.from.x, line.to.x, 0.5), y: lerp(line.from.y, line.to.y, 0.5) }, line.to];
      const len = polylineLength(pts);
      const path = ribbonPath(pts, (S.wide ? 4.2 : 2.8) * 1, 0, grown, true);
      const g = ctx.createLinearGradient(line.from.x, line.from.y, line.to.x, line.to.y);
      const fadeAt = line.named ? 1 : clamp01(1 - O.fadePx / Math.max(1, len));
      g.addColorStop(0, rgba(inks.arc, 0.92));
      g.addColorStop(fadeAt, rgba(inks.arc, line.named ? 0.92 : 0.6));
      g.addColorStop(1, rgba(inks.arc, line.named ? 0.92 : 0));
      ctx.globalAlpha = linesLight * (line.named ? 1 : 0.7);
      ctx.fillStyle = g;
      ctx.fill(path);
      ctx.globalAlpha = 1;
      scene.record?.set(`leave:${line.id}`, line.to.x, line.to.y, linesLight * grown);
      if (line.named && O.namedEnd) {
        const arrived = easeOut(span(t2, rowStart(4) + OPEN.drawDelay + i * OPEN.lineStep + OPEN.lineMs * 0.6, 240)) * linesLight;
        if (arrived > 0.004) {
          const E = O.namedEnd;
          ctx.globalAlpha = arrived;
          capMark(ctx, scene, E.at.x, E.at.y, E.r, inks.rest);
          if (E.label) stamps.draw(ctx, vault.byId.get(E.id)!.label, E.label.x, E.label.y, E.font, inks.name, { halo: inks.halo, align: E.align });
          ctx.globalAlpha = 1;
          scene.record?.set(`named:${E.id}`, E.at.x, E.at.y, arrived);
        }
      }
    });
  }
  const rows = O.lines.filter((l) => l.role !== 'rule');
  for (let k = 0; k < rows.length; k += 1) {
    const hi = rowHighlight(t2, k, rows.length) * linesLight;
    if (hi <= 0.004) continue;
    const grown = easeOut(span(t2, rowStart(k), OPEN.hairMs));
    const line = rows[k]!;
    const from = { x: Math.min(O.panel.r - 8, line.end + 12), y: line.y };
    const to = hairTarget(O, k, lerp(O.pickR0, O.pickR1, grow));
    const c1 = { x: from.x + (to.x - from.x) * 0.5, y: from.y };
    const pts: Pt[] = [];
    for (let i = 0; i <= 24; i += 1) pts.push(quadAt(from, c1, to, i / 24));
    const part = subPolyline(pts, 0, grown);
    if (part.length < 2) continue;
    ctx.globalAlpha = 0.45 * hi;
    ctx.strokeStyle = inks.arc;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(part[0]!.x, part[0]!.y);
    for (const p of part) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  /* The stem between the domain and the pick. */
  const pickR = lerp(lerp(O.pickR0, O.pickR1, grow), pickMap.r, travel);
  const domainScale = lerp(O.zoom, 1, travel);
  if (domainIn > 0.004) {
    const dx = P.x - D.x;
    const dy = P.y - D.y;
    const d = Math.hypot(dx, dy) || 1;
    const dr = S.domainR * domainScale + 2;
    ctx.globalAlpha = domainIn * lerp(0.4, 0.24, travel);
    ctx.strokeStyle = mix(inks.name, inks.rest, 1 - travel);
    ctx.lineWidth = lerp(1.5, 1, travel);
    ctx.beginPath();
    ctx.moveTo(D.x + (dx / d) * dr, D.y + (dy / d) * dr);
    ctx.lineTo(P.x - (dx / d) * (pickR + 2), P.y - (dy / d) * (pickR + 2));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  /* The pick's dots leave its rim one after another; three turn the dependency ink. */
  const own = new Set(O.ownNeeds);
  O.dots.forEach((d0, k) => {
    const out = easeOut(span(t2, rowStart(3) + OPEN.drawDelay + k * OPEN.dotStep, OPEN.dotMs));
    if (out <= 0.004) return;
    const angle = Math.atan2(d0.y - O.pick.y, d0.x - O.pick.x);
    const rim = { x: O.pick.x + Math.cos(angle) * pickR, y: O.pick.y + Math.sin(angle) * pickR };
    const close = { x: lerp(rim.x, d0.x, out), y: lerp(rim.y, d0.y, out) };
    const e = node.elements[k]!;
    const target = map.marks.get(e);
    const p = at(close, target);
    const lit = own.has(k) ? depsIn * (1 - travel) : 0;
    const ink = mix(inks.arc, inks.rest, lit);
    if (lit > 0.004) {
      ctx.globalAlpha = 0.8 * lit;
      ctx.strokeStyle = inks.arc;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(P.x + Math.cos(angle) * (pickR + 2), P.y + Math.sin(angle) * (pickR + 2));
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = out;
    dot(ctx, p.x, p.y, lerp(O.dotR, S.elemR, travel), ink);
    ctx.globalAlpha = 1;
    scene.record?.set(e, p.x, p.y, out);
  });
  if (domainIn > 0.004 && node.domain) {
    ctx.globalAlpha = domainIn;
    domainMark(ctx, scene, D.x, D.y, domainScale, mix(inks.name, inks.rest, 1 - travel));
    ctx.globalAlpha = 1;
    scene.record?.set(node.domain, D.x, D.y, domainIn);
  }
  if (kindIn > 0.004) {
    ctx.globalAlpha = kindIn;
    capMark(ctx, scene, P.x, P.y, pickR, mix(inks.strong, inks.rest, 1 - travel));
    ctx.globalAlpha = 1;
    scene.record?.set(pick, P.x, P.y, kindIn);
  }
  /* Names of the close-up: they hand over to the map's names as the fragment settles. */
  const pn = titleIn * namesLight;
  if (pn > 0.004) {
    ctx.globalAlpha = pn;
    stamps.draw(ctx, node.label, P.x + (O.pickName.x - O.pick.x), P.y + (O.pickName.y - O.pick.y), O.pickName.font, inks.strong, { halo: inks.halo });
    ctx.globalAlpha = 1;
    scene.record?.set('open:pickName', P.x, P.y, pn);
  }
  const dn = domainIn * namesLight;
  if (dn > 0.004 && node.domain) {
    ctx.globalAlpha = dn;
    stamps.draw(ctx, vault.byId.get(node.domain)!.label, D.x, D.y + (O.domainName.y - O.domain.y), O.domainName.font, inks.strong, { halo: inks.halo, align: 'center' });
    ctx.globalAlpha = 1;
    scene.record?.set('open:domainName', D.x, D.y, dn);
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Acts 3 and 4: the map                                                                        */
/* ------------------------------------------------------------------------------------------ */

interface MapState {
  /** Act 3 time, past its end through act 4. */
  t3: number;
  /** Act 4 time; negative before act 4. */
  t4: number;
}

/** A concept's mark position, radius and light in act 3 or 4; null while it has not appeared. */
function markAt(scene: FilmScene, id: string, st: MapState): { x: number; y: number; light: number } | null {
  const m = scene.map.marks.get(id)!;
  if (scene.fragment.has(id)) return st.t3 < FLIGHT.travelFrom + scene.travelMs ? null : { x: m.x, y: m.y, light: 1 };
  const plan = scene.flights.get(id);
  if (!plan) return { x: m.x, y: m.y, light: 1 };
  if (st.t3 < plan.start) return null;
  const f = flight(st.t3, plan.start, plan.ms);
  if (f.p >= 1) return { x: m.x, y: m.y, light: 1 };
  const c = bowControl(plan.from, m, FLIGHT.bow * plan.side);
  const p = quadAt(plan.from, c, m, f.p);
  return { x: p.x, y: p.y, light: f.mark };
}

/** When a hub's flight lands, so its light and name can follow. */
function landedAt(scene: FilmScene, id: string): number {
  const plan = scene.flights.get(id);
  if (scene.fragment.has(id)) return FLIGHT.travelFrom + scene.travelMs;
  return plan ? plan.start + plan.ms : 0;
}

function paintMap(ctx: CanvasRenderingContext2D, scene: FilmScene, st: MapState) {
  const { map, inks, vault } = scene;
  const S = map.sizes;
  const lit = map.lit;
  const t4 = st.t4;
  const pick = map.pick;
  const pickNode = pick ? vault.byId.get(pick)! : null;
  const pickDomain = pickNode?.domain ?? null;
  const selected = lit && t4 >= 0 ? easeOut(span(t4, LIT.selectFrom, LIT.selectMs)) : 0;
  const sinkT = lit && t4 >= 0 ? easeInOut(span(t4, LIT.sinkFrom, LIT.sinkMs)) : 0;
  const sinkShare = 1 - (1 - scene.sink) * sinkT;
  const endLight = new Map<string, number>();
  const litStarts = new Map<string, number>();
  if (lit) {
    for (const plan of scene.lit) {
      const arrive = span(t4, plan.start + LIT.lineMs * 0.7, LIT.endMs);
      endLight.set(plan.line.end, Math.max(endLight.get(plan.line.end) ?? 0, t4 >= 0 ? easeOut(arrive) : 0));
      litStarts.set(plan.line.end, plan.start);
    }
  }
  const ownerLight = new Map<string, number>();
  if (lit) {
    for (const id of lit.owners) {
      const ends = vault.byId.get(id)!.elements.filter((e) => endLight.has(e));
      ownerLight.set(id, Math.max(0, ...ends.map((e) => endLight.get(e)!)));
    }
  }
  /** How much of its own ink a concept keeps: 1 at rest, the sink for unrelated clusters while lit. */
  const keep = (id: string, domain: string | null) => {
    if (!lit || domain === pickDomain || domain === null) return 1;
    const end = endLight.get(id) ?? 0;
    const owner = ownerLight.get(id) ?? 0;
    const base = sinkShare;
    return Math.max(base, lerp(base, 1, end), lerp(base, 0.6, owner));
  };

  /* Lights: one pool per cluster, the pick's turning to the project's ink when selected. */
  for (const c of map.clusters) {
    const landed = landedAt(scene, c.id);
    const grown = scene.fragment.has(c.id) ? 1 : easeOut(span(st.t3, landed, FLIGHT.poolMs));
    if (grown <= 0.004) continue;
    const at = scene.fragment.has(c.id) ? null : markAt(scene, c.id, st);
    const x = at?.x ?? c.x;
    const y = at?.y ?? c.y;
    const r = c.footprint * 1.8;
    const own = c.id === pickDomain;
    const share = own ? 1 : sinkShare;
    if (scene.fragment.has(c.id) && st.t3 < FLIGHT.travelFrom + scene.travelMs) continue;
    light(ctx, scene.sprites.get(inks.rest), x, y, r, 0.2 * grown * share * (own ? 1 - selected : 1));
    if (own && selected > 0) light(ctx, scene.sprites.get(inks.project), x, y, r, 0.2 * selected);
  }

  /* Rest arcs: grown from the depending domain, a numeral at the middle. */
  const arcLight = lit && t4 >= 0 ? lerp(1, 0.24, sinkT) : 1;
  scene.arcs.forEach((plan) => {
    const arc = map.restArcs[plan.index]!;
    const grown = easeOut(span(st.t3, plan.start, FLIGHT.arcMs));
    if (grown <= 0) return;
    const a = arc.pts[0]!;
    const b = arc.pts[arc.pts.length - 1]!;
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    g.addColorStop(0, rgba(inks.rest, 0));
    g.addColorStop(clamp01(RIBBON_FADE_PX / len), rgba(inks.rest, 0.5));
    g.addColorStop(1, rgba(inks.rest, 0.5));
    ctx.globalAlpha = arcLight;
    ctx.fillStyle = g;
    ctx.fill(grown >= 1 ? plan.path : ribbonPath(arc.pts, arc.width, 0, grown, true));
    ctx.globalAlpha = 1;
  });

  /* Membership stems. */
  ctx.lineWidth = 1;
  for (const stem of map.stems) {
    const A = map.marks.get(stem.from);
    const B = map.marks.get(stem.to);
    if (!A || !B) continue;
    const fromFragment = scene.fragment.has(stem.from) && scene.fragment.has(stem.to);
    if (fromFragment && st.t3 < FLIGHT.travelFrom + scene.travelMs) continue;
    const show = fromFragment ? 1 : easeOut(span(st.t3, FLIGHT.namesFrom, FLIGHT.namesMs));
    if (show <= 0.004) continue;
    const domain = B.domain;
    const own = lit && domain === pickDomain && stem.from !== vault.project?.id;
    const ink = own && selected > 0 ? mix(inks.project, inks.rest, selected) : inks.rest;
    const k = stem.from === vault.project?.id ? (domain === pickDomain ? 1 : sinkShare) : keep(B.id, domain);
    const ax = B.x - A.x;
    const ay = B.y - A.y;
    const d = Math.hypot(ax, ay) || 1;
    const ra = (A.kind === 'project' ? A.r * 1.35 : A.r) + 1;
    const rb = (B.id === pick && selected > 0 ? lerp(B.r, lit!.agentR, selected) : B.r) + 1;
    if (d <= ra + rb) continue;
    ctx.globalAlpha = stem.alpha * show * k;
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(A.x + (ax / d) * ra, A.y + (ay / d) * ra);
    ctx.lineTo(B.x - (ax / d) * rb, B.y - (ay / d) * rb);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* Lit lines. */
  if (lit && t4 >= 0) {
    for (const plan of scene.lit) {
      const grown = easeOut(span(t4, plan.start, LIT.lineMs));
      if (grown <= 0) continue;
      const { line } = plan;
      if (line.kind === 'own') {
        const part = subPolyline(line.pts, 0, grown);
        if (part.length < 2) continue;
        ctx.globalAlpha = 0.92;
        ctx.strokeStyle = inks.arc;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(part[0]!.x, part[0]!.y);
        ctx.lineTo(part[part.length - 1]!.x, part[part.length - 1]!.y);
        ctx.stroke();
      } else if (line.kind === 'relates') {
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = inks.strong;
        ctx.beginPath();
        const shown = Math.floor(plan.dots.length * grown);
        for (let i = 0; i < shown; i += 1) {
          const p = plan.dots[i]!;
          ctx.moveTo(p.x + line.width, p.y);
          ctx.arc(p.x, p.y, line.width, 0, TAU);
        }
        ctx.fill();
      } else {
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = line.kind === 'needs' ? inks.arc : inks.reach;
        ctx.fill(grown >= 1 && plan.path ? plan.path : ribbonPath(line.pts, line.width, 0, grown, !line.towardPick));
      }
      ctx.globalAlpha = 1;
      scene.record?.set(`lit:${line.end}`, line.pts[line.pts.length - 1]!.x, line.pts[line.pts.length - 1]!.y, grown);
    }
  }

  /* Marks: elements, capabilities, domains, the project. */
  const selR = lit ? lerp(map.marks.get(lit.pick)!.r, lit.selectedR, selected) : 0;
  const drawConcept = (id: string) => {
    const m = map.marks.get(id)!;
    const at = markAt(scene, id, st);
    if (!at || at.light <= 0.004) return;
    let x = at.x;
    let y = at.y;
    const k = keep(id, m.domain);
    const end = endLight.get(id) ?? 0;
    let ink = mix(inks.rest, inks.ground, k);
    if (end > 0) ink = mix(inks.strong, ink, end);
    if (lit && id !== pick && m.domain === pickDomain && m.kind === 'domain' && selected > 0) ink = mix(inks.project, inks.rest, selected);
    if (m.kind === 'element') {
      const ownDot = lit?.ownDots.get(id);
      let r = m.r;
      if (ownDot && selected > 0) {
        x = lerp(x, ownDot.x, selected);
        y = lerp(y, ownDot.y, selected);
      }
      if (end > 0) r = lerp(m.r, m.r * 1.4, end);
      ctx.globalAlpha = at.light;
      dot(ctx, x, y, r, end > 0 && lit?.reach.ownNeeds.includes(id) ? mix(inks.arc, ink, end) : ink);
    } else if (m.kind === 'capability') {
      ctx.globalAlpha = at.light;
      if (id === pick && lit) capMark(ctx, scene, x, y, selR, mix(inks.project, ink, selected));
      else capMark(ctx, scene, x, y, m.r, ink);
    } else if (m.kind === 'domain') {
      ctx.globalAlpha = at.light;
      domainMark(ctx, scene, x, y, 1, ink);
    } else {
      ctx.globalAlpha = at.light;
      disc(ctx, x, y, m.r, S.domainRim, S.projectCore, inks.project, inks.discFill);
      ring(ctx, x, y, m.r * 1.35, 1.5, inks.project, at.light);
    }
    ctx.globalAlpha = 1;
    scene.record?.set(id, x, y, at.light);
  };
  for (const m of map.marks.values()) if (m.kind === 'element') drawConcept(m.id);
  for (const m of map.marks.values()) if (m.kind === 'capability') drawConcept(m.id);
  for (const m of map.marks.values()) if (m.kind === 'domain' || m.kind === 'project') drawConcept(m.id);

  /* The selection's rings, the agent's ring and its leader, and the glints. */
  if (lit && t4 >= 0) {
    const P = map.marks.get(lit.pick)!;
    const grow = 2 * (S.wide ? S.K : 0.84) * (1 - selected);
    ring(ctx, P.x, P.y, lit.rings[0] + grow, 1.5, inks.project, selected);
    ring(ctx, P.x, P.y, lit.rings[1] + grow, 1.5, inks.project, 0.5 * selected);
    const agent = easeOut(span(t4, LIT.agentFrom, LIT.ringMs));
    ring(ctx, P.x, P.y, lit.agentR + 6 * (S.wide ? S.K : 0.84) * (1 - agent), 1.5, inks.agent, agent);
    if (agent > 0) scene.record?.set('agentRing', P.x, P.y, agent);
    if (lit.leader) {
      const lead = easeOut(span(t4, LIT.leaderFrom, LIT.leaderMs));
      if (lead > 0) {
        const { from, to } = lit.leader;
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = inks.agent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(lerp(from.x, to.x, lead), lerp(from.y, to.y, lead));
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.lineCap = 'round';
    for (const plan of scene.lit) {
      if (plan.glint < 0) continue;
      const u = easeInOut(span(t4, LIT.glintFrom + plan.glint * LIT.glintStep, LIT.glintMs));
      if (u <= 0 || u >= 1) continue;
      const part = subPolyline(plan.line.pts, Math.max(0, u - LIT.glintShare), u);
      if (part.length < 2) continue;
      ctx.globalAlpha = 0.9 * (1 - u);
      ctx.strokeStyle = inks.agent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(part[0]!.x, part[0]!.y);
      for (const p of part) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.lineCap = 'butt';
  }

  /* Numerals on the rest arcs, then the names. */
  scene.arcs.forEach((plan) => {
    const arc = map.restArcs[plan.index]!;
    if (!arc.numeral) return;
    const shown = span(st.t3, plan.start + arcMidpointMs, FLIGHT.numeralMs) * (lit && t4 >= 0 ? 1 - sinkT : 1);
    if (shown <= 0.004) return;
    ctx.globalAlpha = shown;
    ctx.beginPath();
    ctx.arc(arc.numeral.x, arc.numeral.y, S.numeralR, 0, TAU);
    ctx.fillStyle = inks.ground;
    ctx.fill();
    scene.stamps.draw(ctx, String(arc.count), arc.numeral.x, arc.numeral.y + 0.5, `500 ${S.fNumeral}px ${scene.mono}`, inks.name, { align: 'center' });
    ctx.globalAlpha = 1;
    scene.record?.set(`numeral:${arc.from}>${arc.to}`, arc.numeral.x, arc.numeral.y, shown);
  });
  paintNames(ctx, scene, st, sinkT, selected, endLight, litStarts);

  if (lit && t4 >= 0) {
    const u = easeInOut(span(t4, 0, LIT.pointerMs));
    const from = { x: lit.pointer.x + 100, y: lit.pointer.y + 100 };
    const c = { x: lerp(from.x, lit.pointer.x, 0.5) + 18, y: lerp(from.y, lit.pointer.y, 0.5) - 6 };
    const p = quadAt(from, c, lit.pointer, u);
    const alpha = easeOut(span(t4, 0, LIT.pointerIn));
    pointer(ctx, scene, p, alpha);
    if (alpha > 0) scene.record?.set('pointer', p.x, p.y, alpha);
  }
}

function paintNames(
  ctx: CanvasRenderingContext2D,
  scene: FilmScene,
  st: MapState,
  sinkT: number,
  selected: number,
  endLight: Map<string, number>,
  litStarts: Map<string, number>,
) {
  const { map, vault } = scene;
  const lit = map.lit;
  const t4 = st.t4;
  const pickDomain = map.pick ? vault.byId.get(map.pick)!.domain : null;
  const isLit = Boolean(lit) && t4 >= 0;
  const blockIn = (id: string) => {
    if (scene.fragment.has(id)) return easeOut(span(st.t3, FLIGHT.travelFrom + scene.travelMs, FLIGHT.blockMs));
    return easeOut(span(st.t3, landedAt(scene, id), FLIGHT.blockMs));
  };
  const namesIn = easeOut(span(st.t3, FLIGHT.namesFrom, FLIGHT.namesMs));
  /* A context name the lit frame leaves out steps aside as the rest sinks. */
  const litKeys = lit ? new Set(lit.labels.map((label) => label.key)) : null;
  for (const label of map.restLabels) {
    let alpha = 1;
    if (label.role === 'domain' || label.role === 'units' || label.role === 'project') alpha = blockIn(label.id!);
    else alpha = namesIn;
    if (isLit) {
      if (label.role === 'cap' || !litKeys!.has(label.key)) alpha *= 1 - sinkT;
      else if ((label.role === 'domain' || label.role === 'units') && label.id !== pickDomain) {
        const floor = label.role === 'units' ? (map.sizes.wide ? 0.5 : 0) : scene.sink;
        alpha *= lerp(1, floor, sinkT);
      }
    }
    drawLabel(ctx, scene, label, alpha);
  }
  if (!lit || t4 < 0) return;
  void selected;
  for (const label of lit.labels) {
    if (label.role === 'domain' || label.role === 'units' || label.role === 'project') continue;
    let alpha = 0;
    let dy = 0;
    if (label.role === 'pick' || label.role === 'reach') {
      const v = easeOut(span(t4, LIT.blockFrom, LIT.blockMs));
      alpha = v;
      dy = (1 - v) * 4;
    } else if (label.role === 'agent' || label.role === 'tool') {
      alpha = easeOut(span(t4, map.sizes.wide ? LIT.tagFrom : LIT.agentFrom, LIT.tagMs));
    } else if (label.role === 'end' && label.id) {
      const start = litStarts.get(label.id) ?? LIT.linesFrom;
      alpha = easeOut(span(t4, start + LIT.lineMs * 0.7, LIT.endMs));
      void endLight;
    }
    drawLabel(ctx, scene, label, alpha, dy);
  }
  if (lit.keys.length) {
    lit.keys.forEach((key, i) => {
      const alpha = i === 0 ? easeOut(span(t4, LIT.blockFrom, LIT.blockMs)) : easeOut(span(t4, LIT.agentFrom, LIT.tagMs));
      ring(ctx, key.x, key.y, 5, 1.5, key.ink === 'project' ? scene.inks.project : scene.inks.agent, alpha);
    });
  }
}

/** Act 3's flying names: each leaves its row and shrinks away as its mark appears. */
function paintFlights(ctx: CanvasRenderingContext2D, scene: FilmScene, t3: number) {
  const { stamps, inks, wall } = scene;
  for (const plan of scene.flights.values()) {
    if (t3 < plan.start) continue;
    const f = flight(t3, plan.start, plan.ms);
    if (f.name <= 0.004) continue;
    const m = scene.map.marks.get(plan.id)!;
    let p = plan.from;
    if (!plan.dropText) p = quadAt(plan.from, bowControl(plan.from, m, FLIGHT.bow * plan.side), m, f.p);
    const alpha = f.name * plan.rowAlpha;
    ctx.globalAlpha = alpha;
    stamps.draw(ctx, plan.text, p.x, p.y, wall.font, inks.tertiary, { align: 'center', scale: plan.dropText ? 1 : f.scale });
    ctx.globalAlpha = 1;
    scene.record?.set(`fly:${plan.id}`, p.x, p.y, alpha);
  }
}

/* ------------------------------------------------------------------------------------------ */
/* One frame                                                                                    */
/* ------------------------------------------------------------------------------------------ */

/**
 * The film at film time `T` (ms, running on through the hold). Every place, size and light is a
 * function of `T`, so the act bar's jumps and the loop land on exact frames.
 */
export function paintFilm(ctx: CanvasRenderingContext2D, scene: FilmScene, T: number, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  const t = Math.min(T, FILM_MS);
  const t1 = local(t, 0);
  const t2 = local(t, 1);
  const t3 = local(t, 2);
  const t4 = local(t, 3);
  const { wall } = scene;
  const pickRow = wall.pickRow >= 0 ? wall.rows[wall.pickRow]! : null;
  const isPickRow = (row: PlacedRow) => row === pickRow;
  const scroll = wall.window ? wall.scrollTo * phoneScroll(Math.min(t1, ACT_START[1]!)) : 0;

  if (t2 < 0) {
    paintWall(ctx, scene, t1, 1, (row) => (isPickRow(row) ? 0 : 1));
    if (pickRow) {
      const col = wall.window ? { alpha: easeOut(span(t1, 0, WALL.phoneIn)), rise: 0 } : wallColumn(t1, pickRow.col);
      const chip = chipIn(t1);
      if (wall.chip && chip > 0.004) {
        ctx.globalAlpha = chip * col.alpha;
        roundRect(ctx, { l: wall.chip.l, t: wall.chip.t - scroll + col.rise, r: wall.chip.r, b: wall.chip.b - scroll + col.rise }, wall.chip.radius);
        ctx.fillStyle = rgba(scene.inks.primary, 0.06);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(scene.inks.primary, 0.14);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const edge = wall.window ? rowOnPhone(wall, pickRow, scroll).alpha : 1;
      ctx.globalAlpha = col.alpha * edge;
      scene.stamps.draw(ctx, pickRow.text, pickRow.x, pickRow.y - scroll + col.rise, wall.font, mix(scene.inks.primary, scene.inks.tertiary, chip));
      ctx.globalAlpha = 1;
      scene.record?.set('file', pickRow.x, pickRow.y - scroll + col.rise, col.alpha * edge);
    }
    return;
  }
  const notPick = (row: PlacedRow) => (isPickRow(row) ? 0 : 1);
  if (t3 < 0) {
    const wallOut = 1 - easeOut(span(t2, 0, OPEN.wallOutMs));
    paintWall(ctx, scene, ACT_START[1]! - 1, wallOut, notPick);
    const open = easeInOutSine(span(t2, 0, OPEN.morphMs));
    paintChipOrPanel(ctx, scene, open, 1, 1, t2, scroll);
    paintFragment(ctx, scene, t2, 1, 0, 1, 'light');
    paintFragment(ctx, scene, t2, 1, 0, 1, 'marks');
    return;
  }
  /* Act 3 onward: the wall returns at half light and its files fly to the map. */
  const fold = easeInOutSine(span(t3, 0, FLIGHT.foldMs));
  const actTwoEnd = ACT_START[2]! - ACT_START[1]!;
  const travel = easeInOut(span(t3, FLIGHT.travelFrom, scene.travelMs));
  const linesLight = 1 - span(t3, 0, FLIGHT.fragmentOutMs);
  const namesLight = 1 - easeInOut(span(t3, FLIGHT.travelFrom, 300));
  const travelling = scene.open && scene.map.pick && t3 < FLIGHT.travelFrom + scene.travelMs;
  if (t4 < 0) {
    const back = 0.5 * easeOut(span(t3, 0, FLIGHT.foldMs));
    /* Folders and the files already in the close-up leave as the map fills. */
    const leaving = 1 - easeInOut(span(t3, 1400, 600));
    paintWall(
      ctx,
      scene,
      ACT_START[1]! - 1,
      back,
      (row) => {
        if (isPickRow(row)) return 0;
        const id = row.row.id;
        if (id === null || scene.fragment.has(id) || !scene.flights.has(id)) return leaving;
        return t3 >= scene.flights.get(id)!.start ? 0 : 1;
      },
      false,
    );
    const chipLight = 1 - easeInOut(span(t3, FLIGHT.foldMs, 400));
    paintChipOrPanel(ctx, scene, 1 - fold, chipLight, 1 - fold, actTwoEnd, scroll);
  }
  if (travelling) paintFragment(ctx, scene, actTwoEnd, linesLight, travel, namesLight, 'light');
  paintMap(ctx, scene, { t3, t4 });
  if (travelling) paintFragment(ctx, scene, actTwoEnd, linesLight, travel, namesLight, 'marks');
  if (t4 < 0) paintFlights(ctx, scene, t3);
}
