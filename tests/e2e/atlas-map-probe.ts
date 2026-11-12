/**
 * Declared once: duplicate `declare global` property types must match to the character.
 * Opens only with `?e2e=1`.
 */

import type { DialProbe } from "../../src/widgets/ontology-map/dial/types";

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
  /** The alpha the last frame drew the node at; 0 is not on screen even when `hidden` is false. */
  alpha?: number;
  appear?: number;
}

export interface AtlasMapProbe {
  camera: () => AtlasMapCamera | null;
  dial?: () => DialProbe | { owns: false };
  /** False while a Flat attention motion (wave, line draw, retract) is still running. */
  dialMotionSettled?: () => boolean;
  /**
   * Where the camera is heading, as opposed to where it is. Timing-free, so a
   * test can ask "did this aim the camera at the right place" without sampling
   * an interpolating position at an arbitrary wall-clock moment.
   */
  cameraTarget?: () => { x: number; y: number; scale: number } | null;
  /** The ego bounds the last focus dive framed, canvas CSS px, and where it aimed their centre before the leash clamp. */
  focusFrame?: () => { left: number; right: number; top: number; bottom: number; aimX: number; aimY: number } | null;
  interaction?: () => { kind: "node" | "pan" | "idle"; nodeId: string | null };
  /** Live DOM-derived horizontal obstruction, before static camera safety tokens. */
  obstacleInsets: () => { left: number; right: number } | null;
  /** The drawn edges: endpoints and the quadratic control point, in canvas CSS px. */
  edges: () => Array<{
    sourceId: string;
    targetId: string;
    kind: string;
    ax: number;
    ay: number;
    bx: number;
    by: number;
    controlX: number;
    controlY: number;
  }>;
  selection: () => { nodeId: string | null; edge: unknown };
  /** The name boxes the last frame drew, in canvas CSS px — how label collision is seen from outside. */
  labels: () => Array<{ nodeId: string; text: string; minX: number; maxX: number; minY: number; maxY: number }>;
  /** The relation captions the last frame placed, in canvas CSS px. */
  relationCaptions?: () => Array<{ edgeId: string; text: string; minX: number; maxX: number; minY: number; maxY: number }>;
  /** Strata's planes as the last frame drew them, in canvas CSS px — what the tier names stand beside. */
  tierPlanes?: () => Array<{ kind: string; left: number; right: number; top: number; bottom: number; y: number; a: number }>;
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
