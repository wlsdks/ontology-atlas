import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { CONTROL_DISABLED_CLASS } from "@/shared/ui/control-class";

export interface DocsHeaderTileProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title" | "className"> {
  icon: ReactNode;
  /** The tooltip and default accessible name. */
  title: string;
  "aria-label"?: string;
  /** Indigo border and surface only. */
  active?: boolean;
  className?: string;
}

/**
 * Sized by `--chrome-tile-size`; separate from `ChromeTile` only for the radius: a header tile
 * uses `--chrome-radius-inner`, a tile over the map `--chrome-radius`. Ledger:
 * the 2026-08-03 entry in `docs/DECISIONS.md`.
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
  // Never hand-write the disabled value.
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
