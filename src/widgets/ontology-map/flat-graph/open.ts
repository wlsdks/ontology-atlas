import type { DialModel, Point } from "../dial/types";
import { conceptLines } from "./attention";
import { graphDiscRadiusPx } from "./marks";
import type { FlatGraphLayout, FlatGraphPaintTokens } from "./types";

/** Half of the wedge above a selected capability that its name and reach line keep. */
const TITLE_WEDGE = (70 * Math.PI) / 180;
/** Air between the selection ring's clear line and the fan, so the dots read as a ring of their own. */
const FAN_AIR_PX = 8;
/** How far past bare legibility the natural places must be before the fan has fully closed. */
const CLOSE_BAND = 1.25;

/** How finely the fan's place along its arc is searched for one clear of the capability's lines. */
const SLIDE_STEP = (2 * Math.PI) / 180;
const FULL_TURN = 2 * Math.PI;
/** How many times a dot's bare clearance from a line the slide looks for, so the dot's name has a side as well. */
const ROOMY = 2;

const turnOf = (x: number, y: number) => (Math.atan2(y, x) + Math.PI / 2 + FULL_TURN) % FULL_TURN;

const lineTurnCache = new WeakMap<FlatGraphLayout, Map<string, readonly number[]>>();

/**
 * The turns at which a capability's own lines leave its disc, each bowed as the frame draws it;
 * lines to its own elements are left out, since the fan's spokes stand for those. O(relations)
 * once per layout and capability.
 */
export function capabilityLineTurns(model: DialModel, layout: FlatGraphLayout, capabilityId: string, own: readonly string[], bow: number): readonly number[] {
  let byId = lineTurnCache.get(layout);
  if (!byId) lineTurnCache.set(layout, (byId = new Map()));
  const known = byId.get(capabilityId);
  if (known) return known;
  const centre = layout.positions.get(capabilityId)!;
  const turns: number[] = [];
  for (const line of conceptLines(model.conceptRelations ?? [], capabilityId)) {
    const farId = line.from === capabilityId ? line.to : line.from;
    const far = layout.positions.get(farId) ?? layout.itemAt.get(farId);
    if (!far || own.includes(farId)) continue;
    const from = line.from === capabilityId ? centre : far;
    const to = line.from === capabilityId ? far : centre;
    // The curve's control point, as `arcPathInto` sets it: the line leaves the disc toward it.
    const cx = (from.x + to.x) / 2 - (to.y - from.y) * bow;
    const cy = (from.y + to.y) / 2 + (to.x - from.x) * bow;
    turns.push(turnOf(cx - centre.x, cy - centre.y));
  }
  byId.set(capabilityId, turns);
  return turns;
}

/** The least turn between any of `count` fan places from `first` and any line. O(count × lines). */
function clearance(first: number, step: number, count: number, lines: readonly number[]): number {
  let least = Infinity;
  for (let k = 0; k < count; k += 1) {
    for (const turn of lines) {
      const apart = Math.abs(first + k * step - turn) % FULL_TURN;
      least = Math.min(least, apart > Math.PI ? FULL_TURN - apart : apart);
    }
  }
  return least;
}

const fanMiddleCache = new WeakMap<FlatGraphLayout, Map<string, number>>();

/**
 * The turn a capability's fan is centred on: its elements' own mean direction, slid to the nearest
 * place where no dot stands on a line leaving the capability. It is judged once per layout and
 * capability at the resting disc size, so the fan holds its place through every zoom.
 * O(arc ÷ slide step × n × lines).
 */
function fanMiddle(
  model: DialModel, layout: FlatGraphLayout, capabilityId: string, own: readonly string[], natural: readonly { turn: number }[], tokens: FlatGraphPaintTokens,
): number {
  let byId = fanMiddleCache.get(layout);
  if (!byId) fanMiddleCache.set(layout, (byId = new Map()));
  const known = byId.get(capabilityId);
  if (known !== undefined) return known;
  const dotPx = graphDiscRadiusPx("element", 0, tokens, 1);
  const radius = Math.max(tokens.selectedDiscPx + tokens.selectedRingGapPx + tokens.selectedRingPx + dotPx + tokens.nameGapPx + FAN_AIR_PX, ((natural.length - 1) * tokens.elementNameSpacingPx) / (2 * (Math.PI - TITLE_WEDGE)));
  const step = natural.length > 1 ? Math.min((2 * (Math.PI - TITLE_WEDGE)) / (natural.length - 1), tokens.elementNameSpacingPx / radius) : 0;
  const width = step * (natural.length - 1);
  const last = FULL_TURN - TITLE_WEDGE - width;
  // A circular mean: elements either side of the top average to the top, not to the bottom.
  const mean = (Math.atan2(natural.reduce((sum, n) => sum + Math.sin(n.turn), 0), natural.reduce((sum, n) => sum + Math.cos(n.turn), 0)) + FULL_TURN) % FULL_TURN;
  const wanted = Math.min(last, Math.max(TITLE_WEDGE, mean - width / 2));
  const lines = capabilityLineTurns(model, layout, capabilityId, own, tokens.lineBow);
  const keep = (dotPx + tokens.lineTaperMaxPx) / radius;
  let first = wanted;
  let best = clearance(wanted, step, natural.length, lines);
  for (let slide = SLIDE_STEP; best < keep * ROOMY && slide <= last - TITLE_WEDGE; slide += SLIDE_STEP) {
    for (const at of [wanted - slide, wanted + slide]) {
      if (at < TITLE_WEDGE || at > last) continue;
      const clear = clearance(at, step, natural.length, lines);
      if (clear > best) {
        best = clear;
        first = at;
      }
    }
  }
  byId.set(capabilityId, first + width / 2);
  return first + width / 2;
}

export interface OpenedElements {
  capabilityId: string;
  /** 1 while the elements stand fully fanned, falling to 0 as the zoom shows them apart on their own. */
  open: number;
  /** Each element's place in screen pixels from the capability's centre. */
  offsets: ReadonlyMap<string, Point>;
}

/**
 * A selected capability's elements fanned round its disc so each stands a name's spacing from the
 * next and clear of the selection ring. Where the zoom already shows them that far apart they keep
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
  const clearPx = selectedRadiusPx + tokens.selectedRingGapPx + tokens.selectedRingPx + graphDiscRadiusPx("element", 0, tokens, growth) + tokens.nameGapPx;
  const pitchPx = tokens.elementNameSpacingPx;
  let legible = Infinity;
  for (let i = 0; i < natural.length; i += 1) {
    legible = Math.min(legible, Math.hypot(natural[i]!.x, natural[i]!.y) / clearPx);
    for (let j = i + 1; j < natural.length; j += 1) legible = Math.min(legible, Math.hypot(natural[i]!.x - natural[j]!.x, natural[i]!.y - natural[j]!.y) / pitchPx);
  }
  const open = 1 - Math.min(1, Math.max(0, (legible - 1) / (CLOSE_BAND - 1)));
  if (open === 0) return null;

  natural.sort((a, b) => a.turn - b.turn || (a.id < b.id ? -1 : 1));
  const arc = 2 * (Math.PI - TITLE_WEDGE);
  const gaps = natural.length - 1;
  const radius = Math.max(clearPx + FAN_AIR_PX, gaps > 0 ? (gaps * pitchPx) / arc : 0);
  const step = gaps > 0 ? Math.min(arc / gaps, pitchPx / radius) : 0;
  const width = step * gaps;
  const middle = fanMiddle(model, layout, capability.id, capability.elementIds, natural, tokens);
  const first = Math.min(FULL_TURN - TITLE_WEDGE - width, Math.max(TITLE_WEDGE, middle - width / 2));
  const offsets = new Map<string, Point>();
  natural.forEach((n, k) => {
    // Distance and turn close apart, so a half-closed dot swings round the ring and never cuts across it.
    const swing = ((first + k * step - n.turn + Math.PI + FULL_TURN) % FULL_TURN) - Math.PI;
    const turn = n.turn + swing * open;
    const reach = Math.hypot(n.x, n.y);
    const at = reach + (radius - reach) * open;
    offsets.set(n.id, { x: at * Math.sin(turn), y: -at * Math.cos(turn) });
  });
  return { capabilityId: capability.id, open, offsets };
}
