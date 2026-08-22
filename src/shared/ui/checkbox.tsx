"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { fieldLabel } from "./control-class";

/**
 * Checkbox with a built-in label (2026-08-15, ratified by the design-system seat).
 *
 * Founding inventory — 6 sites across 5 files, drifted three ways:
 *
 * | Variant                                                         | Count |
 * |-----------------------------------------------------------------|------:|
 * | `accent` = `--color-indigo-brand` (#5e6ad2)                      | 4 |
 * | `accent` = `--color-indigo-accent` (#7170ff — a different token) | 1 |
 * | **no accent → the UA default colour** (a second colour system)   | 1 |
 *
 * And **all 6 had no `focus-visible`** — the form-layer instance of the
 * 2026-08-05 "OS accent focus ring" defect. This component pins three things:
 * accent is brand only, the size is `size-4`, and the focus ring uses the value
 * layer's syntax.
 *
 * **The label is the target.** `fieldLabel({ row: true })` carries both
 * label-click-toggles and the WCAG 2.5.8 24px floor, with the
 * `checkbox-target-size` contract as the root-cause check. A checkbox without a
 * label is never built — an unnamed control is misinformation.
 *
 * Gates: a raw `type="checkbox"` is blocked by `field-adoption-ratchet`, and an
 * `accent-[` arbitrary value by lint (0 violations when it was switched on, the
 * migration having already completed).
 */
export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className" | "size" | "children"> {
  label: ReactNode;
  /** Placement and type-step tweaks for the label row only — never spec values. */
  className?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, ...rest },
  ref,
) {
  // The label is not wrapped in a span: the row is flex, so a composite label
  // (icon plus truncating spans) needs its own node to be a direct flex child.
  return (
    <label className={fieldLabel({ row: true, className })}>
      {/* These classes stay inline: the checkbox-target-size contract reads the
          literal inside the opening tag, and a constant would read as no size. */}
      <input
        ref={ref}
        type="checkbox"
        className="size-4 shrink-0 accent-[color:var(--color-indigo-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]"
        {...rest}
      />
      {label}
    </label>
  );
});
