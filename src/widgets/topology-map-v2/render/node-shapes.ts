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
 * `draw()` itself has no dedicated test (canvas side effects aren't
 * meaningfully assertable without a heavy mock; P5's screenshot gate is the
 * real verification for paint correctness, per design doc §4 P3 gate).
 */

import { smoothstep } from "../model/altitude";

export interface Point {
  x: number;
  y: number;
}

/** Six points of a regular hexagon, flat-top-rotated -90° (prototype: `a = i*60 - 90` degrees). */
export function hexPoints(cx: number, cy: number, r: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = ((i * 60 - 90) * Math.PI) / 180;
    points.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return points;
}

/** Four corners of an axis-aligned square, half-extent `s`. */
export function squarePoints(cx: number, cy: number, s: number): Point[] {
  return [
    { x: cx - s, y: cy - s },
    { x: cx + s, y: cy - s },
    { x: cx + s, y: cy + s },
    { x: cx - s, y: cy + s },
  ];
}

/**
 * Corner radius at a given altitude — `lerp(minRadius, fullRadius, farT)`.
 * `minRadius` is a small constant per kind in the prototype (e.g.
 * `Math.min(4, r*0.14)` for project); `fullRadius` is the node's own draw
 * radius `r` (farT=1 → radius=r → the "rounded polygon" degenerates into a
 * circle, which `draw()` special-cases at `farT > 0.985` exactly like the
 * prototype, to avoid float-precision polygon/circle seams).
 */
export function interpolateCornerRadius(minRadius: number, fullRadius: number, farT: number): number {
  return minRadius + (fullRadius - minRadius) * farT;
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
  /**
   * Top stop of the vertical metallic-sheen gradient (prototype `drawNode`:
   * `lerpColor(fill, "#232329", 0.6)`). Resolved by the caller from the
   * `--topology-v2-node-sheen-*` tokens so this pure module stays token-free;
   * the bottom stop is always `fill`.
   */
  sheenTop: string;
  /** Engraved node-count numeral, or null to skip (project/domain only, per prototype). */
  countLabel: string | null;
}

export interface NodeShapeTokens {
  amberHub: string;
  numeralShadow: string;
  numeralFace: string;
  holeFill: string;
}

/** Full convergence to a plain circle above this farT — avoids float-precision polygon/circle seams (prototype: `farT > 0.985`). */
const FULL_CIRCLE_FAR_T = 0.985;

/** Sheen dissolves out toward far field — above this farT (or below `SHEEN_MIN_RADIUS`) the body fills flat so constellation points read luminous, not machined (prototype: `r > 3 && farT < 0.98`). */
const SHEEN_MAX_FAR_T = 0.98;
const SHEEN_MIN_RADIUS = 3;

/** Domain chip-leg pin ticks — geometry ratios ported from the prototype's `[-0.45,0.45]` offsets + `tick = s*0.34` leg length, gated `s > 6 && farT < 0.9`. */
const DOMAIN_PIN_MIN_HALF_EXTENT = 6;
const DOMAIN_PIN_MAX_FAR_T = 0.9;
const DOMAIN_PIN_TICK_RATIO = 0.34;
const DOMAIN_PIN_OFFSET_FACTORS = [-0.45, 0.45] as const;

/** Half-extent factor of the domain square relative to its draw radius (prototype `s = r * 0.86`). */
const DOMAIN_HALF_EXTENT_RATIO = 0.86;

export interface PinTick {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The four chip-leg pin ticks of a domain square — two above, two below, one
 * pair per `[-0.45, 0.45]` x-offset. Pure screen-space geometry (ported from
 * the prototype's domain branch), unit-tested in `node-shapes.test.ts`.
 */
export function domainPinTicks(cx: number, cy: number, s: number): PinTick[] {
  const tick = s * DOMAIN_PIN_TICK_RATIO;
  const ticks: PinTick[] = [];
  for (const f of DOMAIN_PIN_OFFSET_FACTORS) {
    const x = cx + s * f;
    ticks.push({ x1: x, y1: cy - s, x2: x, y2: cy - s - tick });
    ticks.push({ x1: x, y1: cy + s, x2: x, y2: cy + s + tick });
  }
  return ticks;
}

/**
 * The body fill for one node: a vertical `sheenTop → fill` gradient when the
 * node is big + near enough (prototype `r > 3 && farT < 0.98`), otherwise the
 * flat `fill`. Ported from `drawNode`'s sheen block (§13).
 */
function resolveBodyFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  farT: number,
  fill: string,
  sheenTop: string,
): string | CanvasGradient {
  if (r <= SHEEN_MIN_RADIUS || farT >= SHEEN_MAX_FAR_T) return fill;
  const grad = ctx.createLinearGradient(x, y - r, x, y + r);
  grad.addColorStop(0, sheenTop);
  grad.addColorStop(1, fill);
  return grad;
}

/** Ported from the prototype's `roundedPolygonPath()` — traces a closed polygon path with each corner rounded to `min(rad, adjacentEdgeLen*0.45)`. */
function roundedPolygonPath(ctx: CanvasRenderingContext2D, points: readonly Point[], rad: number): void {
  const n = points.length;
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const v1x = p1.x - p0.x;
    const v1y = p1.y - p0.y;
    const len1 = Math.hypot(v1x, v1y) || 1;
    const v2x = p2.x - p1.x;
    const v2y = p2.y - p1.y;
    const len2 = Math.hypot(v2x, v2y) || 1;
    const r = Math.min(rad, len1 * 0.45, len2 * 0.45);
    const sx = p1.x - (v1x / len1) * r;
    const sy = p1.y - (v1y / len1) * r;
    const ex = p1.x + (v2x / len2) * r;
    const ey = p1.y + (v2y / len2) * r;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
    ctx.quadraticCurveTo(p1.x, p1.y, ex, ey);
  }
  ctx.closePath();
}

/** Ported from the prototype's `drawEngraved()` — a 1px dark shadow beneath a lighter face, reading as an inset/engraved numeral rather than printed text. */
function drawEngraved(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  alpha: number,
  tokens: NodeShapeTokens,
): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = tokens.numeralShadow;
  ctx.fillText(text, x, y + 1);
  ctx.fillStyle = tokens.numeralFace;
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}

/** This kind's polygon points at draw radius `r` — `null` for capability, which is already a plain circle. */
function bodyPoints(kind: NodeShapeDrawState["kind"], x: number, y: number, r: number): readonly Point[] | null {
  if (kind === "project") return hexPoints(x, y, r);
  if (kind === "domain") return squarePoints(x, y, r * DOMAIN_HALF_EXTENT_RATIO);
  if (kind === "element") return squarePoints(x, y, r * 0.92);
  return null;
}

/** This kind's minimum corner radius at farT=0 (prototype's per-kind `Math.min(...)` literals). */
function minCornerRadius(kind: NodeShapeDrawState["kind"], r: number): number {
  if (kind === "project") return Math.min(4, r * 0.14);
  if (kind === "domain") return Math.min(5, r * 0.86 * 0.22);
  return Math.min(1.6, r * 0.92 * 0.3);
}

/**
 * Draws one node body (fill/stroke/dash + kind-specific shape morph + hub
 * ring + engraved numeral + via-hole for elements). Does NOT draw the
 * diffraction spike overlay (`render/starfield.ts#drawDiffractionSpike`
 * owns that — it's a far-field-only "magnitude" overlay, orthogonal to
 * shape-by-kind) or the label (`render/labels.ts`).
 */
export function draw(ctx: CanvasRenderingContext2D, state: NodeShapeDrawState, tokens: NodeShapeTokens): void {
  const { kind, screenX: x, screenY: y, screenRadius: r, farT, egoState, fill, stroke, lineWidth, dash, hub, sheenTop, countLabel } = state;

  ctx.setLineDash([...dash]);
  const points = bodyPoints(kind, x, y, r);
  if (points === null || farT > FULL_CIRCLE_FAR_T) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  } else {
    roundedPolygonPath(ctx, points, interpolateCornerRadius(minCornerRadius(kind, r), r, farT));
  }
  ctx.fillStyle = resolveBodyFill(ctx, x, y, r, farT, fill, sheenTop);
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.setLineDash([]);

  // Domain chip-leg pin ticks — circuit-only detail, fades out with altitude
  // (prototype: `s > 6 && farT < 0.9`, alpha `1 - smoothstep(0.55,0.9,farT)`).
  if (kind === "domain" && egoState !== "dim") {
    const s = r * DOMAIN_HALF_EXTENT_RATIO;
    if (s > DOMAIN_PIN_MIN_HALF_EXTENT && farT < DOMAIN_PIN_MAX_FAR_T) {
      ctx.globalAlpha = 1 - smoothstep(0.55, 0.9, farT);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      for (const t of domainPinTicks(x, y, s)) {
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  if (kind === "element") {
    const half = r * 0.92;
    if (half > 3 && farT < 0.9) {
      ctx.globalAlpha = 1 - smoothstep(0.55, 0.9, farT);
      ctx.beginPath();
      ctx.arc(x, y, half * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = tokens.holeFill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  if (hub && egoState !== "dim") {
    const ringPoints = bodyPoints(kind, x, y, r + 4);
    if (ringPoints === null) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    } else {
      roundedPolygonPath(ctx, ringPoints, interpolateCornerRadius(minCornerRadius(kind, r + 4), r + 4, farT));
    }
    ctx.strokeStyle = tokens.amberHub;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  if (countLabel !== null && r > 15 && egoState !== "dim" && farT < 0.9) {
    drawEngraved(ctx, countLabel, x, y + r * 0.52, Math.max(8, Math.min(11, r * 0.4)), 1 - smoothstep(0.5, 0.9, farT), tokens);
  }
}
