"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { fieldLabel } from "./control-class";

/**
 * Checkbox with a built-in label: the brand accent only, `size-4`, and the value layer's focus
 * ring. The label is the target: `fieldLabel({ row: true })` makes it toggle and meets the WCAG
 * 2.5.8 24px floor (`checkbox-target-size` contract). A raw `type="checkbox"` is held
 * by `field-adoption-ratchet`, and an `accent-[` value by lint.
 */
export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className" | "size" | "children"> {
  label: ReactNode;
  /** Placement and type-step tweaks for the label row only; never spec values. */
  className?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, ...rest },
  ref,
) {
  // The label is not wrapped: a composite label must be a direct child of the flex row.
  return (
    <label className={fieldLabel({ row: true, className })}>
      {/*
        * These classes stay inline: the checkbox-target-size contract reads the literal inside
        * the opening tag.
        */}
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
