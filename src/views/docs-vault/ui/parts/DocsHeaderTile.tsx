import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { CONTROL_DISABLED_CLASS } from "@/shared/ui/control-class";

export interface DocsHeaderTileProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title" | "className"> {
  icon: ReactNode;
  /** The tooltip, and the default accessible name. */
  title: string;
  "aria-label"?: string;
  /** The currently open or toggled state — shown by an indigo border and surface only (no second colour). */
  active?: boolean;
  className?: string;
}

/**
 * The square icon tile in the docs header — sized by `--chrome-tile-size` (36px), with
 * `--chrome-radius-inner` for the radius and chrome tokens for border, hover, and active.
 *
 * **Why it has no size token of its own** (2026-08-03). It had one — `--docs-header-tile-size`
 * (34px). That 34 was **a fossil, not a design value**: an older version of this comment recorded
 * its basis outright — *"`ChromeTile` hard-pins `--chrome-tile-size` (**44px**), which does not
 * meet the header's density requirement (34px)."* But the chrome tile **came down to 36px** on
 * 2026-07-23 (owner's third report, *"딱봐도 크다"* — it is obviously too big). Nobody re-derived
 * the 34 on the day its only basis disappeared, leaving one role with two values and two
 * coarse-promotion rules.
 *
 * So **a square icon tile now has one dimension**. This file is still separate from `ChromeTile`
 * because of the **radius**, not the size — a tile seated inside the header uses
 * `--chrome-radius-inner`, a tile floating over the map uses `--chrome-radius`.
 *
 * Ledger, including the falsifier: `docs/DECISIONS.md` 2026-08-03.
 */
export const DocsHeaderTile = forwardRef<HTMLButtonElement, DocsHeaderTileProps>(
  function DocsHeaderTile(
    { icon, title, active, className, "aria-label": ariaLabelProp, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        title={title}
        aria-label={ariaLabelProp ?? title}
        className={cn(
          "inline-flex size-[var(--chrome-tile-size)] flex-none items-center justify-center rounded-[var(--chrome-radius-inner)] border text-[color:var(--color-text-tertiary)] transition-colors",
  // The disabled value is not written by hand — this slot used to say 45 (the value layer is 55).
          CONTROL_DISABLED_CLASS,
          active
            ? "border-[color:var(--chrome-active-border)] bg-[color:var(--chrome-active-surface)] text-[color:var(--color-text-primary)]"
            : "border-[color:var(--color-border-soft)] hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)]",
          className,
        )}
        {...rest}
      >
        {icon}
      </button>
    );
  },
);
