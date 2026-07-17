/**
 * Node label paint — ported from the B2+ prototype's `drawTracked()`/
 * `drawLabel()` (`docs/prototypes/topology-b2plus.html` §12-13).
 *
 * Per-kind label behavior (never overlapping — each kind only appears in its
 * own altitude range, `docs/TOPOLOGY-V2-DESIGN.md` §3.1):
 * - `project`: always visible, plain text, no letter-tracking.
 * - `domain`: alpha = `farT` — tracked (manual letter-spacing, since Canvas
 *   2D has no native `letter-spacing`) uppercase "sky-chart" label, only
 *   readable once altitude rises into the transition band.
 * - `capability`: alpha = `(1-farT) * smoothstep(0.75, 1.02, cameraScale)` —
 *   only in working/close-zoom range, fades before reaching far field.
 * - `element`: alpha = `(1-farT) * smoothstep(1.55, 1.95, cameraScale)` —
 *   deepest zoom only.
 * - Focused node + its neighbors get a label-alpha floor override (never
 *   fully hidden while focus is active), except capability/element labels
 *   which still respect their own zoom gates even while focused (prototype
 *   `drawLabel()`'s focus branch explicitly excludes those two kinds).
 *
 * Zero React imports. `draw()`'s body is pure Canvas 2D text painting — no
 * extractable pure-geometry helper here worth unit-testing without a canvas
 * (unlike `node-shapes`/`traces`, label alpha math is a straightforward
 * formula evaluation, not a geometric invariant). Left as `test.todo` below
 * per this scaffold's instruction to mark genuinely-undecided-or-covered-
 * elsewhere behavior rather than fabricate a canvas-mocking test.
 *
 * STUB: the lead implements the body.
 */

export interface LabelDrawState {
  kind: "project" | "domain" | "capability" | "element";
  text: string;
  screenX: number;
  screenY: number;
  /** World-space node radius × camera.scale (used to offset label below the node). */
  screenRadius: number;
  farT: number;
  cameraScale: number;
  egoState: "center" | "neighbor" | "dim" | "normal";
}

export interface LabelTokens {
  labelDomain: string;
  labelCapability: string;
  labelElement: string;
}

/** Draws one node's label (or nothing, if this kind/zoom/ego combination resolves to alpha<=0.02). */
export function draw(
  _ctx: CanvasRenderingContext2D,
  _state: LabelDrawState,
  _tokens: LabelTokens,
): void {
  throw new Error(
    "TODO(lead): implement draw() per the prototype's drawLabel()/drawTracked() — see docs/TOPOLOGY-V2-DESIGN.md §3.1.",
  );
}
