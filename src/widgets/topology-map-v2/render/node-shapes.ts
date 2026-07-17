/**
 * Node body geometry + paint — ported from the B2+ prototype's
 * `roundedPolygonPath()`/`hexPoints()`/`squarePoints()`/`drawEngraved()`/
 * `drawNode()` (`docs/prototypes/topology-b2plus.html` §12-13).
 *
 * Shape-by-kind (unchanged across altitude): project = hex plate, domain =
 * square chip (with pin-tick legs in circuit range), capability = circle
 * (no morph needed), element = square copper-pad-with-drilled-via. Corner
 * rounding grows toward the full radius as `farT → 1`, so every polygon
 * converges into a plain circle at the far-field end
 * (`docs/TOPOLOGY-V2-DESIGN.md` §3.1 — continuous morph, no shape swap).
 *
 * Zero React imports (per module contract) — this is pure Canvas 2D drawing
 * plus a few extractable pure-geometry helpers that ARE unit-testable
 * without a canvas (`node-shapes.test.ts`).
 *
 * STUB: `draw()`'s body is TODO for the lead. The two geometry helpers below
 * are also TODO but are the ones pinned by failing tests — `draw()` itself
 * has no dedicated test (canvas side effects aren't meaningfully assertable
 * without a heavy mock; P5's screenshot gate is the real verification for
 * paint correctness, per design doc §4 P3 gate).
 */

export interface Point {
  x: number;
  y: number;
}

/** Six points of a regular hexagon, flat-top-rotated -90° (prototype: `a = i*60 - 90` degrees). */
export function hexPoints(_cx: number, _cy: number, _r: number): Point[] {
  throw new Error(
    "TODO(lead): implement hexPoints per the prototype's hexPoints() — node-shapes.test.ts pins the contract.",
  );
}

/** Four corners of an axis-aligned square, half-extent `s`. */
export function squarePoints(_cx: number, _cy: number, _s: number): Point[] {
  throw new Error(
    "TODO(lead): implement squarePoints per the prototype's squarePoints() — node-shapes.test.ts pins the contract.",
  );
}

/**
 * Corner radius at a given altitude — `lerp(minRadius, fullRadius, farT)`.
 * `minRadius` is a small constant per kind in the prototype (e.g.
 * `Math.min(4, r*0.14)` for project); `fullRadius` is the node's own draw
 * radius `r` (farT=1 → radius=r → the "rounded polygon" degenerates into a
 * circle, which `draw()` special-cases at `farT > 0.985` exactly like the
 * prototype, to avoid float-precision polygon/circle seams).
 */
export function interpolateCornerRadius(
  _minRadius: number,
  _fullRadius: number,
  _farT: number,
): number {
  throw new Error(
    "TODO(lead): implement interpolateCornerRadius per docs/TOPOLOGY-V2-DESIGN.md §3.1 — node-shapes.test.ts pins the contract.",
  );
}

export interface NodeShapeDrawState {
  kind: "project" | "domain" | "capability" | "element";
  screenX: number;
  screenY: number;
  /** Screen-space draw radius (world radius × camera.scale × breathe). */
  screenRadius: number;
  farT: number;
  egoState: "center" | "neighbor" | "dim" | "normal";
  fill: string;
  stroke: string;
  lineWidth: number;
  dash: readonly number[];
  hub: boolean;
  /** Engraved node-count numeral, or null to skip (project/domain only, per prototype). */
  countLabel: string | null;
}

export interface NodeShapeTokens {
  amberHub: string;
  numeralShadow: string;
  numeralFace: string;
  holeFill: string;
}

/**
 * Draws one node body (fill/stroke/dash + kind-specific shape morph + hub
 * ring + engraved numeral + via-hole for elements). Does NOT draw the
 * diffraction spike overlay (`render/starfield.ts#drawDiffractionSpike`
 * owns that — it's a far-field-only "magnitude" overlay, orthogonal to
 * shape-by-kind) or the label (`render/labels.ts`).
 */
export function draw(
  _ctx: CanvasRenderingContext2D,
  _state: NodeShapeDrawState,
  _tokens: NodeShapeTokens,
): void {
  throw new Error(
    "TODO(lead): implement draw() per the prototype's drawNode() — see docs/TOPOLOGY-V2-DESIGN.md §3.1/§3.4.",
  );
}
