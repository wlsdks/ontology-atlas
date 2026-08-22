import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/cn';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'text-body-lg leading-caption',
    'font-[var(--font-weight-signature)]',
    'rounded-panel',
    'border border-transparent',
    'select-none',
    /*
     * ⚠️ No duration here (2026-08-15). It used to be `--motion-base` (180ms), which is
     * the **move** step. Hover only acknowledges a state that already changed, so its
     * budget is `--motion-fast` (120ms) — and Tailwind's default transition already
     * spends exactly that (`.claude/rules/design.md`: at the default value, omit the
     * duration class entirely). The `active:translate-y-[1px]` press feedback rides the
     * same group and therefore also lands at 120ms, which is right — a press must feel
     * immediate. `ease-` is dropped for the same reason: it equalled the default.
     */
    'transition-[background-color,border-color,color,box-shadow,transform]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]',
    'active:translate-y-[1px]',
    'motion-reduce:transition-none motion-reduce:transform-none',
    // Disabled uses `cursor-not-allowed` rather than `pointer-events-none`, so hovering
    // still answers "why won't this press". Hover styling is suppressed while disabled.
    'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:hover:bg-inherit disabled:hover:border-inherit disabled:active:translate-y-0',
  ].join(' '),
  {
    variants: {
      variant: {
        // **The tinted key shadow was removed** (owner decision, 2026-08-06).
        //
        // `primary` used to carry an indigo-tinted drop shadow — `0 10px 24px
        // var(--color-indigo-a22)` at rest and `0 6px 14px var(--color-indigo-a20)` when
        // pressed. A tinted shadow implies a second light source; once the owner allowed
        // the colour to change, the answer was already on the ramp:
        // `--shadow-control-press`.
        //
        // Why no drop shadow at rest: a full inventory (2026-08-06) found that of the 21
        // non-token `shadow-[…]` uses in this repo, **18 were inset only** (material), and
        // the 4 hand-written drops were the outliers. `outline` in this same cva is also
        // inset-only at rest. The convention is therefore: resting controls get material,
        // drop shadows belong to things that float. What makes `primary` win attention is
        // the filled indigo plane, not a shadow.
        //
        // Result: two off-ramp geometries removed, zero new tokens, one light source.
        //
        // The ink is `--color-text-on-accent` (#ffffff), **not `--color-text-primary`**.
        // On filled indigo (`#5e6ad2`), `#f7f8f8` composites to **4.42:1**, under WCAG
        // 1.4.3 AA (4.5); `#ffffff` reaches **4.70:1** and passes. That token was created
        // on 2026-08-03 as "ink on filled indigo" and `accentSolid` in `control-class.ts`
        // already used it — this primitive was the one site the migration missed, which is
        // why the gateway's main CTA, the most prominent control in the app, was the only
        // one below AA.
        primary:
          'bg-[color:var(--color-indigo-brand)] text-[color:var(--color-text-on-accent)] shadow-[inset_0_1px_0_var(--color-border-strong)] hover:border-[color:var(--color-indigo-pale-a28)] hover:bg-[color:var(--color-indigo-brand-hover)] active:shadow-[inset_0_1px_0_var(--color-divider),var(--shadow-control-press)]',
        ghost:
          'bg-transparent text-[color:var(--color-text-primary)] hover:border-[color:var(--color-border-soft)] hover:bg-[color:var(--color-overlay-2)] active:bg-[color:var(--color-border-soft)] active:shadow-[var(--shadow-control-press)]',
        outline:
          'border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-primary)] shadow-[inset_0_1px_0_var(--color-overlay-2)] hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] active:bg-[color:var(--color-overlay-2)] active:shadow-[inset_0_1px_0_var(--color-overlay-2),var(--shadow-control-press)]',
      },
      size: {
        sm: 'h-8 px-3.5',
        md: 'h-10 px-4.5',
        lg: 'h-11 px-6',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        /*
         * **The default is `type="button"`** (found by a portability test, 2026-08-15).
         *
         * The sibling primitives (`Chip`, `IconButton`, `RowButton`) all name the same
         * hazard as their reason to exist — inside a form a bare `<button>` defaults to
         * submit, so one chip submits the form — yet the standard button was the one that
         * stayed a raw `<button>`. It never broke here because this repo has a single form
         * and all seven buttons in it set `type` by hand. For anyone who does not know
         * that convention (i.e. anyone adopting this system), "Cancel" submits the form.
         *
         * `{...props}` spreads **after** this, so passing `type="submit"` still wins and
         * no existing call site changes.
         */
        type="button"
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
