import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import {
  controlClass,
  type ControlHoverBorder,
  type ControlHoverInk,
  type ControlHoverSurface,
  type ControlSize,
  type ControlTone,
} from './control-class';

/**
 * Control components — **the behaviour layer on top of the value layer.**
 *
 * **Why a function alone is not enough.** `controlClass()` is the single source
 * of **values** (shape, size, colour), but some of what a control must guarantee
 * cannot be carried by a string at all:
 *
 * | Must hold                                                      | Can a className do it? |
 * |----------------------------------------------------------------|---|
 * | `type="button"` by default (otherwise it submits inside a form) | ✗ |
 * | An icon control's **required accessible name**                  | ✗ |
 * | A row control actually being a `<button>` (no div + onClick)     | ✗ |
 *
 * Hence two layers — the same structure shadcn/ui gets from `cva` plus a
 * component, and the reason Carbon, Fluent, Material and Polaris all ship
 * components rather than class helpers.
 *
 * **Why this file was born with a gate.** Three primitives sat here with zero
 * consumers for three months (`Card`, `Badge`, `DetailCard`; deleted 2026-08-03),
 * and `CardTitle` turned out to use `text-lg`, a step that is not in the type
 * ramp — a primitive violating the system it was supposed to encode. What failed
 * was not "components", it was **components without a gate**. So all three here
 * take their values through `controlClass()` (`controls.test.tsx` asserts it) and
 * have no way to emit an off-ramp value.
 *
 * **Queryable from outside — `data-control`.** All three emit
 * `data-control="chip|icon|row"`. **What cannot be distinguished from outside
 * cannot be checked from outside.** Without this one attribute, a question like
 * "does every icon control on this screen have a 44px hit area" forces the test
 * to **hand-list selectors**, and that list goes stale silently as screens
 * change. Real consumers:
 *
 * - `tests/e2e/touch-target-contract.spec.ts` — hit area across all icon controls
 * - `scripts/measure-contrast.mjs` — contrast measured over controls only
 * - `/design-audit` — per-screen control inventory
 *
 * It is not `data-testid`: a testid points at **one site**, this points at
 * **one class of thing**.
 */

type BaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'type'> & {
  size?: ControlSize;
  tone?: ControlTone;
  active?: boolean;
  /**
   * Hover — **the value layer's axes passed straight through** (2026-08-16).
   *
   * All opt-in, and none apply to the selected state (`active`). While these three
   * were missing, consumers hand-wrote `hover:` into `className` (measured: 17 of
   * 29 `RowButton` sites) — exactly the shape the ratchet exists to stop. **An axis
   * the value layer has but the component cannot reach might as well not exist.**
   */
  hoverInk?: ControlHoverInk;
  hoverSurface?: ControlHoverSurface;
  hoverBorder?: ControlHoverBorder;
  /** Only what is true of **this one site** (placement, width, order). Shape, size and colour go through the props above. */
  className?: string;
};

/**
 * A small pill control with a label — the most common control in this app
 * (inventory: 128).
 *
 * `aria-pressed` is the consumer's to supply. `active` is the **visible** state
 * and `aria-pressed` the **announced** one; wiring them together automatically
 * would make non-toggle chips (filter navigation and the like) read as toggles to
 * a screen reader.
 */
export const Chip = forwardRef<HTMLButtonElement, BaseProps>(
  ({ size, tone, active, hoverInk, hoverSurface, hoverBorder, className, ...rest }, ref) => (
    <button
      ref={ref}
      // Inside a form a `<button>` defaults to `submit`. No className can stop a
      // chip from submitting the form — this line is why the component exists.
      type="button"
      data-control="chip"
      className={controlClass({
        shape: 'chip',
        size,
        tone,
        active,
        hoverInk,
        hoverSurface,
        hoverBorder,
        className,
      })}
      {...rest}
    />
  ),
);
Chip.displayName = 'Chip';

export interface IconButtonProps extends BaseProps {
  /**
   * **Required.** An icon control has no text to read, so without a name a screen
   * reader announces only "button". The type system is the strongest gate
   * available here — lint and contract tests report the omission later, a type
   * blocks it **as it is written**.
   */
  label: string;
  children: ReactNode;
}

/** Square icon control — inventory: 36. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, size, tone, active, hoverInk, hoverSurface, hoverBorder, className, children, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      data-control="icon"
      className={controlClass({
        shape: 'icon',
        size,
        tone,
        active,
        hoverInk,
        hoverSurface,
        hoverBorder,
        className,
      })}
      {...rest}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = 'IconButton';

/**
 * A whole list row that is pressable — inventory: 39.
 *
 * **The point is that it is a `<button>` and not a `<div onClick>`.** List rows
 * are wide, which tempts people into a div; a div is unreachable by keyboard and
 * is not announced as a control. Using this component removes that option.
 */
export const RowButton = forwardRef<HTMLButtonElement, BaseProps>(
  ({ size, tone, active, hoverInk, hoverSurface, hoverBorder, className, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      data-control="row"
      className={controlClass({
        shape: 'row',
        size,
        tone,
        active,
        hoverInk,
        hoverSurface,
        hoverBorder,
        className,
      })}
      {...rest}
    />
  ),
);
RowButton.displayName = 'RowButton';
