/**
 * The toaster defaults to the bottom of the free lane between the `data-toast-wall` walls
 * (`toast-walls.ts`), 16px above the floor. A surface whose notices concern one pane claims its
 * corner with `useToastAnchor` and plants the offsets below.
 */

/**
 * The Library anchors to its reading pane's corner. Its right wall is the open dock's edge and
 * its floor the tab bar's top below `lg`; both come from reserves that switch
 * in `app/globals.css`, so the breakpoints are not copied into JavaScript.
 */
const TOAST_PANE_GUTTER_PX = 16;

/**
 * The `--app-toast-dock-reserve` value is the dock width from `xl` up and `0px` elsewhere;
 * below `xl` the dock is a full-width overlay, so the toast is drawn above it
 * (`docs/DECISIONS.md`).
 */
export const LIBRARY_TOAST_RIGHT_OFFSET = `calc(var(--app-toast-dock-reserve, 0px) + ${TOAST_PANE_GUTTER_PX}px)`;

/** The window edge from `lg` up, the bottom tab bar's top below it. */
export const LIBRARY_TOAST_BOTTOM_OFFSET = `calc(var(--app-toast-bottom-reserve, 0px) + ${TOAST_PANE_GUTTER_PX}px)`;

/**
 * While a viewport-sized Library dialog stands, the gutters grow by its inset and padding so
 * the toast stays inside the dialog instead of on its close control. `LibraryPage` decides
 * because it owns both open states.
 */
export const LIBRARY_TOAST_DIALOG_OFFSET = `calc(var(--chrome-inset) + ${TOAST_PANE_GUTTER_PX}px * 2)`;
