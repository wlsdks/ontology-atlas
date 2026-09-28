"use client";

import { type ReactNode } from "react";

import { useSlidingIndicator } from "@/shared/motion/use-sliding-indicator";
import { cn } from "@/shared/lib/cn";
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";
import { controlClass, type ControlSize } from "./control-class";

/**
 * Exclusive single choice as a radiogroup, even for two options: each label names a value,
 * and `aria-pressed` on siblings would not state exclusivity. Keyboard behaviour
 * is `shared/lib/use-roving-radio-group`; this file applies the two measured containers
 * (`well`, `chips`). Busy never disables the group, which would drop its only tab stop.
 * The `well` needs `border-soft`, since the overlay-1 surface alone is invisible, and `p-px`, which
 * keeps it 28/36 tall on the control-height ramp. A selected segment answers no hover, because
 * the hover axes never emit under `active`.
 */

type SegmentedName =
  | { ariaLabel: string; labelledBy?: never }
  | { ariaLabel?: never; labelledBy: string };

interface SegmentedOption<T extends string | number | boolean> {
  value: T;
  label: ReactNode;
  /** Full name for screen readers when the visible label is an abbreviation (EN, KO). */
  ariaLabel?: string;
  /**
   * Native tooltip. A per-option `className` stays closed so spec values cannot enter through a
   * placement prop.
   */
  title?: string;
  testId?: string;
}

export type SegmentedControlProps<T extends string | number | boolean> = SegmentedName & {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (next: T) => void;
  /** Defaults to lg (32px, 44px under coarse pointers). */
  size?: Extract<ControlSize, "md" | "lg">;
  /** `well` is a joined well; `chips` is a wrapping row of detached chips. */
  variant?: "well" | "chips";
  /** Items divide the width equally. */
  fill?: boolean;
  /** Locks re-selection while a transition is in flight; focus stays reachable. */
  busy?: boolean;
  testId?: string;
  /** Placement only; spec values do not go here. */
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
  const group = useRovingRadioGroup<T>({
    value,
    values: options.map((o) => o.value),
    onChange,
    busy,
  });
  const well = variant === "well";
  const { containerRef, itemRef, indicatorStyle, placed, animated } = useSlidingIndicator(
    well ? String(value) : null,
    "surface-x",
  );

  return (
    <div
      {...group.groupProps}
      ref={containerRef}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      data-testid={testId}
      className={cn(
        variant === "well"
          ? "relative inline-flex items-center gap-px rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-px"
          : "flex flex-wrap items-center gap-1.5",
        fill && (variant === "well" ? "flex w-full" : "w-full"),
        className,
      )}
    >
      {placed ? (
        <span
          aria-hidden
          data-selection-indicator="surface-x"
          data-animated={animated ? "true" : "false"}
          className="motion-indicator rounded-chip bg-[color:var(--color-indigo-a16)]"
          style={indicatorStyle}
        />
      ) : null}
      {options.map((option, index) => {
        const item = group.itemProps(index);
        const key = String(option.value);
        return (
          <button
            key={key}
            {...item}
            ref={(el) => {
              item.ref(el);
              itemRef(key)(el);
            }}
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
              className: cn(
                well && "relative",
                well && placed && "bg-transparent",
                fill && "min-w-0 flex-1",
              ),
            })}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
