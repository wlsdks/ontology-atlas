"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { DrawnCheck } from "@/shared/motion/drawn-check";
import { CONTROL_DISABLED_CLASS, fieldLabel } from "./control-class";

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
  return (
    <label className={fieldLabel({ row: true, className })}>
      <span className="grid size-4 shrink-0 place-items-center">
        <input
          ref={ref}
          type="checkbox"
          className={`${CONTROL_DISABLED_CLASS} motion-checkbox-box peer col-start-1 row-start-1 m-0 size-4 shrink-0 cursor-[inherit] appearance-none rounded-micro border border-[color:var(--color-text-quaternary)] bg-[color:var(--color-canvas)] checked:border-[color:var(--color-indigo-brand)] checked:bg-[color:var(--color-indigo-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]`}
          {...rest}
        />
        <DrawnCheck
          size={12}
          drawn={false}
          className="motion-checkbox-mark pointer-events-none col-start-1 row-start-1 text-[color:var(--color-text-on-accent)]"
        />
      </span>
      {label}
    </label>
  );
});
