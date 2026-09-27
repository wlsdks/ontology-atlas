import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * The labelled chip tier of the chrome system (mockup
 * docs/prototypes/index-panel-v2-full.html), sharing `ChromeTile`'s surface.
 * Presentational. `compact` makes the label `sr-only` and narrows to the tile size; the `badge`
 * stays visible in both modes.
 */
export interface ChromeChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  icon?: ReactNode;
  badge?: ReactNode;
  kbd?: ReactNode;
  active?: boolean;
  compact?: boolean;
  className?: string;
}

const CHIP_CLASS =
  'inline-flex h-[var(--chrome-tile-size)] items-center justify-center gap-2 rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] px-3.5 text-label tracking-label text-[color:var(--color-text-tertiary)] shadow-[var(--chrome-shadow)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] active:bg-[color:var(--chrome-active-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] [&>svg]:size-3.5 [&>svg]:shrink-0';

/**
 * Status chips in the top-centre row share `ChromeChip` geometry (docs/DESIGN-SYSTEM.md).
 * No `topology-ui-scale`: the `SearchHint` wrapper already applies it and nested `zoom`
 * multiplies. `min-w-0` lets the label truncate in a crowded row.
 */
export const CHROME_STATUS_CHIP_CLASS =
  'topology-chrome-in pointer-events-auto flex h-[var(--chrome-tile-size)] min-w-0 max-w-full items-center gap-1.5 rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] px-3.5 text-label tracking-label text-[color:var(--color-text-secondary)] shadow-[var(--chrome-shadow)]';

/** What cannot be pressed must not look pressable; the disabled idiom `Button` uses. */
const DISABLED_CLASS =
  'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:hover:border-[color:var(--chrome-border)] disabled:hover:bg-[color:var(--chrome-surface)]';

const ACTIVE_CLASS =
  'border-[color:var(--chrome-active-border)] bg-[color:var(--chrome-active-surface)] text-[color:var(--color-text-primary)]';

const COMPACT_CLASS = 'w-[var(--chrome-tile-size)] px-0';

/**
 * The width half of the `max-xl` icon-only fold, written as a literal so Tailwind's scanner
 * sees it. Pair it with the label hook
 * (`tests/contract/chrome-chip-compact-pairing.contract.test.ts`).
 */
export const CHROME_CHIP_COMPACT_BELOW_XL =
  'max-xl:w-[var(--chrome-tile-size)] max-xl:px-0';

export const ChromeChip = forwardRef<HTMLButtonElement, ChromeChipProps>(
  ({ icon, badge, kbd, active, compact, children, className, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        CHIP_CLASS,
        DISABLED_CLASS,
        active && ACTIVE_CLASS,
        compact && COMPACT_CLASS,
        className,
      )}
      {...rest}
    >
      {icon}
      {children ? (
        // A hook for collapsing by width (`max-xl:[&_[data-chip-label]]:hidden`); hide the
        // visible label only on chips that carry an `aria-label`.
        <span data-chip-label className={cn('truncate', compact && 'sr-only')}>
          {children}
        </span>
      ) : null}
      {badge}
      {kbd ? (
        <span
          aria-hidden="true"
          data-chip-kbd
          className={cn(
            'ml-auto shrink-0 rounded-micro border border-[color:var(--color-border-soft)] px-1 py-0.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]',
            compact && 'hidden',
          )}
        >
          {kbd}
        </span>
      ) : null}
    </button>
  ),
);
ChromeChip.displayName = 'ChromeChip';
