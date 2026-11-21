/**
 * Where a node's outline lies: the polygon of each kind, its corner rounding, the pin ticks beside it
 * and the scratch copy of the polygon the per-frame paint reuses. Pure geometry, no canvas state.
 */

export interface Point {
  x: number;
  y: number;
}

export type NodeKind = "project" | "domain" | "capability" | "element";

/** Full convergence to a plain circle above this farT, avoiding polygon/circle seams. */
export const FULL_CIRCLE_FAR_T = 0.985;
/** Half-extent of the domain square relative to its draw radius. */
export const DOMAIN_HALF_EXTENT_RATIO = 0.86;
/** Domain chip-leg pin ticks: leg length as a share of the half extent, and the two x-offsets as shares of it. */
const DOMAIN_PIN_TICK_RATIO = 0.34;
const DOMAIN_PIN_OFFSET_FACTORS = [-0.45, 0.45] as const;

/** Six points of a regular hexagon, rotated -90°. */
export function hexPoints(cx: number, cy: number, r: number): Point[] {
    const points: Point[] = [];
    for (let i = 0; i < 6; i += 1) {
        const a = ((i * 60 - 90) * Math.PI) / 180;
        points.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return points;
}
export function squarePoints(cx: number, cy: number, s: number): Point[] {
    return [
        { x: cx - s, y: cy - s },
        { x: cx + s, y: cy - s },
        { x: cx + s, y: cy + s },
        { x: cx - s, y: cy + s }
    ];
}
/** `lerp(minRadius, fullRadius, farT)`; at farT=1 the polygon degenerates into a circle, which `draw()` special-cases at `farT > 0.985` to avoid polygon/circle seams. */
export function interpolateCornerRadius(minRadius: number, fullRadius: number, farT: number): number {
    return minRadius + (fullRadius - minRadius) * farT;
}

export interface PinTick {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
/** The four chip-leg pin ticks of a domain square: two above, two below, at `[-0.45, 0.45]` x-offsets. */
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
/** Fixed leg length of the project hexagon's four pin ticks, unlike domain's radius-proportional ticks. */
const PROJECT_PIN_TICK_LENGTH = 6;
/** The four chassis-leg pin ticks of the project hexagon: one per cardinal direction, a fixed 6 px line from the node's edge outward. */
export function projectPinTicks(cx: number, cy: number, r: number): PinTick[] {
    const t = PROJECT_PIN_TICK_LENGTH;
    return [
        { x1: cx, y1: cy - r, x2: cx, y2: cy - r - t },
        { x1: cx, y1: cy + r, x2: cx, y2: cy + r + t },
        { x1: cx - r, y1: cy, x2: cx - r - t, y2: cy },
        { x1: cx + r, y1: cy, x2: cx + r + t, y2: cy }
    ];
}

/**
 * A path that can be traced into: a live context or a `Path2D`. It does not call `beginPath()`;
 * the caller starts the path, so `drawStarEmission` can clip to the box minus the node body.
 */
type PathSink = Pick<Path2D, "moveTo" | "lineTo" | "quadraticCurveTo" | "closePath">;
/** A closed polygon path with each corner rounded to `min(rad, adjacentEdgeLen*0.45)`. */
export function roundedPolygonPath(ctx: PathSink, points: readonly Point[], rad: number): void {
    const n = points.length;
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
        if (i === 0)
            ctx.moveTo(sx, sy);
        else
            ctx.lineTo(sx, sy);
        ctx.quadraticCurveTo(p1.x, p1.y, ex, ey);
    }
    ctx.closePath();
}

/**
 * This kind's polygon points at draw radius `r`, null for capability (a plain circle). Exported so
 * `node-kind-shape-parity.contract.test.ts` can check the kind→silhouette mapping against the DOM gateway's.
 */
export function bodyPoints(kind: NodeKind, x: number, y: number, r: number): readonly Point[] | null {
    if (kind === "project")
        return hexPoints(x, y, r);
    if (kind === "domain")
        return squarePoints(x, y, r * DOMAIN_HALF_EXTENT_RATIO);
    if (kind === "element")
        return squarePoints(x, y, r * 0.92);
    return null;
}
/*
 * Scratch version of `bodyPoints` that avoids per-node allocation; same formulas, consumed at once
 * by `roundedPolygonPath`, so no state is shared across frames. The exported `bodyPoints` allocates.
 */
const HEX_SCRATCH: Point[] = Array.from({ length: 6 }, () => ({ x: 0, y: 0 }));
const SQUARE_SCRATCH: Point[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0 }));
function hexPointsScratch(cx: number, cy: number, r: number): readonly Point[] {
    for (let i = 0; i < 6; i += 1) {
        const a = ((i * 60 - 90) * Math.PI) / 180;
        HEX_SCRATCH[i].x = cx + r * Math.cos(a);
        HEX_SCRATCH[i].y = cy + r * Math.sin(a);
    }
    return HEX_SCRATCH;
}
function squarePointsScratch(cx: number, cy: number, s: number): readonly Point[] {
    SQUARE_SCRATCH[0].x = cx - s;
    SQUARE_SCRATCH[0].y = cy - s;
    SQUARE_SCRATCH[1].x = cx + s;
    SQUARE_SCRATCH[1].y = cy - s;
    SQUARE_SCRATCH[2].x = cx + s;
    SQUARE_SCRATCH[2].y = cy + s;
    SQUARE_SCRATCH[3].x = cx - s;
    SQUARE_SCRATCH[3].y = cy + s;
    return SQUARE_SCRATCH;
}
export function bodyPointsScratch(kind: NodeKind, x: number, y: number, r: number): readonly Point[] | null {
    if (kind === "project")
        return hexPointsScratch(x, y, r);
    if (kind === "domain")
        return squarePointsScratch(x, y, r * DOMAIN_HALF_EXTENT_RATIO);
    if (kind === "element")
        return squarePointsScratch(x, y, r * 0.92);
    return null;
}
/**
 * This kind's minimum corner radius at farT=0, a ratio of the screen radius with a 0.5 px floor: absolute px caps
 * changed the silhouette with zoom, but farT is the only morph axis.
 */
export function minCornerRadius(kind: NodeKind, r: number): number {
    if (kind === "project")
        return Math.max(0.5, r * 0.14);
    if (kind === "domain")
        return Math.max(0.5, r * 0.86 * 0.22);
    return Math.max(0.5, r * 0.92 * 0.3);
}
