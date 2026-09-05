import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';

/**
 * ChromeTile — the square icon button of the chrome system (approved mockup:
 * `docs/prototypes/index-panel-v2-full.html`). A purely presentational
 * component: state and navigation belong to the caller, and all this enforces is
 * the visual contract — the `--chrome-*` size, radius and icon tokens, plus a
 * required `title`/`aria` name. With `href` it renders a next-intl `Link`,
 * otherwise a `button`.
 *
 * Chrome surfaces must consume this component; do not rebuild a square chrome
 * button inline in JSX (`docs/DESIGN-SYSTEM.md` chrome grammar, the chrome
 * grammar chapter).
 */
interface ChromeTileBaseProps {
  icon: ReactNode;
  /** The tooltip text, and the default accessible name. */
  title: string;
  /**
   * Opt in to the **group-revealed label** — the tile keeps its square box until a
   * `.chrome-rail` ancestor is hovered or holds focus, then grows into a labelled
   * chip (`app/globals.css`, "the map's utility rail names itself as one group").
   *
   * ⚠️ **In this mode the label *is* the accessible name.** `aria-label` is ignored
   * and the span is left readable, because a name that differs from the word on
   * screen fails WCAG 2.5.3 and leaves a speech-input user unable to say what they
   * can see. Measured on the map rail before this rule existed: the shortcuts tile
   * showed "Keyboard shortcuts (?)" while announcing "View keyboard shortcuts", and
   * the replay tile showed "Replay how it grew" while announcing "Replay the
   * ontology appearing in containment order" — two of four tiles.
   *
   * A richer sentence is not lost information here: `role="button"` already says it
   * is actionable, so the extra verb was the only thing the longer name added.
   *
   * The native `title` tooltip is dropped in this mode too: an OS tooltip repeating
   * a label already on screen is the popup soup `.claude/rules/design.md` forbids.
   */
  label?: string;
  'aria-label'?: string;
  /** Current destination or toggle state — shown by an indigo border only, never a second colour. */
  active?: boolean;
  className?: string;
}

interface ChromeTileButtonProps
  extends ChromeTileBaseProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'className'> {
  href?: undefined;
}

interface ChromeTileLinkProps
  extends ChromeTileBaseProps,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'title' | 'className' | 'href'> {
  href: string;
}

export type ChromeTileProps = ChromeTileButtonProps | ChromeTileLinkProps;

/**
 * ⚠️ **The label mode may not be folded into this string.** `size-[…]` pins width
 * and height to the same value, so a labelled tile would stay 36px wide and clip
 * its own label; the labelled shape therefore replaces the width half with
 * `min-w` + horizontal padding, and the two live in separate constants so
 * tailwind-merge is never asked to decide between them.
 *
 * Collapsed the two are the same box, and the `− 1px` in the padding is the tile's
 * own border: the box is border-box but its width is shrink-to-fit, so
 * `(36 − 16) / 2` of padding measured **38px** in the browser — padding + icon +
 * two 1px borders. `--chrome-tile-size` grows to the 44px touch target on a coarse
 * pointer through the same arithmetic.
 */
const TILE_CLASS =
  'inline-flex size-[var(--chrome-tile-size)] shrink-0 items-center justify-center rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] text-[color:var(--color-text-tertiary)] shadow-[var(--chrome-shadow)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] [&>svg]:size-[var(--chrome-icon)]';

/**
 * Disabled — **what cannot be pressed must not look pressable.**
 *
 * Same values and same grammar as `ChromeChip`. The chip's hole surfaced on
 * 2026-08-03 through an owner report — *"'recent changes' pressing does nothing"* (pressing "recent changes" does nothing) — and the gate added then
 * (`tests/contract/disabled-affordance.contract.test.ts`) **caught the identical
 * hole in this file too**, before anyone had reported it.
 */
const DISABLED_CLASS =
  'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:hover:border-[color:var(--chrome-border)] disabled:hover:bg-[color:var(--chrome-surface)] disabled:hover:text-[color:var(--color-text-tertiary)]';

const LABELLED_TILE_CLASS = TILE_CLASS.replace(
  'size-[var(--chrome-tile-size)]',
  'h-[var(--chrome-tile-size)] min-w-[var(--chrome-tile-size)] px-[calc((var(--chrome-tile-size)-var(--chrome-icon))/2-1px)] text-label tracking-label',
);

const ACTIVE_CLASS =
  'border-[color:var(--chrome-active-border)] text-[color:var(--color-text-primary)]';

export const ChromeTile = forwardRef<HTMLButtonElement | HTMLAnchorElement, ChromeTileProps>(
  ({ icon, title, label, active, className, href, 'aria-label': ariaLabelProp, ...rest }, ref) => {
    const ariaLabel = ariaLabelProp ?? title;
    const resolvedClassName = cn(
      label ? LABELLED_TILE_CLASS : TILE_CLASS,
      DISABLED_CLASS,
      active && ACTIVE_CLASS,
      className,
    );
    const content = label ? (
      <>
        {icon}
        <span className="chrome-tile-label">{label}</span>
      </>
    ) : (
      icon
    );

    if (href) {
      return (
        <Link
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          title={label ? undefined : title}
          aria-label={label ? undefined : ariaLabel}
          className={resolvedClassName}
          {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        title={label ? undefined : title}
        aria-label={label ? undefined : ariaLabel}
        className={resolvedClassName}
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {content}
      </button>
    );
  },
);
ChromeTile.displayName = 'ChromeTile';
