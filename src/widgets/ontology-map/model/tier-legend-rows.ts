/**
 * **Where the Strata legend rail puts its four rows.**
 *
 * The names of the four planes used to hang on the rims themselves
 * (`render/dome-rings.ts`, `drawTierLabels`), and at 1040×720 that put them on
 * top of the graph: the fit takes the widest plane's rim to the canvas edge, so
 * there is no clear space outside the ring to hang a name in. The names move to a
 * rail at the canvas's right edge instead, below the utility tiles, where nothing
 * is drawn.
 *
 * A rail that simply stacked four rows would break what the rim names were good
 * at — saying *which* ring each name belongs to. So each row keeps its own
 * plane's **projected height**, which changes on every orbit frame and through a
 * morph. Three things have to hold at once and they can conflict:
 *
 * 1. each row sits at its plane's height,
 * 2. the four rows keep their order and never overlap each other,
 * 3. the block stays inside the band left between the utility rail and the
 *    bottom readout.
 *
 * When the projection crowds two planes together — a shallow pitch flattens all
 * four towards one line — (2) and (3) win and the rows spread to the minimum
 * spacing around where they wanted to be. Row heights stay equal whatever
 * happens; a row is never made shorter to fit, because a legend whose rows differ
 * in height by accident is the "content-decided card height" defect wearing a
 * different hat.
 */

/**
 * **Where the four tier names go — and why it is not always the rail.**
 *
 * The rail hangs at the canvas's right edge, so the overview fit has to keep that
 * column clear or a name lands on a disc. Measured on the sample vault at
 * 1040x720 (2026-09-06) that reservation cost 6% of a 976 px canvas — the width
 * is what binds the fit at that size — and the picture paid: 72.5% fill down to
 * 63.6%, and two element pairs on one plane touching where none did.
 *
 * At 1512x982 the same reservation costs nothing at all, because there the fit is
 * bound by **height** and 236 px of width sit unused beside the graph. So the
 * rail is not wrong; taking the column unconditionally is. This predicate is the
 * condition, and both sides read it: the fit reserves the column only where this
 * says `rail`, and the legend draws its compact corner stack everywhere else.
 *
 * `freeWidth`/`freeHeight` are the fit's own effective box —
 * `computeDomeFitCameraTarget`'s `effW`/`effH`, the canvas minus the panels
 * measured over it and the cone's top and bottom bands — so the two cannot drift.
 */
export const TIER_LEGEND_RAIL_COLUMN_PX = 56;

/**
 * Strata's drawn silhouette is very nearly square, and stays that way across
 * sizes: 607x567 (1.071) at 1040x720, 888x824 (1.078) at 1512x982, 800x741
 * (1.080) at 1440x900, all measured with no legend reservation at all. The
 * larger reading is the constant, so a borderline canvas falls to the corner
 * rather than to a name on a disc.
 *
 * Gate: `tests/e2e/map-3d-strata-drawing.spec.ts` measures the fill and the
 * touching pairs at both review sizes, which is what this number buys.
 */
export const STRATA_SILHOUETTE_ASPECT = 1.08;

export type TierLegendPlacement = "rail" | "corner";

/**
 * `rail` only when the rail's column is width the fit was not going to use:
 * Strata is width-bound as soon as the free box is narrower than its silhouette,
 * and one column more of width is then one column less of graph.
 */
export function tierLegendPlacement(freeWidth: number, freeHeight: number): TierLegendPlacement {
  if (!(freeWidth > 0) || !(freeHeight > 0)) return "corner";
  return freeWidth - TIER_LEGEND_RAIL_COLUMN_PX >= freeHeight * STRATA_SILHOUETTE_ASPECT ? "rail" : "corner";
}

export interface TierLegendAnchor {
  kind: string;
  /** The plane's projected height this frame, in canvas CSS px. */
  y: number;
}

export interface TierLegendRow {
  kind: string;
  /** The row's top edge, in the rail container's own coordinates (CSS px). */
  top: number;
}

/**
 * Lays the rows out, or returns `null` when the band cannot hold them at their
 * equal height — the caller then leaves the rim names on, which is the honest
 * fallback on a very short canvas. Never both: the rim names exist only while
 * this returns null.
 *
 * `anchors` arrive top tier first and in canvas coordinates; `containerTop` is
 * where the rail begins in those same coordinates, so the returned `top` values
 * are relative to the rail.
 */
/**
 * **A rail that cannot sit beside the plane it names is not a rail.**
 *
 * The rail's whole claim is that a row's height answers "which ring is this name
 * for" without the reader counting rings. Its band starts under the last utility
 * tile, so a plane projected above that tile is out of reach and
 * `layoutTierLegendRows` clamps the row to the top of the band — where it no
 * longer names anything, and pushes its neighbour down with it. Measured in
 * Strata at 1512x982 with the sample folder expanded: rows landed at 330, 350,
 * 531 and 704 while the planes sat at 124, 316, 507 and 614, so the project's
 * name stood 206 px from the only project node and the top two rows touched at
 * exactly one row's spacing while the others were about 175 px apart.
 *
 * This reports whether every row kept its plane. The caller uses the corner
 * stack when it did not: the corner gives up per-plane alignment out loud, which
 * is honest, where a misaligned rail is a rail that lies.
 *
 * The tolerance is the row's own height — a name within one row of its ring
 * still reads as that ring's — so this invents no number of its own.
 */
export function tierLegendWorstOffset(
  rows: readonly TierLegendRow[],
  anchors: readonly TierLegendAnchor[],
  containerTop: number,
  rowHeight: number,
): number {
  if (rows.length !== anchors.length) return Number.POSITIVE_INFINITY;
  let worst = 0;
  for (const [index, row] of rows.entries()) {
    worst = Math.max(worst, Math.abs(containerTop + row.top + rowHeight / 2 - anchors[index].y));
  }
  return worst;
}

export function tierLegendRowsAlign(
  rows: readonly TierLegendRow[],
  anchors: readonly TierLegendAnchor[],
  containerTop: number,
  rowHeight: number,
  tolerance: number = rowHeight,
): boolean {
  return tierLegendWorstOffset(rows, anchors, containerTop, rowHeight) <= tolerance;
}

export function layoutTierLegendRows(
  anchors: readonly TierLegendAnchor[],
  containerTop: number,
  containerHeight: number,
  rowHeight: number,
): TierLegendRow[] | null {
  const count = anchors.length;
  if (count === 0 || rowHeight <= 0) return null;
  if (containerHeight < count * rowHeight) return null;

  const rows: TierLegendRow[] = [];
  let previousCentre = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < count; i += 1) {
    // The room this row needs to leave for the ones below it, and the room the
    // ones above it have already taken.
    const lowest = rowHeight * (i + 0.5);
    const highest = containerHeight - rowHeight * (count - 1 - i + 0.5);
    const wanted = anchors[i].y - containerTop;
    const floor = Math.max(lowest, previousCentre + rowHeight);
    const centre = Math.min(Math.max(wanted, floor), highest);
    previousCentre = centre;
    rows.push({ kind: anchors[i].kind, top: centre - rowHeight / 2 });
  }
  return rows;
}
