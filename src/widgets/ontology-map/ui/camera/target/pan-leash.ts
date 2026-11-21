import { computePanBounds, type PanBounds } from "../../../engine/camera";
import { centerForInsets, readSafeInsets, type SafeInsetTokens } from "./safe-insets";

/**
 * Pan envelope with no focus: around the fit when `cameraPanLeash` is set, else the world bbox
 * plus slack. The leash serves surfaces with no Fit Map control; it takes the fit as its
 * reference, so it does not depend on vault size. With `leash <= 0` the bbox envelope applies.
 */
export function computeUnfocusedPanBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  cameraScale: number,
  tokens: SafeInsetTokens & { cameraPanLeash?: number },
): PanBounds {
  const leash = tokens.cameraPanLeash ?? 0;
  if (!(leash > 0) || !(cameraScale > 0)) return computePanBounds(bounds);
  const insets = readSafeInsets(tokens);
  const { tx: anchorX, ty: anchorY } = centerForInsets(
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    insets,
    cameraScale,
  );
  return computePanBounds(
    { minX: anchorX, minY: anchorY, maxX: anchorX, maxY: anchorY },
    leash,
  );
}

/**
 * The focused node stays at least this far inside the free area's edge under
 * any pan: room for its ring and its name.
 */
export const FOCUS_LEASH_EDGE_PAD_PX = 120;

/** The focus leash in screen pixels, per axis. */
export interface FocusLeashPx {
  x: number;
  y: number;
}

/**
 * How far, in screen pixels, the camera centre may sit from the focused node on each axis:
 * half the free extent (canvas minus panels and bars) less the edge pad. Sized to the screen,
 * it keeps the subject in frame while letting a wide ego graph be centred in the free area.
 */
export function focusLeashPx(
  viewportWidth: number,
  viewportHeight: number,
  insets: { left: number; right: number; top: number; bottom: number },
): FocusLeashPx {
  const freeHalfX = Math.max(0, viewportWidth - insets.left - insets.right) / 2;
  const freeHalfY = Math.max(0, viewportHeight - insets.top - insets.bottom) / 2;
  return { x: Math.max(0, freeHalfX - FOCUS_LEASH_EDGE_PAD_PX), y: Math.max(0, freeHalfY - FOCUS_LEASH_EDGE_PAD_PX) };
}

/** The leash `computeFocusCameraTarget` aims inside, so the physics holds the same box. */
export function focusTargetLeashPx(tokens: SafeInsetTokens, viewportWidth: number, viewportHeight: number): FocusLeashPx {
  return focusLeashPx(viewportWidth, viewportHeight, readSafeInsets(tokens, viewportWidth, viewportHeight));
}

/** The leash in world units at `scale`: the screen leash, never tighter than the token. */
export function focusLeashWorld(leashPx: number, scale: number, tokenMargin: number): number {
  const floor = Number.isFinite(tokenMargin) ? tokenMargin : 0;
  return scale > 0 ? Math.max(floor, leashPx / scale) : floor;
}

/** The pan box the physics holds a focused camera in: the leash on each axis around the node. */
export function focusPanBounds(
  anchor: { x: number; y: number },
  leashPx: FocusLeashPx | null,
  scale: number,
  tokenMargin: number,
): PanBounds {
  const mx = focusLeashWorld(leashPx?.x ?? 0, scale, tokenMargin);
  const my = focusLeashWorld(leashPx?.y ?? 0, scale, tokenMargin);
  return { minX: anchor.x - mx, maxX: anchor.x + mx, minY: anchor.y - my, maxY: anchor.y + my };
}
