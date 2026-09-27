/**
 * Each Strata tier name hangs outside its own plane's rim (right, else left), placed only
 * where it lands on nothing: inside the free map, outside every other plane's disc and off
 * earlier names. A plane with no such place stays unnamed; the legend names every kind.
 * Concept labels give way to these (`topology-frame-draw.ts` label reservations).
 */

export interface TierPlane {
  kind: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** The plane's centre line. */
  y: number;
  /** A name rises and fades with its plane. */
  a: number;
}

export interface TierNameAnchor {
  kind: string;
  side: "right" | "left";
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  a: number;
}

export interface TierNameRoom {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Clears a ring-edge concept, under 7 px in Strata (`DOME_NODE_FIT_ALLOWANCE_PX`). */
export const TIER_NAME_GAP_PX = 8;

/** The `text-label` line box: 11 px type on 16 px leading. */
export const TIER_NAME_ROW_PX = 16;

type Box = { minX: number; maxX: number; minY: number; maxY: number };

/**
 * Scaling by 1/rx and 1/ry turns the ellipse into a unit circle with the box still
 * axis-aligned, so the box's nearest point to the centre decides exactly.
 */
function reachesPlane(box: Box, plane: TierPlane, grow: number): boolean {
  const rx = (plane.right - plane.left) / 2 + grow;
  const ry = (plane.bottom - plane.top) / 2 + grow;
  if (!(rx > 0) || !(ry > 0)) return false;
  const cx = (plane.left + plane.right) / 2;
  const cy = (plane.top + plane.bottom) / 2;
  const nx = (Math.min(Math.max(cx, box.minX), box.maxX) - cx) / rx;
  const ny = (Math.min(Math.max(cy, box.minY), box.maxY) - cy) / ry;
  return nx * nx + ny * ny < 1;
}

const overlaps = (a: Box, b: Box, air: number) =>
  a.minX < b.maxX + air && b.minX < a.maxX + air && a.minY < b.maxY + air && b.minY < a.maxY + air;

/** Top plane first; a kind without a width is not placed. */
export function placeTierNames(
  planes: readonly TierPlane[],
  widths: Readonly<Record<string, number>>,
  room: TierNameRoom,
  gap: number = TIER_NAME_GAP_PX,
  rowHeight: number = TIER_NAME_ROW_PX,
): TierNameAnchor[] {
  const placed: TierNameAnchor[] = [];
  for (const plane of planes) {
    const width = widths[plane.kind];
    if (!(width > 0) || !Number.isFinite(plane.y)) continue;
    const minY = plane.y - rowHeight / 2;
    const maxY = plane.y + rowHeight / 2;
    const sides: Array<{ side: TierNameAnchor["side"]; minX: number }> = [
      { side: "right", minX: plane.right + gap },
      { side: "left", minX: plane.left - gap - width },
    ];
    for (const { side, minX } of sides) {
      const box = { minX, maxX: minX + width, minY, maxY };
      // A name touching a tile reads as the tile's.
      const air = gap / 2;
      if (box.minX < room.left + air || box.maxX > room.right - air || box.minY < room.top || box.maxY > room.bottom) continue;
      if (planes.some((other) => other !== plane && reachesPlane(box, other, gap))) continue;
      if (placed.some((name) => overlaps(name, box, gap / 2))) continue;
      placed.push({ kind: plane.kind, side, ...box, a: plane.a });
      break;
    }
  }
  return placed;
}

/** The loop publishes only a change. */
export function sameTierNames(a: readonly TierNameAnchor[] | null, b: readonly TierNameAnchor[] | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  return a.every((name, i) => {
    const other = b[i];
    return (
      name.kind === other.kind &&
      name.side === other.side &&
      Math.abs(name.minX - other.minX) <= 0.5 &&
      Math.abs(name.minY - other.minY) <= 0.5 &&
      Math.abs(name.maxX - other.maxX) <= 0.5 &&
      Math.abs(name.a - other.a) <= 0.02
    );
  });
}
