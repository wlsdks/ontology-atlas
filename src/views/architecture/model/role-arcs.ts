import type { ArchitectureRoleEdge } from '@/entities/architecture-record';

/** An arc never bulges less than this, so a neighbour's arc still reads as a curve. */
export const MIN_BULGE_PX = 22;
/** The climbing half of an opposed pair bulges this much further, so both strokes stay apart. */
export const OPPOSED_PAIR_GAP_PX = 8;
/** Violations sit outside the allowed arcs: this far past the outermost, then one lane per violation. */
export const VIOLATION_LANE_GAP_PX = 18;
const VIOLATION_LANE_STEP_PX = 12;
const ENDPOINT_FAN_PX = 2.5;
export const MIN_STROKE_PX = 1;
export const MAX_STROKE_PX = 6;
/** A cubic whose two control points sit at `k` reaches 0.75·k at its midpoint. */
const CUBIC_APEX_RATIO = 0.75;

export interface RoleArc {
  from: string;
  to: string;
  count: number;
  violated: boolean;
  /** Rows between the ends, at least 1. */
  span: number;
  bulgePx: number;
  strokePx: number;
  sourceY: number;
  targetY: number;
  apexX: number;
  apexY: number;
  /** SVG path data, from the source band's edge out to the right and back to the target's. */
  d: string;
}

/** A longer span bulges further, linearly, so the widest arc uses the whole room. */
export function bulgeForSpan(span: number, maxSpan: number, roomPx: number): number {
  if (maxSpan <= 0 || roomPx <= MIN_BULGE_PX) return MIN_BULGE_PX;
  return Math.max(MIN_BULGE_PX, Math.min(roomPx, (roomPx * span) / maxSpan));
}

/** Width by the square root of the count's share, so one busy crossing does not thin the rest to hairlines. */
export function strokeForCount(count: number, maxCount: number): number {
  if (maxCount <= 0 || count <= 0) return MIN_STROKE_PX;
  const share = Math.min(1, count / maxCount);
  return MIN_STROKE_PX + (MAX_STROKE_PX - MIN_STROKE_PX) * Math.sqrt(share);
}

function roundPx(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * One arc per observed role-to-role edge between two drawn roles; same-role edges cross nothing and
 * are skipped. `rowCenterY(i)` is the centre of the i-th row in profile order. O(E log E).
 */
export function buildRoleArcs({
  order,
  edges,
  violatedPairs,
  rowCenterY,
  roomPx,
  originX = 0,
}: {
  order: readonly string[];
  edges: readonly ArchitectureRoleEdge[];
  violatedPairs: ReadonlySet<string>;
  rowCenterY: (index: number) => number;
  roomPx: number;
  originX?: number;
}): RoleArc[] {
  const indexOf = new Map(order.map((id, index) => [id, index]));
  const drawn = edges.filter(
    (edge) =>
      edge.fromRole !== edge.toRole &&
      indexOf.has(edge.fromRole) &&
      indexOf.has(edge.toRole) &&
      edge.count > 0,
  );
  const pairs = new Set(drawn.map((edge) => `${edge.fromRole}>${edge.toRole}`));
  const spanOf = (edge: ArchitectureRoleEdge) => Math.abs(indexOf.get(edge.toRole)! - indexOf.get(edge.fromRole)!);
  const isViolated = (edge: ArchitectureRoleEdge) => violatedPairs.has(`${edge.fromRole}>${edge.toRole}`);
  const allowed = drawn.filter((edge) => !isViolated(edge));
  const violations = drawn.filter(isViolated).sort((a, b) => spanOf(a) - spanOf(b));
  const maxCount = drawn.reduce((most, edge) => Math.max(most, edge.count), 0);
  const hasOpposedPair = allowed.some((edge) => pairs.has(`${edge.toRole}>${edge.fromRole}`));
  const room = Math.max(MIN_BULGE_PX, roomPx - (hasOpposedPair ? OPPOSED_PAIR_GAP_PX : 0));

  const bulgeOf = new Map<ArchitectureRoleEdge, number>();
  const allowedMaxSpan = allowed.reduce((most, edge) => Math.max(most, spanOf(edge)), 0);
  for (const edge of allowed) {
    const climbsAgainstPair = indexOf.get(edge.toRole)! < indexOf.get(edge.fromRole)! && pairs.has(`${edge.toRole}>${edge.fromRole}`);
    bulgeOf.set(edge, bulgeForSpan(spanOf(edge), allowedMaxSpan, room) + (climbsAgainstPair ? OPPOSED_PAIR_GAP_PX : 0));
  }
  /* Violations take lanes outside every allowed arc, nearest span innermost, so red is never buried. */
  const outerEdge = allowed.reduce((most, edge) => Math.max(most, bulgeOf.get(edge)!), 0);
  const violationMaxSpan = violations.reduce((most, edge) => Math.max(most, spanOf(edge)), 0);
  violations.forEach((edge, lane) => {
    bulgeOf.set(
      edge,
      allowed.length === 0
        ? bulgeForSpan(spanOf(edge), violationMaxSpan, room) + lane * VIOLATION_LANE_STEP_PX
        : outerEdge + VIOLATION_LANE_GAP_PX + lane * VIOLATION_LANE_STEP_PX,
    );
  });

  return drawn
    .map((edge) => {
      const fromIndex = indexOf.get(edge.fromRole)!;
      const toIndex = indexOf.get(edge.toRole)!;
      const downward = toIndex > fromIndex;
      const bulgePx = bulgeOf.get(edge)!;
      /* At each band, arcs to rows below attach just under its centre and arcs to rows above just over it. */
      const sourceY = rowCenterY(fromIndex) + (downward ? ENDPOINT_FAN_PX : -ENDPOINT_FAN_PX);
      const targetY = rowCenterY(toIndex) + (downward ? -ENDPOINT_FAN_PX : ENDPOINT_FAN_PX);
      const control = originX + bulgePx / CUBIC_APEX_RATIO;
      return {
        from: edge.fromRole,
        to: edge.toRole,
        count: edge.count,
        violated: isViolated(edge),
        span: spanOf(edge),
        bulgePx,
        strokePx: roundPx(strokeForCount(edge.count, maxCount)),
        sourceY,
        targetY,
        apexX: originX + bulgePx,
        apexY: (sourceY + targetY) / 2,
        d: `M ${originX} ${roundPx(sourceY)} C ${roundPx(control)} ${roundPx(sourceY)}, ${roundPx(control)} ${roundPx(targetY)}, ${originX} ${roundPx(targetY)}`,
      };
    })
    .sort((a, b) => b.span - a.span || a.count - b.count);
}

export interface LabelBox {
  key: string;
  x: number;
  widthPx: number;
  /** The y the label wants its centre on. */
  anchorY: number;
}

export interface PlacedLabel extends LabelBox {
  /** Top edge after placement. */
  y: number;
}

/**
 * Seats labels top to bottom by their anchor; a label that would touch one already seated moves
 * below it. Greedy, O(L²) for L labels, which is at most twice the role count.
 */
export function placeArcLabels(
  labels: readonly LabelBox[],
  heightPx: number,
  gapPx: number,
): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const sorted = [...labels].sort((a, b) => a.anchorY - b.anchorY || a.x - b.x);
  for (const label of sorted) {
    let y = label.anchorY - heightPx / 2;
    let moved = true;
    while (moved) {
      moved = false;
      for (const other of placed) {
        const overlapsX = label.x < other.x + other.widthPx + gapPx && other.x < label.x + label.widthPx + gapPx;
        const overlapsY = y < other.y + heightPx + gapPx && other.y < y + heightPx + gapPx;
        if (overlapsX && overlapsY) {
          y = other.y + heightPx + gapPx;
          moved = true;
        }
      }
    }
    placed.push({ ...label, y });
  }
  return placed;
}

const WIDE_GLYPH = /[ᄀ-ᇿ　-鿿가-힯＀-￯]/;

/** Width of a `text-label` line, close enough to reserve a lane: Hangul and CJK glyphs are near square. */
export function estimateLabelWidthPx(text: string, fontPx = 11): number {
  let width = 0;
  for (const char of text) width += WIDE_GLYPH.test(char) ? fontPx : fontPx * 0.58;
  return Math.ceil(width);
}
