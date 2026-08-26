/**
 * The **canonical type declaration** for the `window.__atlasMap` hook.
 *
 * ⚠️ **Two specs declared it separately and CI caught it** (2026-08-10):
 *
 * ```
 * tests/e2e/map-keyboard-walk.spec.ts(24,5): error TS2717:
 *   Subsequent property declarations must have the same type.
 *   Property '__atlasMap' must be of type 'AtlasProbe | undefined',
 *   but here has type 'AtlasMapProbe | undefined'.
 * ```
 *
 * Declaring the same property in two files with `declare global` requires the types
 * to match to **the character**. With two copies, diverging is the default (Carbon) —
 * so it lives here in one place.
 *
 * **Local `tsc` missed this.** The same command (`pnpm exec tsc --noEmit`) passed
 * locally and failed in CI, because the incremental cache did not re-check files it
 * had already seen. So "local tsc is green" is not evidence about this class of
 * conflict.
 *
 * This hook opens only on pages carrying `?e2e=1` (`use-topology-loop.ts`).
 */

export interface AtlasMapCamera {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
}

export interface AtlasMapNode {
  id: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  draggable: boolean;
  hidden: boolean;
  /** Are these the two endpoints the contextual relation preview temporarily revealed past the density gate? */
  previewEndpoint: boolean;
  radius: number;
}

export interface AtlasMapProbe {
  camera: () => AtlasMapCamera | null;
  /**
   * Where the camera is heading, as opposed to where it is. Timing-free, so a
   * test can ask "did this aim the camera at the right place" without sampling
   * an interpolating position at an arbitrary wall-clock moment.
   */
  cameraTarget?: () => { x: number; y: number; scale: number } | null;
  /** Live DOM-derived horizontal obstruction, before static camera safety tokens. */
  obstacleInsets: () => { left: number; right: number } | null;
  selection: () => { nodeId: string | null; edge: unknown };
  nodes: () => AtlasMapNode[];
  /**
   * The node id this frame treated as hovered (null if none). The cursor on the canvas
   * and a row hover in the side panels (chat, datasheet) produce **the same value** —
   * it is copied verbatim from what the frame actually used, so it cannot diverge from
   * the screen.
   */
  hover: () => string | null;
}

declare global {
  interface Window {
    __atlasMap?: AtlasMapProbe;
  }
}
