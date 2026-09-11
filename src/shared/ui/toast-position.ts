/**
 * Where the toaster stands.
 *
 * Top-centred is the **default** and the map's own answer (owner, 2026-09-06): the
 * bottom-right corner was behind the agent dock and outside the person's attention,
 * while the map's toolbar at the top centre is where the eye already goes.
 * `ToastProvider` reads `--app-toast-top-offset` (default 16px, the plain edge gap); the
 * map plants this value while mounted so the box clears its toolbar. The toaster is
 * centred on the viewport (owner, 2026-09-07); it no longer shifts left by half of the
 * agent dock's width, which on the Library had stood it over the index column.
 *
 * A surface whose chrome makes that the wrong corner claims another one with
 * `useToastAnchor` and plants the edges below — the Library is the one that does
 * (owner, 2026-09-12).
 *
 * 24px chrome inset + 36px toolbar tile + 12px breathing room.
 */
export const TOAST_TOP_OFFSET_UNDER_MAP_TOOLBAR_PX = 72;

/**
 * **The Library's toast stands in the corner of the pane it is about, not over its head.**
 *
 * Owner, 2026-09-12, on the installed app's Library: *"the toast at the top — its
 * position is odd too, right? (and of course a toast should adjust its position
 * adaptively)"*. The two constants that stood here were the measurement of that
 * oddness rather than a cure for it: a top-centred box on this surface had to be pushed
 * **124px** down (601px and up) and **173px** down (below it) just to miss the pane's own
 * chrome, and at the end of that push it was still a notification about the right pane's
 * work, resting above the left column's title.
 *
 * So this surface anchors to the corner instead, and states the two walls that are not
 * the window's:
 *
 * | Wall | Why it is not the viewport's edge |
 * |---|---|
 * | right | with the conversation open, the pane's right-hand wall is the dock's left edge — `--app-right-dock-width`, already published by this view (`right-dock-reserve.ts`) |
 * | bottom | below `lg` the bottom tab bar stands over this pane, so the floor is its top — `--topology-mobile-bottom-tab-reserve` |
 *
 * Both walls are read through reserves that switch on the width in `app/globals.css`,
 * not in JavaScript: the dock is only a flex sibling of the reader from `xl`, and the tab
 * bar is `lg:hidden`, so each reserve collapses to `0px` exactly where its thing stops
 * existing. A media query is where that already lives; a resize listener recomputing the
 * same two breakpoints in JS would be a second copy of them.
 */
const TOAST_PANE_GUTTER_PX = 16;

/**
 * The gap from the pane's right-hand wall, whichever wall that is.
 *
 * `--app-toast-dock-reserve` is the open conversation's width from `xl` up and `0px`
 * everywhere else. Below `xl` the dock is a full-width overlay with no reader beside it,
 * so there is no pane left to stand in and the toast is drawn above it — the same
 * transient-above-the-dock judgement the map's own placement already accepted
 * (`docs/DECISIONS.md`, 2026-09-07).
 */
export const LIBRARY_TOAST_RIGHT_OFFSET = `calc(var(--app-toast-dock-reserve, 0px) + ${TOAST_PANE_GUTTER_PX}px)`;

/**
 * The gap from the pane's floor — the window's edge from `lg` up, the bottom tab bar's
 * top below it. Measured at 1040×720 the bar is not drawn and this is 16px; at 620×900 it
 * is 56px of bar plus the safe-area inset plus the same 16px.
 */
export const LIBRARY_TOAST_BOTTOM_OFFSET = `calc(var(--app-toast-bottom-reserve, 0px) + ${TOAST_PANE_GUTTER_PX}px)`;

/**
 * **Inside a viewport-filling dialog, not across its edge.**
 *
 * The Library's two full-surface dialogs — the graph and the answer comparison — are
 * `size="viewport"`: `--chrome-inset` from every window edge, with `p-4` inside that
 * (`src/shared/ui/dialog.tsx`). At the plain gutter the toast came to rest in the corner
 * of that box, on the dialog's own padding and its close control — a dismissible aside
 * laid over a surface a person is reading, which is the floating-box soup the design
 * charter refuses. So while one of them stands, both gutters grow to the dialog's inset
 * plus its padding plus the same gutter, and the box sits **inside** the dialog's safe
 * area.
 *
 * The narrow `size="md"` dialogs need nothing: they are centred and bounded, so the
 * window's bottom-right corner is beside them rather than on them (measured at
 * 1512×901 and 1040×720).
 *
 * `LibraryPage` decides, because it owns both open states. A second surface with a
 * full-window dialog and a corner-anchored toast is the moment to move this into the
 * `Dialog` primitive itself; one is not.
 */
export const LIBRARY_TOAST_DIALOG_OFFSET = `calc(var(--chrome-inset) + ${TOAST_PANE_GUTTER_PX}px * 2)`;
