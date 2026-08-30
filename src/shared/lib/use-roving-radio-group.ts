"use client";

import { useRef, type KeyboardEvent } from "react";

/**
 * **The behaviour layer of a radiogroup** — roving tabindex, arrow-key wrapping,
 * and selection-follows-focus (ratified 2026-08-15 by the design-systems seat).
 *
 * **Why a separate hook: the containers do not converge, but the behaviour is
 * one.** Ledger entry 3 of 2026-08-15 built `SegmentedControl` and absorbed 5
 * hand-rolled copies, but that round missed more. The full inventory:
 * `role="radiogroup"` outside the primitive, **5 occurrences (11 groups)**, plus
 * **9 groups** expressing exclusive selection through `aria-pressed` — a final
 * population of 18 groups with **0 roving implementations and 0 onKeyDown
 * handlers**. 100%.
 *
 * In other words the role promised assistive technology that arrow keys move
 * between items here, and that happened nowhere — exactly the defect the
 * founding inventory named, still alive.
 *
 * **But the containers do not converge into one.** Four measured families:
 *
 * | Family | Groups | Container |
 * |---|---:|---|
 * | well | 4 | `border + bg-overlay-1 + p-px` — the primitive's canonical form |
 * | detached chip row | 12 | `flex flex-wrap items-center gap-1.5` (9 byte-identical + 1 no-op) |
 * | grid tiles | 2 | `grid grid-cols-2` with `shape:'tile'` preview cards |
 * | vertical list rows | 2 | radiogroup is **the wrong container** — moved to `aria-current` |
 *
 * Same grammar as ledger entry 7 of 2026-08-15: **classifiable (they are all
 * radiogroups) is not convergeable (they share one container).** Forcing an axis
 * onto containers that do not converge means bolting on one axis after another,
 * which is the disease behind the 8–9 control heights on one screen.
 *
 * So the layers split — **behaviour is this one hook, the container belongs to
 * the site.** `SegmentedControl` applies the two majority containers (well,
 * chips) automatically; everything else wears this hook directly.
 *
 * **Why the hook alone is not enough** (and so the primitive stays). The Dialog
 * ledger (2026-08-15) learned it in the same position: the behaviour hook and
 * the convention already existed — what was missing was **the place that applies
 * them for you**. Even while `useDialogFocusTrap` existed, `aria-modal` was
 * declared 20 times against 8 real traps. Hand out only the hook and 12 sites
 * wire it themselves, which is the path that produced today's roving 0.
 *
 * **What it does**: refs, tabIndex (only the checked item is a tab stop), →↓/←↑
 * wrapping with selection-follows-focus (matching native radios), and Space.
 *
 * **What it does not do**: emit any value at all (no className is returned);
 * **Home/End** (those belong to the tabs pattern, not the radio pattern — the
 * contract blocks the regression that arrives when someone copies tab-bar);
 * **Escape** (it does not steal a popover's Escape); and group-level `disabled`
 * (that removes the only tab stop and drops keyboard users to the top of the
 * document — `busy` makes re-selection a no-op, it does not disable).
 *
 * Gate: `tests/contract/radiogroup-behavior-ratchet.contract.test.ts` counts
 * `role="radiogroup"` outside the primitive and passes a registered site only if
 * **a call to this hook is really present** in the same file (the ledger turns
 * red when it is more generous than the measurement).
 */

export interface RovingRadioGroupOptions<T> {
  /** The currently checked value. If no item matches, the first becomes the tab stop (APG). */
  value: T;
  /** The item values — this order is the arrow-key cycle order. */
  values: readonly T[];
  onChange: (next: T) => void;
  /** A transition is in flight — locks re-selection only; focus stays alive. Never disables the group. */
  busy?: boolean;
}

interface RovingRadioItemProps {
  ref: (el: HTMLButtonElement | null) => void;
  role: "radio";
  "aria-checked": boolean;
  "aria-disabled": true | undefined;
  tabIndex: 0 | -1;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

export interface RovingRadioGroup {
  /** Spread onto the group container — role and aria-busy only, no values. */
  groupProps: { role: "radiogroup"; "aria-busy": true | undefined };
  /** Spread onto item `index`. `type="button"` is the consumer's to supply. */
  itemProps: (index: number) => RovingRadioItemProps;
  /** Index of the checked item, or -1. */
  checkedIndex: number;
}

export function useRovingRadioGroup<T>({
  value,
  values,
  onChange,
  busy,
}: RovingRadioGroupOptions<T>): RovingRadioGroup {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const checkedIndex = values.findIndex((v) => v === value);
  // APG: with no checked item, the first item is the tab stop.
  const tabStopIndex = checkedIndex >= 0 ? checkedIndex : 0;

  const select = (index: number) => {
    if (busy) return;
    if (index < 0 || index >= values.length) return;
    itemRefs.current[index]?.focus({ preventScroll: true });
    const next = values[index];
    if (next !== value) onChange(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      select((index + 1) % values.length);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      select((index - 1 + values.length) % values.length);
    } else if (event.key === " ") {
      event.preventDefault();
      select(index);
    }
  };

  return {
    groupProps: { role: "radiogroup", "aria-busy": busy || undefined },
    checkedIndex,
    itemProps: (index) => ({
      ref: (el) => {
        itemRefs.current[index] = el;
      },
      role: "radio",
      "aria-checked": index === checkedIndex,
      "aria-disabled": busy || undefined,
      tabIndex: index === tabStopIndex ? 0 : -1,
      onClick: () => select(index),
      onKeyDown: (event) => handleKeyDown(event, index),
    }),
  };
}
