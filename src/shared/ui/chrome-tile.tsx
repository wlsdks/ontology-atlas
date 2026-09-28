import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';

/**
 * The square icon button of the chrome system (mockup
 * docs/prototypes/index-panel-v2-full.html). Presentational; it enforces the `--chrome-*`
 * tokens and a required name, rendering a next-intl `Link` with `href`. Chrome surfaces use it
 * rather than rebuilding one inline (docs/DESIGN-SYSTEM.md, chrome grammar).
 */
interface ChromeTileBaseProps {
  icon: ReactNode;
  /** The tooltip text and the default accessible name. */
  title: string;
  /**
   * Opts in to the group-revealed label: the tile grows into a labelled chip while
   * a `.chrome-rail` ancestor is hovered or focused (`app/globals.css`). The label is then the
   * accessible name, because a name that differs from the visible word fails WCAG 2.5.3; the
   * native `title` is dropped so no tooltip repeats it (`.claude/rules/design.md`).
   */
  label?: string;
  'aria-label'?: string;
  /** Shown by an indigo border only, never a second colour. */
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
 * Kept apart from the labelled shape: `size-[…]` pins width and height, so a labelled tile
 * swaps the width half for `min-w` plus padding and tailwind-merge never chooses between them.
 * The `- 1px` in the padding is the tile's own border (width is shrink-to-fit).
 */
const TILE_CLASS =
  'inline-flex size-[var(--chrome-tile-size)] shrink-0 items-center justify-center rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] text-[color:var(--color-text-tertiary)] shadow-[var(--chrome-shadow)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] [&>svg]:size-[var(--chrome-icon)]';

/**
 * What cannot be pressed must not look pressable; same values as `ChromeChip`
 * (`tests/contract/disabled-affordance.contract.test.ts`).
 */
const DISABLED_CLASS =
  'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:hover:border-[color:var(--chrome-border)] disabled:hover:bg-[color:var(--chrome-surface)] disabled:hover:text-[color:var(--color-text-tertiary)]';

/**
 * The `chrome-tile-labelled` class hooks the expanded width, which lives
 * beside `--chrome-tile-expanded-min` in `app/globals.css` because `.chrome-rail` is a plain
 * class, not a Tailwind `group`.
 */
const LABELLED_TILE_CLASS = TILE_CLASS.replace(
  'size-[var(--chrome-tile-size)]',
  'chrome-tile-labelled h-[var(--chrome-tile-size)] min-w-[var(--chrome-tile-size)] px-[calc((var(--chrome-tile-size)-var(--chrome-icon))/2-1px)] text-label tracking-label',
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
