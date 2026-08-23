/**
 * The toast bottom-offset contract.
 *
 * The problem: sonner toasts are pinned bottom-right, so at the default 16px offset
 * they cover the write button on the builder's bottom confirm bar — worst on short
 * viewports such as 1440×900.
 *
 * The fix: lift the toast by whatever height the bottom bar reserves. ToastProvider
 * reads the `--app-toast-bottom-offset` CSS variable (default 16px), and while the
 * builder page is mounted the value computed here is planted in it. Every other page
 * keeps the default, so there is no regression.
 */

/** Default gap from the screen edge to the toast (px). */
export const TOAST_EDGE_GAP_PX = 16;

/**
 * Height (px) reserved by the builder's bottom write bar.
 * The bar is button h-8 (32) + py-2.5 (20) + border (2) ≈ 54px, plus its mt-2 (8)
 * and enough slack for the toast to clear it. At 1440×900 the toast's bottom (88px)
 * still sits above the bar's top (≈62px), so the button stays uncovered.
 */
export const BUILDER_WRITE_BAR_RESERVE_PX = 72;

/**
 * Bottom offset (px) that lifts the toast clear of the reserved height. With
 * `reservedBottomPx` at 0 (nothing reserved) this is just the default gap.
 */
export function resolveToastBottomOffset(reservedBottomPx = 0): number {
  return TOAST_EDGE_GAP_PX + Math.max(0, reservedBottomPx);
}

/**
 * Offset that clears the map's persistent instrument stack in the bottom-right (the
 * relation legend plus the instrument readout).
 *
 * Measured during entry review: the auto-arrange toast covered that stack
 * **completely** — the legend lines [show the main branches] and
 * [elements appear as you zoom in] disappeared and the
 * readout's left edge was clipped. Both are pinned bottom-right while the toast sat
 * at the default 16px offset. Tufte: decoration must not hide data — here a
 * notification hid a persistent instrument.
 *
 * The reserve is **taken from the stack's real rect** rather than pinned as a
 * constant: the legend's lines change with locale, vocabulary register, and zoom
 * tier, and at ≥1920 the corner inset token grows too. A constant would be right for
 * exactly one of those and wrong for the rest.
 *
 * @param viewportHeight `window.innerHeight`
 * @param stackTop the stack's `getBoundingClientRect().top`
 */
export function resolveToastBottomOffsetForStack(
  viewportHeight: number,
  stackTop: number,
): number {
  return resolveToastBottomOffset(Math.round(viewportHeight - stackTop));
}

/**
 * **Offset that clears the right-hand dock.**
 *
 * Owner's screen, 2026-08-16: a toast reading [created 5 ontology concepts and 3 agent config files] sat
 * **directly on top of the chat panel's composer.** Same shape as the bottom offset
 * above: the toast is pinned `bottom-right` at `right: 16`, and once a panel stands
 * to the right of the map those 16px are **inside the panel**. As long as a
 * notification positions itself against the screen edge, it lands on whatever stands
 * at that edge.
 *
 * The reserve is **taken from the measured rect** rather than pinned as a constant:
 * the panel's width is dragged by the user (320–968px) and remembered. A constant
 * would be right at exactly one of those widths.
 *
 * @param reservedRightPx actual width of the dock standing on the right; 0 when none.
 */
export function resolveToastRightOffset(reservedRightPx = 0): number {
  return TOAST_EDGE_GAP_PX + Math.max(0, reservedRightPx);
}
