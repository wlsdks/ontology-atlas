import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * The labelled chip tier of the chrome system (approved mockup:
 * `docs/prototypes/index-panel-v2-full.html`). Shares `ChromeTile`'s surface —
 * radius, background, shadow — but widens for a label and an optional kbd cap.
 * Presentation only: click handling and state belong to the caller.
 *
 * `compact` is the icon-only mode for narrow viewports: the label goes `sr-only`
 * and the width narrows to the tile size. `active` shows state with the indigo
 * tint alone — no second colour. `badge` stays visible in either mode, unlike the
 * label.
 */
export interface ChromeChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  icon?: ReactNode;
  /** Small count or state marker; stays visible in `compact`. */
  badge?: ReactNode;
  kbd?: ReactNode;
  active?: boolean;
  compact?: boolean;
  className?: string;
}

const CHIP_CLASS =
  'inline-flex h-[var(--chrome-tile-size)] items-center justify-center gap-2 rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] px-3.5 text-label tracking-label text-[color:var(--color-text-tertiary)] shadow-[var(--chrome-shadow)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] active:bg-[color:var(--chrome-active-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] [&>svg]:size-3.5 [&>svg]:shrink-0';

/**
 * Single source for the **non-button status chips** in the top-centre chrome row,
 * so they carry the same geometry as `ChromeChip` — height, radius, border,
 * surface, shadow, padding (`docs/DESIGN-SYSTEM.md`, Geometry ladder).
 *
 * ⚠️ It deliberately omits `topology-ui-scale`. These chips render into the
 * `SearchHint` slot, whose wrapper already applies it (`zoom:1.15` at ≥1920px),
 * and CSS `zoom` multiplies when nested (1.15×1.15≈1.32) — which is exactly the
 * owner report that produced this class: at 1920 the status chips were larger
 * than the sibling tiles. The wrapper owns the scale.
 */
export const CHROME_STATUS_CHIP_CLASS =
  'topology-chrome-in pointer-events-auto flex h-[var(--chrome-tile-size)] max-w-full items-center gap-1.5 rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] px-3.5 text-label tracking-label text-[color:var(--color-text-secondary)] shadow-[var(--chrome-shadow)]';

/**
 * **If it cannot be pressed, it must not look pressable.**
 *
 * Owner report, 2026-08-03: *"On a normal screen, pressing 'recent changes' does nothing."* (pressing "recent changes" on a normal screen does nothing). Measured:
 * the chip was `disabled`, yet its computed style was identical to the three
 * enabled chips beside it — same colour `rgb(138,143,152)`, same background,
 * border, opacity and cursor. `ChromeChip` had no `disabled:` handling at all,
 * and being a shared primitive, every chip had the same hole.
 *
 * The prior design note said the tooltip would explain why — but a tooltip needs
 * a hover and a wait, so whoever pressed got silence. A spec that lives only in a
 * comment and not on screen does not exist.
 *
 * No new values: this is the disabled idiom `Button` already uses.
 */
const DISABLED_CLASS =
  'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:hover:border-[color:var(--chrome-border)] disabled:hover:bg-[color:var(--chrome-surface)]';

const ACTIVE_CLASS =
  'border-[color:var(--chrome-active-border)] bg-[color:var(--chrome-active-surface)] text-[color:var(--color-text-primary)]';

const COMPACT_CLASS = 'w-[var(--chrome-tile-size)] px-0';

/**
 * The **width half** of the `max-xl` icon-only fold, for callers that collapse by
 * viewport rather than by the `compact` prop.
 *
 * Hiding `[data-chip-label]` with a responsive variant is only half of `compact`:
 * the label goes, `px-3.5` stays, and the chip lands on a width that belongs to no
 * role. Measured 2026-09-05 at 1024: the map's "switch to my data" chip was
 * **44×36** beside four 36×36 icon-only tiles in the same lane. This constant is
 * the same box `COMPACT_CLASS` applies, written with its variants so Tailwind's
 * scanner sees the literal here rather than in a template at the call site.
 *
 * Pair it with the label hook; a contract test holds the two together
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
        // Responsive hook, like `data-chip-kbd`: a caller can collapse to
        // icon-only by width, e.g. `max-xl:[&_[data-chip-label]]:hidden`. Only
        // hide the visible label on chips that carry an `aria-label`.
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
