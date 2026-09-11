/**
 * Where the toaster stands.
 *
 * Toasts are top-centred (owner, 2026-09-06): the bottom-right corner was behind the
 * agent dock and outside the person's attention, while the map's toolbar at the top
 * centre is where the eye already goes. `ToastProvider` reads
 * `--app-toast-top-offset` (default 16px, the plain edge gap); the map plants this
 * value while mounted so the box clears its toolbar. The toaster is centred on the
 * viewport (owner, 2026-09-07); it no longer shifts left by half of the agent dock's
 * width, which on the Library had stood it over the index column.
 *
 * 24px chrome inset + 36px toolbar tile + 12px breathing room.
 */
export const TOAST_TOP_OFFSET_UNDER_MAP_TOOLBAR_PX = 72;

/**
 * The Library plants this while it is mounted, for the same reason the map plants the
 * constant above: a top-centred toast lands on whatever that surface stacks at the top
 * of its pane, and the Library stacks two things there.
 *
 * Measured at 1920x1080 with the work lane live: at the plain 16px edge gap the toast
 * came to rest at 16..58 and clipped the top two pixels of the receipt row — nothing was
 * ever unreachable, but a notification resting on the receipts it is about is the overlap
 * the design rules refuse to accept quietly. Clearing only the lane was not enough: the
 * box came off the receipts and onto the header row instead. So it clears the pane's
 * chrome entirely and floats over the canvas, which is where the map's toast already
 * sits — the chrome's height plus the same 12px of breathing room the map leaves.
 *
 * **The chrome shrank on 2026-09-11** (`docs/DECISIONS.md`, "The Library keeps its spine,
 * and computes the structural check itself"). The work lane collapsed from two rows to
 * one from `sm` up, so the stack this number clears is the 64px lane plus the 48px
 * header row, not 112 + 48. 112 + 12 = 124. The old 172 still cleared, but it had stopped
 * being a measurement of anything.
 *
 * ⚠️ **This reaches nothing below 600px of viewport.** sonner switches to its own
 * `mobileOffset` there (`@media (max-width: 600px)`, `--mobile-offset-top`), so the
 * narrow constant below is the Library's answer for that band and this one covers 601px
 * and up. The lane's own rows switch on the same 600px boundary rather than on `sm`
 * (640): between them the desktop offset would have stood over a two-row lane, which is
 * the 37px overlap design-responsive measured at 620×900 (council 2026-09-11).
 */
export const TOAST_TOP_OFFSET_UNDER_LIBRARY_PANE_CHROME_PX = 124;

/**
 * The same clearance in the band where sonner will not read the value above.
 *
 * Below 601px the work lane keeps both of its rows, because at 390px the single line
 * pushed the first receipt past the right edge — so the stack to clear is the 112px lane
 * plus the header row above the reader. Measured on the branch export with a conversation
 * open (guardian, 2026-09-11): that chrome ends at **y 146** at 390 and 600 wide, and this
 * value leaves the toast's top edge 27px clear of it — the same margin the desktop
 * constant above actually leaves on its own side (98 → 124, 26px), so neither band is
 * tighter than the other. At sonner's 16px default the box came to rest inside the receipt
 * row instead (design-responsive, measured at 390×844).
 */
export const TOAST_TOP_OFFSET_UNDER_LIBRARY_PANE_CHROME_NARROW_PX = 173;
