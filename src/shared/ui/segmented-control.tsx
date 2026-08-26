"use client";

import { type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";
import { controlClass, type ControlSize } from "./control-class";

/**
 * SegmentedControl — **exclusive single selection** inside a bordered box
 * (ratified 2026-08-15 by the design-systems seat, co-signed by interaction).
 *
 * **Founding inventory — the drift across 5 hand-rolled copies.** Three ARIA
 * dialects (aria-pressed 2 · radiogroup 3, and **0 roving implementations**: the
 * role promised arrow-key movement and nothing happened), 3 container insets,
 * 3 backgrounds, and 2 languages for expressing selection (the hand-rolled
 * combination measured 1.17:1 ink contrast — an optical illusion, not a state).
 * Two of the copies lived in the feature layer purely because FSD kept them out
 * of the widget, which is what justified promoting this.
 *
 * **Grammar — a two-way on/off is still a radiogroup.** Each segment's label
 * names **the value**, not the setting ("dev/general", "EN/KO", "on/off"), and
 * putting `aria-pressed` on siblings does not put exclusivity into the
 * accessibility tree. A radio group gives set membership, position and
 * exclusivity at once (APG radio group). **`aria-pressed` cannot be expressed by
 * this primitive** — that grammar is correct only for a single toggle whose name
 * does not change (spotlight, preview), which is not a consumer of this
 * component.
 *
 * **Keyboard — now owned by the hook** (second round, 2026-08-15). Roving
 * tabindex, →↓/←↑ wrapping plus selection-follows-focus, Space, no Home/End, no
 * Escape handling — **the one implementation is
 * `shared/lib/use-roving-radio-group`** and this file wears it. Why they are
 * separate: the founding round missed further hand-rolled radiogroups (final
 * population 18 groups, roving 0, 100%), and some of them — grid tiles, for
 * instance — have a **genuinely different container**, so they cannot converge
 * on one component and wear the hook directly instead. This file survives to
 * **apply the two majority containers automatically**: hand out only the hook
 * and every site wires it up itself, which is the path that produced today's
 * roving 0 (as the Dialog ledger put it).
 *
 * **Two canonical containers (`variant`)**
 *
 * | | Container | Item | Measured |
 * |---|---|---|---:|
 * | `well` (default) | `inline-flex gap-px … p-px` | `shape:'segment'` | 4 groups |
 * | `chips` | `flex flex-wrap items-center gap-1.5` | `shape:'chip'` | **10/12 already used this grammar** |
 *
 * `chips` is not a new value but **the registration of a measured majority** (9
 * byte-identical, 1 that only gained a no-op). And `Choice`'s hand-written
 * override `h-8 px-3 text-body` is **geometrically equal** to `chip lg`
 * (`min-h-8 px-3 py-1 text-body`), so that migration moves 0 pixels — the only
 * thing that moves is the selection colour, and the founding inventory recorded
 * "2 languages" there while **3** were actually alive (Choice's hand-rolled
 * combination, TopologyIndexPanel's third language, and the ramp's `active`).
 *
 * **Canonical container — the inset was decided by the ramp, not by majority.**
 * Only `p-px + gap-px` leaves the container's natural height (28/36) inside the
 * height vocabulary over items of 24/32: `p-0.5` gives 30/38 and `p-1` gives
 * 34/42, all values already condemned as outside the vocabulary. The background
 * is `--color-overlay-1` (an alpha, so it stays parent+2% over any surface, the
 * same family as `fieldClass` boxed). Soft border and chip radius were 5/5
 * unanimous.
 *
 * `busy` sets `aria-busy` on the group and makes re-selection a no-op —
 * **never disable the group**, because that removes the only tab stop and drops
 * keyboard users back to the top of the document.
 *
 * **Hover (2026-08-26).** An unselected segment answers the pointer with the
 * value layer's registered pair for this shape — `hoverSurface: 'lift'`
 * (`--color-overlay-2`) plus `hoverInk: 'strong'` (`--color-text-primary`), the
 * same language the sibling `RowButton` list on `/architecture` already wears.
 * Measured before this: `/ko/architecture/` had **0 of 4** visible controls
 * answering hover, starving `tests/e2e/hover-contrast.spec.ts` below its floor
 * of 3 compared controls. The **selected** segment deliberately stays silent:
 * the three hover axes never emit under `active` (hover on a selection weakened
 * its border 2.09 → 1.48 where they overlapped, ledger entry 10/11), and
 * raising the `a16` selection tint one step is the exact tint-hover AA failure
 * family the hover-contrast gate documents.
 *
 * ⚠️ **The overlay-1 well only works paired with border-soft** (the premise of
 * the hierarchy seat's approval, 2026-08-15): the well surface itself measures
 * ≈1.16:1 against its surroundings and is effectively invisible, which is the
 * correct casting (a visible control well puts the spotlight on a supporting
 * role). The border carries the boundary and the `active` tint carries the
 * state — remove the border and the well disappears from the screen.
 */

type SegmentedName =
  | { ariaLabel: string; labelledBy?: never }
  | { ariaLabel?: never; labelledBy: string };

export interface SegmentedOption<T extends string | number | boolean> {
  value: T;
  label: ReactNode;
  /** Full name for screen readers when the visible label is an abbreviation (EN, KO). */
  ariaLabel?: string;
  /**
   * Mouse tooltip, passed straight to the native attribute. Opened because 2
   * measured consumers need it (FirstRunStarter, ProjectDrawer). **A per-option
   * `className` stays closed** — a "placement only" prop contract becomes the
   * import route for spec values (stated by the design-systems seat).
   */
  title?: string;
  testId?: string;
}

export type SegmentedControlProps<T extends string | number | boolean> = SegmentedName & {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (next: T) => void;
  /** Value-layer size step; defaults to lg (32px, promoted to 44 under coarse pointers). */
  size?: Extract<ControlSize, "md" | "lg">;
  /**
   * Container — the two measured majorities. Defaults to `well` (a joined well,
   * 4 groups). `chips` is a row of detached chips
   * (`flex flex-wrap items-center gap-1.5`): 9 byte-identical groups plus 1 that
   * only gained a no-op, so 10 of 12 already used that grammar.
   */
  variant?: "well" | "chips";
  /**
   * Items divide the width equally. 3 measured consumers (BlockImport,
   * FirstRunStarter, StudioMaterialize) — with two options the widths are
   * mathematically identical to `grid-cols-2`.
   */
  fill?: boolean;
  /** A transition is in flight — locks re-selection only; focus stays alive. Never disables the group. */
  busy?: boolean;
  testId?: string;
  /** Placement only — spec values do not go here. */
  className?: string;
};

export function SegmentedControl<T extends string | number | boolean>({
  ariaLabel,
  labelledBy,
  value,
  options,
  onChange,
  size = "lg",
  variant = "well",
  fill,
  busy,
  testId,
  className,
}: SegmentedControlProps<T>) {
  /*
   * Behaviour is not implemented here — `useRovingRadioGroup` is the one
   * implementation. This file exists to **apply the container automatically**;
   * without it all 12 sites wire it themselves (Dialog ledger, 2026-08-15: what
   * was missing is the place that applies it for you).
   */
  const group = useRovingRadioGroup<T>({
    value,
    values: options.map((o) => o.value),
    onChange,
    busy,
  });

  return (
    <div
      {...group.groupProps}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      data-testid={testId}
      className={cn(
        variant === "well"
          ? "inline-flex items-center gap-px rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-px"
          : "flex flex-wrap items-center gap-1.5",
        fill && (variant === "well" ? "flex w-full" : "w-full"),
        className,
      )}
    >
      {options.map((option, index) => {
        const item = group.itemProps(index);
        return (
          <button
            key={String(option.value)}
            {...item}
            type="button"
            aria-label={option.ariaLabel}
            title={option.title}
            data-testid={option.testId}
            className={controlClass({
              shape: variant === "well" ? "segment" : "chip",
              size,
              active: item["aria-checked"],
              hoverInk: "strong",
              hoverSurface: "lift",
              className: fill ? "min-w-0 flex-1" : undefined,
            })}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
