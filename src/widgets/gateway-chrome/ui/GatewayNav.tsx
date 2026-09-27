'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { LocaleSwitch } from '@/features/locale-switch';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/gateway-frame';
import { stripLocalePrefix } from '@/shared/lib/nav-destination';
import { GITHUB_REPO_URL, xProfileUrl } from '@/shared/config/social-links';
import { GithubMark, XMark } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { BrandMark } from '@/shared/ui/brand-mark';

/**
 * Top chrome for the gateway surfaces (`/`, `/download`, `/guide`, `/changelog`). At the root it
 * drops the breadcrumb node; the page itself offers the route to the map, and the same link in
 * chrome and page makes one a dead promise.
 */
export function GatewayNav() {
  const t = useTranslations('download');
  const tNav = useTranslations('gatewayNav');
  const path = stripLocalePrefix(usePathname() ?? '/');
  const atRoot = path === '/';

  /** The current node's name, derived from the address so it has one source; absent at the root. */
  /*
   * The crumb names only this chrome's three routes; the 404 wears it too and must not claim to be
   * the download page.
   */
  const crumb = atRoot
    ? null
    : path.startsWith('/guide')
      ? tNav('guide')
      : path.startsWith('/changelog')
        ? tNav('changelog')
        : path.startsWith('/download')
          ? t('downloadSectionLabel')
          : null;

  const xHref = xProfileUrl();

  return (
    <nav
      data-testid="download-gnb"
      className={cn(
        PAGE_GUTTER,
        'sticky top-0 z-30 w-full shrink-0 border-b border-[color:var(--color-divider)] bg-[color:var(--color-canvas)]',
      )}
    >
      {/*
       * No `flex-wrap`: the breadcrumb and section links collapse instead, while the logo and
       * locale switch survive at any width.
       */}
      <div
        className={cn(
          PAGE_COLUMN,
          'flex min-h-14 items-center gap-3 py-2.5 md:min-h-16 md:py-3',
        )}
      >
        <Link
          href="/"
          className={controlClass({ hoverInk: 'strong', shape: "link", className: "touch-hit-expand gap-2" })}
        >
          <BrandMark
            detail="compact"
            size={32}
            alt=""
            aria-hidden="true"
            loading="eager"
            data-testid="gateway-brand-mark"
            className="size-8 shrink-0"
          />
          {/* `whitespace-nowrap`: the wordmark must never wrap. */}
          <span className="whitespace-nowrap text-body leading-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
            Ontology Atlas
          </span>
        </Link>
        {crumb ? (
          <>
            {/*
             * The breadcrumb waits for `lg`; from `sm` the column cannot hold it with the other
             * controls.
             */}
            <span aria-hidden className="hidden text-body text-[color:var(--color-text-quaternary)] lg:inline">
              /
            </span>
            <span
              aria-current="page"
              className="hidden text-body leading-body text-[color:var(--color-text-tertiary)] lg:inline"
            >
              {crumb}
            </span>
          </>
        ) : null}

        {/*
         * The right edge mirrors the origin (`vw - origin`) so the bar shares the band's frame; the
         * gate measures it through this testid.
         */}
        <span
          data-testid="download-gnb-actions"
          className="ml-auto flex shrink-0 items-center gap-3"
        >
          {/* Collapsed below `sm`; `GatewayReadingLinks` carries them there. */}
          <span className="hidden items-center gap-3 sm:flex">
            <GatewayNavLink href="/guide" active={path.startsWith('/guide')}>
              {tNav('guide')}
            </GatewayNavLink>
            {/*
             * On `/` and `/download` the page carries the changelog link, so the chrome does not
             * repeat it; `/guide` and `/changelog` keep the chip.
             */}
            {atRoot || path.startsWith('/download') ? null : (
              <GatewayNavLink href="/changelog" active={path.startsWith('/changelog')}>
                {tNav('changelog')}
              </GatewayNavLink>
            )}
          </span>

          {/*
           * Two 32px icon targets 4px apart; under a coarse pointer the gap opens to 12px so the
           * expanded 44px hit areas do not overlap.
           */}
          <span className="flex items-center gap-1 pointer-coarse:gap-3">
          {/* The repository link, same shape and tone as the X mark. */}
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            data-testid="gateway-github-link"
            aria-label={tNav('githubLabel')}
            className={GATEWAY_ICON_LINK}
          >
            <GithubMark size={15} aria-hidden />
          </a>

          {/*
           * X has a position but no destination yet (`X_HANDLE` is empty), so it is disabled with a
           * title instead of a dead link.
           */}
          {xHref ? (
            <a
              href={xHref}
              target="_blank"
              rel="noreferrer noopener"
              data-testid="gateway-x-link"
              aria-label={tNav('xLabel')}
              className={GATEWAY_ICON_LINK}
            >
              <XMark size={14} aria-hidden />
            </a>
          ) : (
            /*
             * Disabled speaks through shape, not opacity: dimming dropped below the 3:1 non-text
             * contrast floor.
             */
            <span
              data-testid="gateway-x-placeholder"
              aria-disabled="true"
              title={tNav('xPending')}
              className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-chip text-[color:var(--color-text-quaternary)]"
            >
              <XMark size={15} aria-hidden />
              <span className="sr-only">{tNav('xPending')}</span>
            </span>
          )}
          </span>

          {/*
           * No route to the map here: the page's try-in-browser link is the single route
           * (`map-destination-route.contract.test.ts`).
           */}
          <LocaleSwitch />
        </span>
      </div>
    </nav>
  );
}

/**
 * Reading links as chips, matching the locale switch beside them (`design.md`): affordance is
 * relative to neighbours. The current page has a filled surface; others gain it on hover.
 */
/**
 * Repository and X marks use the 32px icon-button shape so the right group reads as one row of
 * controls.
 */
const GATEWAY_ICON_LINK = controlClass({
  shape: 'icon',
  size: 'lg',
  tone: 'muted',
  hoverInk: 'strong',
  hoverSurface: 'lift',
});

function GatewayNavLink({
  href,
  active,
  children,
}: {
  href: '/guide' | '/changelog';
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      data-testid={`gateway-nav-${href.slice(1)}`}
      aria-current={active ? 'page' : undefined}
      className={controlClass({ shape: 'chip', size: 'md', className: cn(
        // `touch-hit-expand` widens the hit area to 44px on coarse pointers without moving the
        // visible box.
        'touch-hit-expand h-8 whitespace-nowrap px-2.5',
        'text-body leading-body',
        // The border shows at rest so the chip reads as a control before the hand arrives.
        active
          ? 'border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] text-[color:var(--color-text-primary)]'
          : 'border-[color:var(--color-border-strong)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-elevated)] hover:text-[color:var(--color-text-primary)]',
      ) })}
    >
      {children}
    </Link>
  );
}
