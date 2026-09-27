/**
 * A transient surface declares its kind through one attribute so the sweeping check
 * measures it instead of guessing; a hand-kept list silently goes toothless. Each kind
 * owes different properties:
 *
 * | Kind | Position | Focus | Escape |
 * |---|---|---|---|
 * | `anchored` popovers and lists | beside what opened it | may take focus | closes and returns focus |
 * | `menu` context menus | beside the invocation point | may take focus | closes and returns focus |
 * | `sheet` blocking sheets and modals | relative to the viewport | takes focus (and traps it) | closes and returns focus |
 * | `notice` brief note beside its cause | beside the cause | must not take focus | dismisses itself |
 * | `hint` card raised on hover | beside what is pointed at | must not take focus | disappears when the pointer leaves |
 *
 * Toasts are absent: the check accepts sonner's `data-sonner-toast` as their declaration.
 */

export const TRANSIENT_SURFACE_ATTR = "data-transient-surface" as const;

export type TransientSurfaceKind = "anchored" | "menu" | "sheet" | "notice" | "hint";

/** Kinds that must not take focus: surfaces you lose nothing by missing. */
export const FOCUSLESS_KINDS: readonly TransientSurfaceKind[] = ["notice", "hint"];

/** Kinds that must stand beside what raised them. */
export const ANCHORED_KINDS: readonly TransientSurfaceKind[] = [
  "anchored",
  "menu",
  "notice",
  "hint",
];

/**
 * Spread into JSX (`<div {...transientSurface("notice")}>`) so nobody hand-writes the string: a
 * typo would silently drop the surface from the sweep.
 */
export function transientSurface(kind: TransientSurfaceKind): Record<string, string> {
  return { [TRANSIENT_SURFACE_ATTR]: kind };
}
