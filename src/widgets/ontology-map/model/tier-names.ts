/**
 * **Strata's tier names stand beside the planes they name** (2026-09-26).
 *
 * Three placements came before this one, and each failed a measurement:
 *
 * - **On the rims, drawn on the canvas.** At 1040×720 the fit takes the widest
 *   plane's rim to the canvas edge, so there was no clear space outside the ring and
 *   the names sat on the graph.
 * - **On a rail down the canvas's right edge**, each row at its plane's height. The
 *   rail began under the utility tiles, so the top plane projected above it and its
 *   row clamped to the band: at 1512×982 the project's name stood 206 px from the
 *   only project node.
 * - **In a corner stack** whenever the rail could not align — which was the usual
 *   case. Four words in the bottom-right corner named no plane and repeated the lit
 *   legend's key along the bottom (owner report, 2026-09-26, at 1512×949).
 *
 * Now each name hangs on its own plane's rim: outside the rim's right extreme, or
 * its left one when the right is taken. It is placed only where it lands on
 * nothing — inside the free map (clear of INDEX, the inspector, the rail's column,
 * the tool lane and the legend strip), outside every other plane's disc (so clear of
 * every other plane's concepts), and off every name placed before it. A plane with
 * no such place goes unnamed rather than named somewhere else: the legend strip names
 * every kind by the colour its plane wears. Concept names give way to the placed
 * names (`topology-frame-draw.ts`, the label reservations), so a passing label never
 * lands on one either.
 *
 * Measured on the product's own ontology at 1512×949 with INDEX open, all four
 * names find their right-hand rim.
 */

/** One Strata plane as the frame just drew it, in canvas CSS px. */
export interface TierPlane {
  kind: string;
  /** The rim's screen box. */
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** The height of the rim's left and right extremes — the plane's centre line. */
  y: number;
  /** The plane's assembly ramp, 0..1: a name rises and fades with its plane. */
  a: number;
}

/** Where one name stands, in canvas CSS px. */
export interface TierNameAnchor {
  kind: string;
  /** Which extreme of its rim the name hangs from. */
  side: "right" | "left";
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** The plane's assembly ramp, carried to the name's opacity. */
  a: number;
}

/** The part of the canvas the names may use: the free map, in canvas CSS px. */
export interface TierNameRoom {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The air between a rim and its name, and around every other plane's disc. It clears
 * the discs that sit on a rim: the widest a ring-edge concept draws in Strata is under
 * 7 px (`DOME_NODE_FIT_ALLOWANCE_PX`'s measurement).
 */
export const TIER_NAME_GAP_PX = 8;

/** One name's row height: the `text-label` line box, 11 px type on 16 px leading. */
export const TIER_NAME_ROW_PX = 16;

type Box = { minX: number; maxX: number; minY: number; maxY: number };

/**
 * Does `box` reach into the ellipse inscribed in `plane`'s rim box, grown by `grow`?
 * Scaling x by 1/rx and y by 1/ry turns the ellipse into a unit circle and leaves the
 * box axis-aligned, so the nearest point of the box to the centre decides it exactly.
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

/**
 * Places each plane's name beside its rim, top plane first, or leaves it unnamed.
 * `widths` are the names' rendered widths by kind; a kind without one is not placed.
 */
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
      // Half a gap of air from the chrome too: a name that touches a tile reads as the tile's.
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

/** Whether two placements would draw the same thing — the loop publishes only a change. */
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
