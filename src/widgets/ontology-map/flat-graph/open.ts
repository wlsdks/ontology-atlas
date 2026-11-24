import type { DialModel, Point } from "../dial/dial-shapes";
import { conceptLines } from "./attention";
import { graphDiscRadiusPx } from "./marks";
import type { FlatGraphLayout, FlatGraphPaintTokens } from "./flat-graph-shapes";

/** Air between the selection ring's clear line and the fan, so the column reads apart from the ring. */
const FAN_AIR_PX = 8;
/** How far past bare legibility the natural places must be before the fan has fully closed. */
const CLOSE_BAND = 1.25;

const FULL_TURN = 2 * Math.PI;
/** The most elements one column holds before the fan uses both sides: seven rows run about 130 px down. */
const ONE_COLUMN_MAX = 7;
/** How many times a dot's bare clearance from a line leaving the capability it keeps, so its name has a row as well. */
const ROOMY = 2;
/** A column slides down in fractions of a row: this many per row, at most two rows. */
const SLIDE_ROWS = 4;
const SLIDE_TRIES = 2 * SLIDE_ROWS;

const turnOf = (x: number, y: number) => (Math.atan2(y, x) + Math.PI / 2 + FULL_TURN) % FULL_TURN;

/** How many straight pieces a line leaving a capability is judged in: its bow bends less than a dot across each. */
const LINE_PIECES = 24;

const linePathCache = new WeakMap<FlatGraphLayout, Map<string, readonly (readonly Point[])[]>>();

/**
 * Each line leaving a capability's disc as the frame bows it, in world units from the capability's
 * centre, sampled along its curve; lines to its own elements are left out, since the fan's spokes
 * stand for those. O(relations × pieces) once per layout and capability.
 */
export function capabilityLinePaths(model: DialModel, layout: FlatGraphLayout, capabilityId: string, own: readonly string[], bow: number): readonly (readonly Point[])[] {
  let byId = linePathCache.get(layout);
  if (!byId) linePathCache.set(layout, (byId = new Map()));
  const known = byId.get(capabilityId);
  if (known) return known;
  const centre = layout.positions.get(capabilityId)!;
  const paths: Point[][] = [];
  for (const line of conceptLines(model.conceptRelations ?? [], capabilityId)) {
    const farId = line.from === capabilityId ? line.to : line.from;
    const far = layout.positions.get(farId) ?? layout.itemAt.get(farId);
    if (!far || own.includes(farId)) continue;
    const from = line.from === capabilityId ? centre : far;
    const to = line.from === capabilityId ? far : centre;
    // The curve's control point, as `arcPathInto` sets it.
    const cx = (from.x + to.x) / 2 - (to.y - from.y) * bow;
    const cy = (from.y + to.y) / 2 + (to.x - from.x) * bow;
    const path: Point[] = [];
    for (let k = 0; k <= LINE_PIECES; k += 1) {
      const u = k / LINE_PIECES;
      const a = (1 - u) * (1 - u);
      const m = 2 * (1 - u) * u;
      const c = u * u;
      path.push({ x: a * from.x + m * cx + c * to.x - centre.x, y: a * from.y + m * cy + c * to.y - centre.y });
    }
    paths.push(path);
  }
  byId.set(capabilityId, paths);
  return paths;
}

/** The least distance, in px, between a place and a line at `scale`. O(places × lines × pieces). */
export function lineClearancePx(places: Iterable<Point>, paths: readonly (readonly Point[])[], scale: number): number {
  let least = Infinity;
  for (const p of places) {
    for (const path of paths) {
      for (let k = 1; k < path.length; k += 1) {
        const ax = path[k - 1]!.x * scale;
        const ay = path[k - 1]!.y * scale;
        const dx = path[k]!.x * scale - ax;
        const dy = path[k]!.y * scale - ay;
        const length = dx * dx + dy * dy;
        const u = length === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - ax) * dx + (p.y - ay) * dy) / length));
        least = Math.min(least, Math.hypot(p.x - ax - u * dx, p.y - ay - u * dy));
      }
    }
  }
  return least;
}

/** How a capability's fan stands: the side its first column takes, and how many rows below level its columns start. */
interface FanStance { side: 1 | -1; drop: number }

const fanStanceCache = new WeakMap<FlatGraphLayout, Map<string, FanStance>>();

/** The columns a fan's elements fill: one down `side`, or the overflow down the other side. O(n log n). */
function fanColumns(natural: readonly { id: string; x: number; y: number }[], side: 1 | -1): { id: string; x: number; y: number }[][] {
  if (natural.length <= ONE_COLUMN_MAX) return [[...natural].sort(byRow), []];
  // The elements already leaning to the first column's side fill it; the rest take the other side.
  const leaning = [...natural].sort((a, b) => side * (b.x - a.x) || (a.id < b.id ? -1 : 1));
  const first = Math.ceil(natural.length / 2);
  return [leaning.slice(0, first).sort(byRow), leaning.slice(first).sort(byRow)];
}

const byRow = (a: { id: string; y: number }, b: { id: string; y: number }) => a.y - b.y || (a.id < b.id ? -1 : 1);


/** The height a fan's row takes: a name's spacing, and never less than a name with its padding. */
export function fanRowPx(tokens: Pick<FlatGraphPaintTokens, "elementNameSpacingPx" | "elementNamePx" | "namePadPx">): number {
  return Math.max(tokens.elementNameSpacingPx, tokens.elementNamePx + 2 * tokens.namePadPx);
}

/**
 * The screen box round a selected capability's centre that its fully opened fan's dots cover, on
 * both sides, so a camera framing the selection keeps the column in view wherever it stands. The
 * names beside the dots are the caller's to add. O(1).
 */
export function fanDotBox(count: number, tokens: FlatGraphPaintTokens, selectedRadiusPx: number): { reach: number; top: number; bottom: number } | null {
  if (count === 0) return null;
  const dotPx = Math.max(graphDiscRadiusPx("element", 0, tokens, 1), tokens.elementOpenMaxPx);
  const clearPx = selectedRadiusPx + tokens.selectedRingGapPx + tokens.selectedRingPx + dotPx + tokens.nameGapPx;
  const rows = count > ONE_COLUMN_MAX ? Math.ceil(count / 2) : count;
  // The column may slide its full reach down.
  const rowPx = fanRowPx(tokens);
  return { reach: clearPx + FAN_AIR_PX + dotPx, top: -dotPx, bottom: (rows - 1 + SLIDE_TRIES / SLIDE_ROWS) * rowPx + dotPx };
}

/** The sides a capability's fan takes once it has opened in this layout, null before it has. */
export function fanSidesOf(model: DialModel, layout: FlatGraphLayout, capabilityId: string): { right: boolean; left: boolean } | null {
  const stance = fanStanceCache.get(layout)?.get(capabilityId);
  if (!stance) return null;
  const count = model.capabilityById.get(capabilityId)?.elementIds.filter((id) => layout.positions.has(id)).length ?? 0;
  const both = count > ONE_COLUMN_MAX;
  return { right: both || stance.side === 1, left: both || stance.side === -1 };
}

/**
 * Each element's place for a stance: a straight column `apartPx` beside the disc, its rows `rowPx`
 * apart running down from the stance's drop, so every dot keeps its name on the outer side and the
 * wedge above the disc stays the selection's name's.
 */
function placesFor(columns: readonly (readonly { id: string }[])[], stance: FanStance, apartPx: number, rowPx: number, into: Map<string, Point>): Map<string, Point> {
  columns.forEach((column, c) => {
    const s = c === 0 ? stance.side : -stance.side;
    column.forEach((n, k) => into.set(n.id, { x: s * apartPx, y: (stance.drop + k) * rowPx }));
  });
  return into;
}

/**
 * How a capability's fan stands, judged once per layout and capability at the resting disc size
 * and the zoom it first opens at, so the fan holds its place through every zoom after. The first
 * column takes the side away from the capability's domain, so the column and its names never run
 * into the domain's title, and centres on the disc's level; where a dot would stand on a line
 * leaving the capability, the column slides along its arc, then tries the other side.
 * O(slides × n × lines × pieces).
 */
function fanStance(
  model: DialModel, layout: FlatGraphLayout, capabilityId: string, own: readonly string[], natural: readonly { id: string; x: number; y: number }[], tokens: FlatGraphPaintTokens, scale: number,
): FanStance {
  let byId = fanStanceCache.get(layout);
  if (!byId) fanStanceCache.set(layout, (byId = new Map()));
  const known = byId.get(capabilityId);
  if (known) return known;
  const centre = layout.positions.get(capabilityId)!;
  const domainId = model.domainOf.get(capabilityId) ?? null;
  const domain = domainId === null ? undefined : layout.positions.get(domainId);
  const outward = domain ? centre.x - domain.x : 0;
  const lean = natural.reduce((sum, n) => sum + n.x, 0);
  const away: 1 | -1 = (Math.abs(outward) > 1e-6 ? outward : lean) < 0 ? -1 : 1;
  const dotPx = Math.max(graphDiscRadiusPx("element", 0, tokens, 1), tokens.elementOpenMaxPx);
  const clearPx = tokens.selectedDiscPx + tokens.selectedRingGapPx + tokens.selectedRingPx + dotPx + tokens.nameGapPx;
  const rowPx = fanRowPx(tokens);
  const lines = capabilityLinePaths(model, layout, capabilityId, own, tokens.lineBow);
  // A dot this far off a line stands clear of it, with air for its name's row.
  const keep = (dotPx + tokens.lineTaperMaxPx) * ROOMY;
  let best: FanStance = { side: away, drop: 0 };
  if (lines.length > 0) {
    let bestClear = -1;
    const places = new Map<string, Point>();
    search: for (const side of [away, -away as 1 | -1]) {
      const columns = fanColumns(natural, side);
      // Level with the disc first, then a row's fraction further down at a time.
      for (let k = 0; k <= SLIDE_TRIES; k += 1) {
        const stance = { side, drop: k / SLIDE_ROWS };
        const clear = lineClearancePx(placesFor(columns, stance, clearPx + FAN_AIR_PX, rowPx, places).values(), lines, scale);
        if (clear > bestClear) {
          bestClear = clear;
          best = stance;
        }
        if (clear >= keep) break search;
      }
    }
  }
  byId.set(capabilityId, best);
  return best;
}

export interface OpenedElements {
  capabilityId: string;
  /** 1 while the elements stand fully fanned, falling to 0 as the zoom shows them apart on their own. */
  open: number;
  /** Each element's place in screen pixels from the capability's centre. */
  offsets: ReadonlyMap<string, Point>;
}

/**
 * A selected capability's elements stood in a column beside its disc, rows a name apart, clear of the
 * selection ring. Where the zoom already shows them that far apart they keep
 * their own places, and the fan closes smoothly as the zoom nears that. O(n²) over one capability's
 * elements, to find the tightest pair.
 */
export function openedElements(
  model: DialModel, layout: FlatGraphLayout, capabilityId: string | null, tokens: FlatGraphPaintTokens, selectedRadiusPx: number, scale: number, growth: number,
): OpenedElements | null {
  const capability = capabilityId === null ? undefined : model.capabilityById.get(capabilityId);
  const centre = capability && layout.positions.get(capability.id);
  if (!capability || !centre) return null;
  const natural: { id: string; x: number; y: number; turn: number }[] = [];
  for (const id of capability.elementIds) {
    const at = layout.positions.get(id);
    if (!at) continue;
    const x = (at.x - centre.x) * scale;
    const y = (at.y - centre.y) * scale;
    natural.push({ id, x, y, turn: turnOf(x, y) });
  }
  if (natural.length === 0) return null;
  // A selected capability's dots open up to their open maximum, so the fan clears the ring by that, not by the resting dot.
  const clearPx = selectedRadiusPx + tokens.selectedRingGapPx + tokens.selectedRingPx + Math.max(graphDiscRadiusPx("element", 0, tokens, growth), tokens.elementOpenMaxPx) + tokens.nameGapPx;
  const pitchPx = tokens.elementNameSpacingPx;
  let legible = Infinity;
  for (let i = 0; i < natural.length; i += 1) {
    legible = Math.min(legible, Math.hypot(natural[i]!.x, natural[i]!.y) / clearPx);
    for (let j = i + 1; j < natural.length; j += 1) legible = Math.min(legible, Math.hypot(natural[i]!.x - natural[j]!.x, natural[i]!.y - natural[j]!.y) / pitchPx);
  }
  const open = 1 - Math.min(1, Math.max(0, (legible - 1) / (CLOSE_BAND - 1)));
  if (open === 0) return null;

  const rowPx = fanRowPx(tokens);
  const stance = fanStance(model, layout, capability.id, capability.elementIds, natural, tokens, scale);
  const columns = fanColumns(natural, stance.side);
  const places = placesFor(columns, stance, clearPx + FAN_AIR_PX, rowPx, new Map());
  const offsets = new Map<string, Point>();
  for (const n of natural) {
    const place = places.get(n.id)!;
    // Distance and turn close apart, so a half-closed dot swings round the ring and never cuts across it.
    const swing = ((turnOf(place.x, place.y) - n.turn + Math.PI + FULL_TURN) % FULL_TURN) - Math.PI;
    const turn = n.turn + swing * open;
    const reach = Math.hypot(n.x, n.y);
    const at = reach + (Math.hypot(place.x, place.y) - reach) * open;
    offsets.set(n.id, { x: at * Math.sin(turn), y: -at * Math.cos(turn) });
  }
  return { capabilityId: capability.id, open, offsets };
}
