/**
 * **A transient surface declares what it is** (2026-08-11).
 *
 * **Why it exists — there was a layer no check could see.** On 2026-08-10 the
 * owner found three defects in the real app. The notice shown when arrow-key
 * walking on the map reaches a dead end ① appeared in the bottom-right corner
 * (500px from the blocked node), ② never dismissed itself, and ③ **swallowed the
 * arrow keys entirely while it was up**. All three had one cause: it was raised
 * through the app-wide toast, whose close button stops the dismissal timer when
 * it takes focus, and the keys then never reach the canvas.
 *
 * **The problem was not the defect but that no check could see it.** An
 * instrument sweeping every route did not see it either: nothing on screen told
 * the app which element was "the notice", so the instrument picked the
 * **largest** element and measured the scrim instead of the dialog. It reported
 * 6 violations, every one of them the instrument's own fault (the settings sheet
 * closes on Escape and returns focus correctly). Neither passing nor failing was
 * evidence.
 *
 * This repo has had that disease repeatedly — motion checks carried
 * **hand-maintained file lists**, so a surface missing from the list was quietly
 * outside the check (dropdown open/close actually was). It is the discipline
 * `/gate-probe` names: making a human maintain the list means the check silently
 * goes toothless whenever an entry is not added.
 *
 * **So each surface declares its kind through one attribute.** The check then
 * measures that instead of guessing, and each kind owes different properties:
 *
 * | Kind | Position | Focus | Escape |
 * |---|---|---|---|
 * | `anchored` popovers and lists | beside what opened it | may take focus | closes and returns focus |
 * | `menu` context menus | beside the invocation point | may take focus | closes and returns focus |
 * | `sheet` blocking sheets and modals | relative to the viewport | takes focus (and traps it) | closes and returns focus |
 * | `notice` brief note beside its cause | **beside the cause** | **must not take focus** | dismisses itself |
 * | `hint` card raised on hover | beside what is pointed at | **must not take focus** | disappears when the pointer leaves |
 *
 * "Must not take focus" for `notice` and `hint` is the point of this file — that
 * one property makes two of the three 2026-08-10 defects structurally impossible.
 *
 * **Why toasts are not here.** sonner already sets `data-sonner-toast`. A second
 * attribute meaning the same thing would be a duplicate, so the sweeping check
 * **accepts that attribute as a toast's declaration**.
 */

export const TRANSIENT_SURFACE_ATTR = "data-transient-surface" as const;

export type TransientSurfaceKind = "anchored" | "menu" | "sheet" | "notice" | "hint";

/** Kinds that **must not** be able to take focus — surfaces you lose nothing by missing. */
export const FOCUSLESS_KINDS: readonly TransientSurfaceKind[] = ["notice", "hint"];

/** Kinds that must stand **beside** what raised them — in a screen corner they do not connect to their cause. */
export const ANCHORED_KINDS: readonly TransientSurfaceKind[] = [
  "anchored",
  "menu",
  "notice",
  "hint",
];

/**
 * Spread into JSX — `<div {...transientSurface("notice")}>`.
 *
 * The point is that nobody hand-writes the string: a typo is indistinguishable
 * from no declaration at all, and the sweeping check then skips that surface
 * **without saying anything**.
 */
export function transientSurface(kind: TransientSurfaceKind): Record<string, string> {
  return { [TRANSIENT_SURFACE_ATTR]: kind };
}
