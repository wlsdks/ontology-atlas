import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/cn';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'text-body-lg leading-caption',
    'font-[var(--font-weight-signature)]',
    'border border-transparent',
    'select-none',
    /*
     * No duration class: hover acknowledges a changed state, so it takes Tailwind's default
     * (`--motion-fast`), and so does the press feedback (`.claude/rules/design.md`).
     */
    'transition-[background-color,border-color,color,box-shadow,transform]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]',
    'active:translate-y-[1px]',
    'motion-reduce:transition-none motion-reduce:transform-none',
    // Disabled keeps pointer events so hovering still answers "why won't this press".
    'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:hover:bg-inherit disabled:hover:border-inherit disabled:active:translate-y-0',
  ].join(' '),
  {
    variants: {
      variant: {
        // Resting controls get inset material; drop shadows belong to floating things,
        // so `primary` wins attention by its filled plane. The ink is `--color-text-on-accent`
        // because `--color-text-primary` on filled indigo falls under WCAG AA.
        primary:
          'bg-[color:var(--color-indigo-brand)] text-[color:var(--color-text-on-accent)] shadow-[inset_0_1px_0_var(--color-border-strong)] hover:border-[color:var(--color-indigo-pale-a28)] hover:bg-[color:var(--color-indigo-brand-hover)] active:shadow-[inset_0_1px_0_var(--color-divider),var(--shadow-control-press)]',
        ghost:
          'bg-transparent text-[color:var(--color-text-primary)] hover:border-[color:var(--color-border-soft)] hover:bg-[color:var(--color-overlay-2)] active:bg-[color:var(--color-border-soft)] active:shadow-[var(--shadow-control-press)]',
        outline:
          'border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-primary)] shadow-[inset_0_1px_0_var(--color-overlay-2)] hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] active:bg-[color:var(--color-overlay-2)] active:shadow-[inset_0_1px_0_var(--color-overlay-2),var(--shadow-control-press)]',
        /*
         * For the confirm step of an irreversible action only, never for the button that asks.
         * Disabled wears `outline`'s plane and ink, because danger ink at `opacity-55` is
         * unreadable and a pending confirm has nothing left to warn about.
         */
        danger:
          'border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] text-[color:var(--color-danger-text)] hover:border-[color:var(--color-danger-a50)] hover:bg-[color:var(--color-danger-a12)] active:bg-[color:var(--color-danger-a12)] active:shadow-[var(--shadow-control-press)] disabled:border-[color:var(--color-overlay-3)] disabled:bg-[color:var(--color-overlay-1)] disabled:text-[color:var(--color-text-primary)]',
      },
      /*
       * Every size wears the chip radius so a Button matches chips and fields of its height;
       * only content boxes wear theirs. Type stays `text-body-lg` to match a 32px field's value
       * text.
       */
      size: {
        sm: 'h-8 px-3.5 rounded-chip',
        md: 'h-10 px-4.5 rounded-chip',
        lg: 'h-11 px-6 rounded-chip',
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
         * Defaults to `type="button"` so it never submits a form by accident; the spread props
         * come after, so `type="submit"` still wins.
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
