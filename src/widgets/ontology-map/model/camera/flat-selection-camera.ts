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
