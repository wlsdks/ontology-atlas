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

const ACTIVE_CLASS =
  'border-[color:var(--chrome-active-border)] text-[color:var(--color-text-primary)]';

export const ChromeTile = forwardRef<HTMLButtonElement | HTMLAnchorElement, ChromeTileProps>(
  ({ icon, title, active, className, href, 'aria-label': ariaLabelProp, ...rest }, ref) => {
    const ariaLabel = ariaLabelProp ?? title;
    const resolvedClassName = cn(TILE_CLASS, DISABLED_CLASS, active && ACTIVE_CLASS, className);

    if (href) {
      return (
        <Link
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          title={title}
          aria-label={ariaLabel}
          className={resolvedClassName}
          {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
        >
          {icon}
        </Link>
      );
    }

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        title={title}
        aria-label={ariaLabel}
        className={resolvedClassName}
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {icon}
      </button>
    );
  },
);
ChromeTile.displayName = 'ChromeTile';
