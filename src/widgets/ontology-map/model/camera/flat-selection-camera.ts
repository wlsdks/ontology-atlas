import type { CameraTarget } from "../../engine/camera";

/** A selection made on the canvas: a click, a double-click or an arrow key. A selection from outside the canvas has no source. */
export type SelectionSource = "canvas-click" | "canvas-dblclick" | "arrow";

/**
 * The camera a flat selection moved from (`restore`) and settled on (`landed`), with the reader's
 * gesture count at that moment. A deselect returns to `restore` only while the view still sits at
 * `landed` and the reader has not panned or zoomed since: a view the reader moved is never taken back.
 */
export interface SelectionCamera {
  slug: string;
  framed: boolean;
  restore: CameraTarget;
  landed: CameraTarget;
  gesture: number;
  /** The chain began on a selection the page arrived with, so there is no earlier view to return to. */
  arrived?: boolean;
}

/** Room inside the free canvas for the node's disc, ring and the start of its name. */
export const SELECTION_NUDGE_MARGIN_PX = 64;

export function sameCameraTarget(a: CameraTarget, b: CameraTarget): boolean {
  return Math.abs(a.tx - b.tx) < 0.01 && Math.abs(a.ty - b.ty) < 0.01 && Math.abs(a.tscale - b.tscale) < 1e-4;
}

function untouched(memory: SelectionCamera, current: CameraTarget, gesture: number): boolean {
  return memory.gesture === gesture && sameCameraTarget(current, memory.landed);
}

/**
 * The sideways slide, at the same scale, that brings the node's screen x inside the free span the
 * panels leave; null when it already sits there or the span is too narrow to promise anything.
 */
export function selectionNudgeTarget(
  camera: CameraTarget,
  node: { x: number },
  viewportWidth: number,
  insets: { left: number; right: number },
  margin: number | { left: number; right: number } = SELECTION_NUDGE_MARGIN_PX,
): CameraTarget | null {
  const lo = insets.left + (typeof margin === "number" ? margin : margin.left);
  const hi = viewportWidth - insets.right - (typeof margin === "number" ? margin : margin.right);
  if (hi <= lo) return typeof margin === "number" ? null : selectionNudgeTarget(camera, node, viewportWidth, insets);
  const sx = (node.x - camera.tx) * camera.tscale + viewportWidth / 2;
  const shift = sx < lo ? sx - lo : sx > hi ? sx - hi : 0;
  if (Math.abs(shift) <= 0.5) return null;
  return { tx: camera.tx + shift / camera.tscale, ty: camera.ty, tscale: camera.tscale };
}

/** A mark a selection frames: its world centre and the screen box, around that centre, it may cover. */
export interface FramedMark { x: number; y: number; box: { minX: number; maxX: number; minY: number; maxY: number } }

/** Canvas pixels of the map no panel, tool row or key covers. */
export interface FreeMapRect { minX: number; minY: number; maxX: number; maxY: number }

/** Bisection steps for the zoom-out: 2^-30 of the band is far below a pixel. */
const FIT_STEPS = 30;

function spanAt(marks: readonly FramedMark[], scale: number, axis: "x" | "y"): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const m of marks) {
    const at = m[axis] * scale;
    lo = Math.min(lo, at + (axis === "x" ? m.box.minX : m.box.minY));
    hi = Math.max(hi, at + (axis === "x" ? m.box.maxX : m.box.maxY));
  }
  return { lo, hi };
}

function fitsAt(marks: readonly FramedMark[], scale: number, width: number, height: number): boolean {
  const x = spanAt(marks, scale, "x");
  const y = spanAt(marks, scale, "y");
  return x.hi - x.lo <= width && y.hi - y.lo <= height;
}

/**
 * The shift along one axis that brings `span` inside `[lo, hi]` and moves least; when it cannot fit,
 * `anchor` is kept inside and the span centred around it as far as that allows; when the anchor cannot
 * fit either, it is centred with its own `centre` (the selection's disc) still inside.
 */
function leastShift(span: { lo: number; hi: number }, anchor: { lo: number; hi: number }, centre: number, lo: number, hi: number): number {
  const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
  if (lo - span.lo <= hi - span.hi) return clamp(0, lo - span.lo, hi - span.hi);
  const centred = (lo + hi) / 2 - (span.lo + span.hi) / 2;
  if (lo - anchor.lo <= hi - anchor.hi) return clamp(centred, lo - anchor.lo, hi - anchor.hi);
  return clamp((lo + hi) / 2 - (anchor.lo + anchor.hi) / 2, lo - centre, hi - centre);
}

/** Relative scale difference below which two frames are at the same zoom. */
const SAME_SCALE = 1e-6;

/** Zoom samples per octave in the zoom-in search, then bisection steps toward the first best sample. */
const ZOOM_SAMPLES_PER_OCTAVE = 8;
const ZOOM_REFINE_STEPS = 4;
const MIN_ZOOM_IN = 2 ** (1 / ZOOM_SAMPLES_PER_OCTAVE);

/**
 * Whether a zoom from `from` to `to` is worth taking: a sample step or more, or any zoom that
 * improves a judgment ahead of the last score entry (a count, which grid rounding can nudge, so a
 * later frame would step again for it).
 */
function zoomEarns(zoom: SelectionZoomIn, from: number, to: number): boolean {
  if (to <= from) return false;
  if (to >= from * MIN_ZOOM_IN || zoom.readsAt(to)) return true;
  return compareScores(zoom.scoreAt(to).slice(0, -1), zoom.scoreAt(from).slice(0, -1)) > 0;
}

/** Bisection steps for the zoom-in's fit cap: 2^-8 of the band is under a pixel at map sizes. */
const ZOOM_FIT_STEPS = 8;

/**
 * What a selection's zoom-in may do: whether a zoom reads clear (short of that, a zoom under a
 * sample step is not taken), how far it may reach, how well a zoom reads (scores compared entry by entry, higher better), and
 * the marks that must stay framed there, the selection first, names on the sides they take there.
 */
export interface SelectionZoomIn {
  maxScale: number;
  readsAt(scale: number): boolean;
  scoreAt(scale: number): readonly number[];
  marksAt(scale: number): readonly FramedMark[];
}

function compareScores(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

/**
 * The camera at `scale` that keeps the selection's screen point from `camera` and then pans `marks`
 * in by the least move. `anchor` is the selection with its name on the side it takes, when known:
 * a span too wide to fit then keeps that side inside, not every side the name might take.
 */
function framedAt(
  camera: CameraTarget, marks: readonly FramedMark[], scale: number, viewport: { width: number; height: number }, free: FreeMapRect, margin: number,
  anchor: FramedMark = marks[0]!,
): CameraTarget {
  const tx0 = anchor.x - ((anchor.x - camera.tx) * camera.tscale) / scale;
  const ty0 = anchor.y - ((anchor.y - camera.ty) * camera.tscale) / scale;
  const toScreenX = viewport.width / 2 - tx0 * scale;
  const toScreenY = viewport.height / 2 - ty0 * scale;
  const shifted = (span: { lo: number; hi: number }, by: number) => ({ lo: span.lo + by, hi: span.hi + by });
  const dx = leastShift(shifted(spanAt(marks, scale, "x"), toScreenX), shifted(spanAt([anchor], scale, "x"), toScreenX), anchor.x * scale + toScreenX, free.minX + margin, free.maxX - margin);
  const dy = leastShift(shifted(spanAt(marks, scale, "y"), toScreenY), shifted(spanAt([anchor], scale, "y"), toScreenY), anchor.y * scale + toScreenY, free.minY + margin, free.maxY - margin);
  return { tx: tx0 - dx / scale, ty: ty0 - dy / scale, tscale: scale };
}

/**
 * The smallest scale in `[from, cap]` where `holds` with the best score `zoom` gives there; `from`
 * when no zoom scores better, so no zoom is spent for nothing. Bounded: 1 + ZOOM_SAMPLES_PER_OCTAVE
 * × octaves to the cap + ZOOM_REFINE_STEPS calls of `scoreAt`, and of `holds` at most as many.
 */
function bestScale(from: number, cap: number, zoom: SelectionZoomIn, holds: (scale: number) => boolean): number {
  let best = zoom.scoreAt(from);
  let bestAt = from;
  let below = from;
  let previous = from;
  for (let k = 1; previous < cap; k += 1) {
    const s = Math.min(cap, from * 2 ** (k / ZOOM_SAMPLES_PER_OCTAVE));
    const score = zoom.scoreAt(s);
    if (compareScores(score, best) > 0 && holds(s)) {
      best = score;
      bestAt = s;
      below = previous;
    }
    previous = s;
  }
  if (bestAt === from) return from;
  for (let i = 0; i < ZOOM_REFINE_STEPS; i += 1) {
    const mid = (below + bestAt) / 2;
    if (compareScores(zoom.scoreAt(mid), best) >= 0 && holds(mid)) bestAt = mid;
    else below = mid;
  }
  return bestAt;
}

/** The camera at `scale` that puts the centre of `marks` on the centre of the free map. */
function centredAt(marks: readonly FramedMark[], scale: number, viewport: { width: number; height: number }, free: FreeMapRect): CameraTarget {
  const mid = (span: { lo: number; hi: number }, lo: number, hi: number, half: number) => ((span.lo + span.hi) / 2 + half - (lo + hi) / 2) / scale;
  return {
    tx: mid(spanAt(marks, scale, "x"), free.minX, free.maxX, viewport.width / 2),
    ty: mid(spanAt(marks, scale, "y"), free.minY, free.maxY, viewport.height / 2),
    tscale: scale,
  };
}

/** A far end of the selection's lines as a mark the frame keeps on the free map itself, not `margin` inside it. */
function heldEnd(end: { x: number; y: number }, margin: number): FramedMark {
  return { x: end.x, y: end.y, box: { minX: margin, maxX: -margin, minY: margin, maxY: -margin } };
}

/** How far past the free map's edge a far end still counts as shown, px: a landing clamps held ends onto the edge. */
const SHOWN_SLACK_PX = 0.5;

function shownAt(camera: CameraTarget, end: { x: number; y: number }, viewport: { width: number; height: number }, free: FreeMapRect): boolean {
  const x = (end.x - camera.tx) * camera.tscale + viewport.width / 2;
  const y = (end.y - camera.ty) * camera.tscale + viewport.height / 2;
  return x >= free.minX - SHOWN_SLACK_PX && x <= free.maxX + SHOWN_SLACK_PX && y >= free.minY - SHOWN_SLACK_PX && y <= free.maxY + SHOWN_SLACK_PX;
}

/**
 * The camera that frames a selection inside the free map, `margin` clear of every edge. `sets` go
 * from most to least wanted, each starting with the selection: the first that fits at the current
 * scale is panned in; when none fits but `zoom`'s marks do, with names on the sides they take,
 * those are; otherwise the last zooms out as little as it needs, never below `floorScale`. The
 * selection keeps its screen point through any zoom, and the pan is the least that frames. When
 * the panned view does not read clear, it then zooms in about the selection, in the same move, to
 * the smallest scale with the best score `zoom` gives, at most `zoom.maxScale`, as far as its
 * marks still fit and every one of `farEnds` the panned view shows stays on the free map. With
 * `zoom.maxScale` fixed, a frame applied to its own landing is null. Null when the view already
 * frames it.
 * O(marks + farEnds) per scale tried; the zoom-in adds at most ZOOM_FIT_STEPS + 1 fit probes and
 * one per score sample that improves.
 */
export function selectionFrameTarget(
  camera: CameraTarget,
  sets: readonly (readonly FramedMark[])[],
  viewport: { width: number; height: number },
  free: FreeMapRect,
  margin: number,
  floorScale: number,
  zoom: SelectionZoomIn | null = null,
  farEnds: readonly { x: number; y: number }[] = [],
): CameraTarget | null {
  const usable = sets.filter((set) => set.length > 0);
  const last = usable.at(-1);
  if (!last) return null;
  const width = free.maxX - free.minX - margin * 2;
  const height = free.maxY - free.minY - margin * 2;
  const now = camera.tscale;
  const fitsThere = (s: number) => fitsAt(zoom!.marksAt(s), s, width, height);
  const taken = (s: number) => zoom?.marksAt(s)[0];
  // The least wanted set, or the zoom's marks with names on the sides they take: what one scale frames.
  const lastAt = (s: number) => (fitsAt(last, s, width, height) || !zoom || !fitsThere(s) ? last : zoom.marksAt(s));
  const fitsLast = (s: number) => fitsAt(lastAt(s), s, width, height);
  // The zoom's marks rank right after the most wanted set: what the zoom keeps framed is never traded for less.
  const framesAt = (s: number) => (zoom ? [usable[0]!, zoom.marksAt(s), ...usable.slice(1)] : usable).find((set) => fitsAt(set, s, width, height));
  let marks = framesAt(now) ?? (fitsLast(now) ? lastAt(now) : undefined);
  let scale = now;
  if (!marks) {
    const floor = Math.min(now, floorScale);
    if (!fitsLast(floor)) scale = floor;
    else {
      let fits = floor;
      let fails = now;
      for (let i = 0; i < FIT_STEPS; i += 1) {
        const mid = (fits + fails) / 2;
        if (fitsLast(mid)) fits = mid;
        else fails = mid;
      }
      scale = fits;
    }
    marks = lastAt(scale);
  }
  let target = framedAt(camera, marks, scale, viewport, free, margin, taken(scale));
  const panned = target;
  const held = farEnds.filter((end) => shownAt(panned, end, viewport, free)).map((end) => heldEnd(end, margin));
  // Settled as a frame made at `s` settles it, so framing the landing again moves nothing.
  const settledAt = (s: number) => framesAt(s) ?? zoom!.marksAt(s);
  // Spans alone, so no pan changes it; the landing shows every end in `held`, so a frame of the
  // landing holds at least these and finds `holds` true where it stands, never zooming out.
  const holds = (s: number) => fitsThere(s) && (held.length === 0 || fitsAt([...settledAt(s), ...held], s, width, height));
  if (zoom && scale < zoom.maxScale && holds(scale)) {
    let cap = zoom.maxScale;
    if (!holds(cap)) {
      let fits = scale;
      let fails = cap;
      for (let i = 0; i < ZOOM_FIT_STEPS; i += 1) {
        const mid = (fits + fails) / 2;
        if (holds(mid)) fits = mid;
        else fails = mid;
      }
      cap = fits;
    }
    const best = cap > scale ? bestScale(scale, cap, zoom, holds) : scale;
    if (zoomEarns(zoom, scale, best)) target = framedAt(target, [...settledAt(best), ...held], best, viewport, free, margin, taken(best));
  }
  const moved = Math.abs((target.tx - camera.tx) * target.tscale) > 0.5 || Math.abs((target.ty - camera.ty) * target.tscale) > 0.5;
  return Math.abs(target.tscale - now) <= now * SAME_SCALE && !moved ? null : target;
}

/**
 * A domain selection's framing sets, most wanted first: its near set with every partner, then with
 * one fewer each time, the partner farthest from the selection dropped first, down to the near set
 * alone. O(partners²).
 */
export function reachFrameSets(near: readonly FramedMark[], partners: readonly FramedMark[]): FramedMark[][] {
  const at = near[0];
  if (!at) return [];
  const nearestFirst = [...partners].sort((p, q) => Math.hypot(p.x - at.x, p.y - at.y) - Math.hypot(q.x - at.x, q.y - at.y));
  const sets: FramedMark[][] = [];
  for (let kept = nearestFirst.length; kept >= 0; kept -= 1) sets.push([...near, ...nearestFirst.slice(0, kept)]);
  return sets;
}

/**
 * A domain's frame: the most wanted of `sets` it can hold, centred on the free map and `margin`
 * clear of every edge of it. It keeps the current zoom when that already holds the most wanted
 * set, zooms out as little as it needs toward `floorScale` while a wider set comes with it, and never zooms in.
 * Below `floorScale` nothing is gained that the overview does not already show, so the frame stops
 * there and pans the rest in. Null when the view already frames it.
 * O(sets × marks + marks × FIT_STEPS).
 */
export function reachFrameTarget(
  camera: CameraTarget,
  sets: readonly (readonly FramedMark[])[],
  viewport: { width: number; height: number },
  free: FreeMapRect,
  margin: number,
  floorScale: number,
): CameraTarget | null {
  const usable = sets.filter((set) => set.length > 0);
  const last = usable.at(-1);
  if (!last) return null;
  const width = free.maxX - free.minX - margin * 2;
  const height = free.maxY - free.minY - margin * 2;
  const now = camera.tscale;
  const floor = Math.min(now, floorScale);
  // A set that fits at one scale fits at every smaller one: spans grow with the scale, names do not.
  const wantedAt = (s: number) => usable.findIndex((set) => fitsAt(set, s, width, height));
  const reachable = wantedAt(floor);
  let wanted = wantedAt(now);
  let scale = now;
  if (reachable >= 0 && (wanted < 0 || reachable < wanted)) {
    let fits = floor;
    let fails = now;
    for (let i = 0; i < FIT_STEPS; i += 1) {
      const mid = (fits + fails) / 2;
      if (fitsAt(usable[reachable]!, mid, width, height)) fits = mid;
      else fails = mid;
    }
    scale = fits;
    wanted = reachable;
  } else if (wanted < 0) scale = floor;
  const held = usable[wanted] ?? last;
  // The reach is the whole picture, so it takes the middle of the free map rather than the least
  // move; one that outgrows the map keeps the selection inside instead.
  const target = wanted < 0 ? framedAt(camera, held, scale, viewport, free, margin) : centredAt(held, scale, viewport, free);
  const moved = Math.abs((target.tx - camera.tx) * target.tscale) > 0.5 || Math.abs((target.ty - camera.ty) * target.tscale) > 0.5;
  return Math.abs(target.tscale - now) <= now * SAME_SCALE && !moved ? null : target;
}

/**
 * The zoom a selection was made at: the reader's own view, shared by selections that follow one
 * another without a reader move, so reframing a landing never raises the selection's zoom cap.
 */
export function selectionZoomBase(memory: SelectionCamera | null, current: CameraTarget, gesture: number): number {
  return memory !== null && untouched(memory, current, gesture) ? memory.restore.tscale : current.tscale;
}

/** Selections that follow one another without a reader move share the view the first one left. */
export function recordSelectionCamera(
  memory: SelectionCamera | null,
  move: { slug: string; framed: boolean; current: CameraTarget; landed: CameraTarget; gesture: number; arrived?: boolean },
): SelectionCamera {
  const chained = memory !== null && untouched(memory, move.current, move.gesture);
  const restore = chained ? memory.restore : move.current;
  const arrived = chained ? memory.arrived === true : move.arrived === true;
  return { slug: move.slug, framed: move.framed, restore: { ...restore }, landed: { ...move.landed }, gesture: move.gesture, arrived };
}

export type DeselectCamera = { kind: "return"; target: CameraTarget } | { kind: "overview" } | { kind: "stay" };

/** `readerMoved` covers a selection no memory describes, such as a deep link framed on arrival. */
export function deselectCamera(
  memory: SelectionCamera | null,
  current: CameraTarget,
  gesture: number,
  readerMoved: boolean,
): DeselectCamera {
  if (memory === null) return readerMoved ? { kind: "stay" } : { kind: "overview" };
  if (!untouched(memory, current, gesture)) return { kind: "stay" };
  if (memory.arrived) return { kind: "overview" };
  return sameCameraTarget(current, memory.restore) ? { kind: "stay" } : { kind: "return", target: { ...memory.restore } };
}
