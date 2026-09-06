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
