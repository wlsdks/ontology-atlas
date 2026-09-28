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
 * Behaviour layer over `controlClass()`: what a className cannot carry, namely `type="button"`,
 * an icon control's required name and a real `<button>` for rows. Values come only
 * through `controlClass()` (`controls.test.tsx`). Each emits `data-control="chip|icon|row"` so
 * tests and instruments can query a class of control
 * (`tests/e2e/touch-target-contract.spec.ts`, `scripts/measure-contrast.mjs`).
 */

type BaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'type'> & {
  size?: ControlSize;
  tone?: ControlTone;
  active?: boolean;
  /**
   * The value layer's hover axes, opt-in and silent under `active`; without them consumers
   * hand-write `hover:` classes.
   */
  hoverInk?: ControlHoverInk;
  hoverSurface?: ControlHoverSurface;
  hoverBorder?: ControlHoverBorder;
  /** Only what is true of this one site (placement, width, order). */
  className?: string;
};

/**
 * A small pill control with a label. `aria-pressed` stays with the consumer, so non-toggle
 * chips are not announced as toggles.
 */
export const Chip = forwardRef<HTMLButtonElement, BaseProps>(
  ({ size, tone, active, hoverInk, hoverSurface, hoverBorder, className, ...rest }, ref) => (
    <button
      ref={ref}
      // A `<button>` defaults to submit inside a form; no className can prevent it.
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
  /** Required: an icon has no text, so without a name a screen reader hears only "button". */
  label: string;
  children: ReactNode;
}

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

/** A pressable list row as a real `<button>`, reachable by keyboard and announced. */
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
