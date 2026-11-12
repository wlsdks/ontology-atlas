import type { CameraTarget } from "../../engine/camera";

/** A selection made on the canvas. Only a click selects in place; the rest, and any selection from outside the canvas, frame the node. */
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

/** The shift along one axis that brings `span` inside `[lo, hi]` and moves least; when it cannot fit, `anchor` is kept inside and the span centred around it as far as that allows. */
function leastShift(span: { lo: number; hi: number }, anchor: { lo: number; hi: number }, lo: number, hi: number): number {
  const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
  if (lo - span.lo <= hi - span.hi) return clamp(0, lo - span.lo, hi - span.hi);
  const centred = (lo + hi) / 2 - (span.lo + span.hi) / 2;
  return lo - anchor.lo <= hi - anchor.hi ? clamp(centred, lo - anchor.lo, hi - anchor.hi) : (lo + hi) / 2 - (anchor.lo + anchor.hi) / 2;
}

/** Zoom samples per octave in the zoom-in search, then bisection steps toward the first best sample. */
const ZOOM_SAMPLES_PER_OCTAVE = 8;
const ZOOM_REFINE_STEPS = 4;
/** Bisection steps for the zoom-in's fit cap: 2^-8 of the band is under a pixel at map sizes. */
const ZOOM_FIT_STEPS = 8;

/**
 * What a selection's zoom-in may do: how far it may reach, how well a zoom reads (scores compared
 * entry by entry, higher better), and the marks that must stay framed there, with names on the
 * sides they would take at that zoom.
 */
export interface SelectionZoomIn {
  maxScale: number;
  scoreAt(scale: number): readonly number[];
  marksAt(scale: number): readonly FramedMark[];
}

function compareScores(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

/** The camera at `scale` that keeps the selection's screen point from `camera` and then pans `marks` in by the least move. */
function framedAt(camera: CameraTarget, marks: readonly FramedMark[], scale: number, viewport: { width: number; height: number }, free: FreeMapRect, margin: number): CameraTarget {
  const anchor = marks[0]!;
  const tx0 = anchor.x - ((anchor.x - camera.tx) * camera.tscale) / scale;
  const ty0 = anchor.y - ((anchor.y - camera.ty) * camera.tscale) / scale;
  const toScreenX = viewport.width / 2 - tx0 * scale;
  const toScreenY = viewport.height / 2 - ty0 * scale;
  const shifted = (span: { lo: number; hi: number }, by: number) => ({ lo: span.lo + by, hi: span.hi + by });
  const dx = leastShift(shifted(spanAt(marks, scale, "x"), toScreenX), shifted(spanAt([anchor], scale, "x"), toScreenX), free.minX + margin, free.maxX - margin);
  const dy = leastShift(shifted(spanAt(marks, scale, "y"), toScreenY), shifted(spanAt([anchor], scale, "y"), toScreenY), free.minY + margin, free.maxY - margin);
  return { tx: tx0 - dx / scale, ty: ty0 - dy / scale, tscale: scale };
}

/**
 * The smallest scale in `[from, cap]` with the best score `zoom` gives there; `from` when no zoom
 * scores better, so no zoom is spent for nothing. Bounded: 1 + ZOOM_SAMPLES_PER_OCTAVE × octaves
 * to the cap + ZOOM_REFINE_STEPS calls of `scoreAt`.
 */
function bestScale(from: number, cap: number, zoom: SelectionZoomIn): number {
  let best = zoom.scoreAt(from);
  let bestAt = from;
  let below = from;
  let previous = from;
  for (let k = 1; previous < cap; k += 1) {
    const s = Math.min(cap, from * 2 ** (k / ZOOM_SAMPLES_PER_OCTAVE));
    const score = zoom.scoreAt(s);
    if (compareScores(score, best) > 0) {
      best = score;
      bestAt = s;
      below = previous;
    }
    previous = s;
  }
  if (bestAt === from) return from;
  for (let i = 0; i < ZOOM_REFINE_STEPS; i += 1) {
    const mid = (below + bestAt) / 2;
    if (compareScores(zoom.scoreAt(mid), best) >= 0) bestAt = mid;
    else below = mid;
  }
  return bestAt;
}

/**
 * The camera that frames a selection inside the free map, `margin` clear of every edge. `sets` go
 * from most to least wanted, each starting with the selection: the first that fits at the current
 * scale is panned in; when none fits, the last zooms out as little as it needs, never below
 * `floorScale`. The selection keeps its screen point through any zoom, and the pan is the least
 * that frames. When the panned view does not read clear, it then zooms in about the selection, in
 * the same move, to the smallest scale with the best score `zoom` gives, at most `zoom.maxScale`
 * and as far as its marks still fit with their names where they would land. Null when the view already frames it.
 * O(marks) per scale tried; the zoom-in adds at most ZOOM_FIT_STEPS + 1 fit probes.
 */
export function selectionFrameTarget(
  camera: CameraTarget,
  sets: readonly (readonly FramedMark[])[],
  viewport: { width: number; height: number },
  free: FreeMapRect,
  margin: number,
  floorScale: number,
  zoom: SelectionZoomIn | null = null,
): CameraTarget | null {
  const usable = sets.filter((set) => set.length > 0);
  const last = usable.at(-1);
  if (!last) return null;
  const width = free.maxX - free.minX - margin * 2;
  const height = free.maxY - free.minY - margin * 2;
  const now = camera.tscale;
  let marks = usable.find((set) => fitsAt(set, now, width, height));
  let scale = now;
  if (!marks) {
    marks = last;
    const floor = Math.min(now, floorScale);
    if (!fitsAt(marks, floor, width, height)) scale = floor;
    else {
      let fits = floor;
      let fails = now;
      for (let i = 0; i < FIT_STEPS; i += 1) {
        const mid = (fits + fails) / 2;
        if (fitsAt(marks, mid, width, height)) fits = mid;
        else fails = mid;
      }
      scale = fits;
    }
  }
  let target = framedAt(camera, marks, scale, viewport, free, margin);
  const fitsThere = (s: number) => fitsAt(zoom!.marksAt(s), s, width, height);
  if (zoom && scale < zoom.maxScale && fitsThere(scale)) {
    let cap = zoom.maxScale;
    if (!fitsThere(cap)) {
      let fits = scale;
      let fails = cap;
      for (let i = 0; i < ZOOM_FIT_STEPS; i += 1) {
        const mid = (fits + fails) / 2;
        if (fitsThere(mid)) fits = mid;
        else fails = mid;
      }
      cap = fits;
    }
    const best = cap > scale ? bestScale(scale, cap, zoom) : scale;
    if (best > scale) target = framedAt(target, zoom.marksAt(best), best, viewport, free, margin);
  }
  const moved = Math.abs((target.tx - camera.tx) * target.tscale) > 0.5 || Math.abs((target.ty - camera.ty) * target.tscale) > 0.5;
  return target.tscale === now && !moved ? null : target;
}

/** Selections that follow one another without a reader move share the view the first one left. */
export function recordSelectionCamera(
  memory: SelectionCamera | null,
  move: { slug: string; framed: boolean; current: CameraTarget; landed: CameraTarget; gesture: number },
): SelectionCamera {
  const restore = memory !== null && untouched(memory, move.current, move.gesture) ? memory.restore : move.current;
  return { slug: move.slug, framed: move.framed, restore: { ...restore }, landed: { ...move.landed }, gesture: move.gesture };
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
  if (!untouched(memory, current, gesture) || sameCameraTarget(current, memory.restore)) return { kind: "stay" };
  return { kind: "return", target: { ...memory.restore } };
}
