/**
 * Click-vs-drag hysteresis threshold — ported from the B2+ prototype's
 * `pointermove` handler (`docs/prototypes/topology-b2plus.html` §9):
 * ```
 * if (!pointer.dragging && Math.sqrt(ddx*ddx + ddy*ddy) > HYSTERESIS) {
 *   pointer.dragging = true;
 * }
 * ```
 * where `HYSTERESIS = 7` (px). This is the click-safe contract's mechanical
 * core (`.claude/rules/design.md` 「Click=safe contract」 — a click is a safe contract;
 * `docs/INTERACTION-DESIGN.md`
 * §1): a pointerdown does not commit to a drag until the pointer has moved
 * more than `thresholdPx` from its down-position — below that, a
 * pointerup is a click (`setFocus`/`clearFocus`), not a pan.
 *
 * Value note: `docs/TOPOLOGY-V2-DESIGN.md` §2.4 resolves a design-doc-level
 * tension explicitly — `INTERACTION-DESIGN.md` §1 recommends "~10px" in
 * general, but this prototype measured and shipped `7px`
 * (`--topology-v2-hysteresis-px`), and the design doc says the prototype's
 * concrete value wins. Use `7`, not `10`, unless a later design pass changes
 * the token.
 *
 * Pure geometry — no pointer-event/DOM knowledge. `interaction/pointer-state-machine.ts`
 * calls this once per pointermove while `dragging` is still false.
 *
 * Exact expected values are pinned in `hysteresis.test.ts`.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * True once the pointer has moved further than `thresholdPx` (Euclidean
 * distance) from `downPoint` — the point at which a pointerdown should be
 * reclassified from "pending click" to "dragging".
 *
 * @param downPoint screen coordinates at pointerdown
 * @param currentPoint current screen coordinates (pointermove)
 * @param thresholdPx `--topology-v2-hysteresis-px` = 7
 */
export function exceedsHysteresisThreshold(
  downPoint: Point,
  currentPoint: Point,
  thresholdPx: number,
): boolean {
  const dx = currentPoint.x - downPoint.x;
  const dy = currentPoint.y - downPoint.y;
  return Math.sqrt(dx * dx + dy * dy) > thresholdPx;
}
