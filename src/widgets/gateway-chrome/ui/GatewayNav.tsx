'use client';

import { Orbit } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { LocaleSwitch } from '@/features/locale-switch';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/gateway-frame';
import { stripLocalePrefix } from '@/shared/lib/nav-destination';
import { xProfileUrl } from '@/shared/config/social-links';
import { XMark } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';

/**
 * The top chrome shared by the gateway surfaces.
 *
 * **It lives at four addresses** — `/` (a web visitor's first face) · `/download`
 * (the install deep link) · `/guide` · `/changelog`. The chrome is the same, but two
 * pieces differ by address: at the root it ① drops the breadcrumb's current node
 * (that is not the address) and ② drops 「지도로 돌아가기」 (back to the map) — someone
 * who arrived here did not come from the map, and the route to the map is already
 * offered by 「설치 없이 브라우저에서 써보기」 (try it in the browser without
 * installing) inside the page. Putting the same link in both the chrome and the page
 * makes one of the two a dead promise.
 */
export function GatewayNav() {
  const t = useTranslations('download');
  const tNav = useTranslations('gatewayNav');
  const path = stripLocalePrefix(usePathname() ?? '/');
  const atRoot = path === '/';

  /**
   * The current node's name. Absent at the root (no breadcrumb is drawn).
   *
   * ⚠️ Why the label is decided here: if each page injected its own name into the
   * chrome, the same name would live in two places and only one would change. The
   * address is the source of truth.
   */
  const crumb = atRoot
    ? null
    : path.startsWith('/guide')
      ? tNav('guide')
      : path.startsWith('/changelog')
        ? tNav('changelog')
        : t('downloadSectionLabel');

  const xHref = xProfileUrl();

  return (
    <nav
      data-testid="download-gnb"
      className={cn(
        PAGE_GUTTER,
        'sticky top-0 z-30 w-full shrink-0 border-b border-[color:var(--color-divider)] bg-[color:var(--color-canvas)]',
      )}
    >
      {/* Why `flex-wrap` was removed: wrapping at narrow widths turns the gateway's
          face into two 97px rows that eat the stage (measured at 390px). What collapses
          instead is **the breadcrumb and the section links** — the title states which
          route this is even on a narrow screen, while the logo and the locale switch
          have to survive at any width. */}
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
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] text-[color:var(--color-indigo-accent)]">
            <Orbit size={ICON_SIZE.sm} />
          </span>
          <span className="text-body leading-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
            Ontology Atlas
          </span>
        </Link>
        {crumb ? (
          <>
            <span aria-hidden className="hidden text-body text-[color:var(--color-text-quaternary)] sm:inline">
              /
            </span>
            <span
              aria-current="page"
              className="hidden text-body leading-body text-[color:var(--color-text-tertiary)] sm:inline"
            >
              {crumb}
            </span>
          </>
        ) : null}

        {/* This group's **right edge** is the mirror of the origin — it has to stop at
            `vw − origin` for the top bar to live in the same frame as the band below.
            The owner's report *"공백이 길고 왜이러지?"* (why is there such a long gap?)
            was exactly this edge against the screen edge (measured 1920: 256px · 2560:
            864px). The gate measures it through this testid. */}
        <span
          data-testid="download-gnb-actions"
          className="ml-auto flex shrink-0 items-center gap-3"
        >
          {/* The two reading links. Collapsed below `sm` — a narrow first screen belongs
              to the headline and the download button, and these two are met again in the
              footer on scroll. */}
          <span className="hidden items-center gap-3 sm:flex">
            <GatewayNavLink href="/guide" active={path.startsWith('/guide')}>
              {tNav('guide')}
            </GatewayNavLink>
            <GatewayNavLink href="/changelog" active={path.startsWith('/changelog')}>
              {tNav('changelog')}
            </GatewayNavLink>
          </span>

          {/*
           * X — the position exists and the destination does not yet (`X_HANDLE` is
           * empty).
           *
           * Drawing it disabled is more honest than drawing it as a link: something
           * that looks pressable and goes nowhere is a 「dead CTA」, while this looks
           * unpressable and its `title` says why. Filling in the handle moves this
           * branch to the link side by itself.
           */}
          {xHref ? (
            <a
              href={xHref}
              target="_blank"
              rel="noreferrer noopener"
              data-testid="gateway-x-link"
              aria-label={tNav('xLabel')}
              className={controlClass({ hoverInk: 'strong', shape: "link", tone: "muted", className: "touch-hit-expand" })}
            >
              <XMark size={14} aria-hidden />
            </a>
          ) : (
            /* ⚠️ **Removing `opacity-50` is the fix at this position** (2026-07-30).
               Before that, quaternary (4.76:1) with 0.5 opacity on top dropped the
               effective contrast below the WCAG non-text threshold (1.4.11, 3:1) —
               owner observation *"잘 안보이고"* (hard to see). Disabled speaks through
               **shape, not dimming**: no border, `cursor-not-allowed`, `aria-disabled`
               and a tooltip. */
            <span
              data-testid="gateway-x-placeholder"
              aria-disabled="true"
              title={tNav('xPending')}
              className="inline-flex h-8 cursor-not-allowed items-center rounded-chip px-2 text-[color:var(--color-text-quaternary)]"
            >
              <XMark size={15} aria-hidden />
              <span className="sr-only">{tNav('xPending')}</span>
            </span>
          )}

          {/*
           * ⚠️ **There is no 「지도로 돌아가기」** (2026-07-31, owner: *"이건 홍보
           * 페이지라 메인 화면에서만 이동 가능하게"* — this is a promotional page, so
           * make it navigable only from the main screen).
           *
           * The gateway is what a visitor reads before installing. Putting a route to
           * the workbench in the chrome recommends a working surface to someone who has
           * no vault yet, while someone who does have one goes to the map from `/`
           * anyway (`isGatewaySurface()`). It was a link neither of them used.
           *
           * The route to the map is offered by 「설치 없이 브라우저에서 써보기」 inside
           * the page — that single one remains and stays under the watch of
           * `map-destination-route.contract.test.ts`.
           */}
          <LocaleSwitch />
        </span>
      </div>
    </nav>
  );
}

/**
 * The gateway chrome's reading links — **drawn as chips**.
 *
 * ## Why not bare text (2026-07-30, owner: *"버튼도 아니고 잘 안보이고"* — it isn't a
 * button and it's hard to see)
 *
 * Contrast was never the problem — measured at **6.13:1**, comfortably over the body
 * threshold. The problem was **the neighbours on the same row**: the EN/KO locale
 * switch is a 32×32 chip, while these two alone were bare text (32×20 and 46×20, with
 * no background and no border), so side by side one reads as a control and the other
 * as a label. **Affordance is relative to its neighbours, not an absolute value.**
 *
 * So instead of raising the colour, **the shape was matched**. A background, a border
 * and the same height make all three read as one kind of object.
 *
 * ## The active state is distinguished by surface, not colour
 *
 * The current page has a filled surface (`--color-elevated`) and the others are empty
 * until hover gives them that surface. It is how «you are here» is said within
 * neutrals, and it opens no new colour (`design.md` — one indigo).
 */
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
        // ⚠️ `touch-hit-expand` became **more** necessary once these were chips. It had
        // been there since they were bare text and was dropped in the conversion, and
        // the touch contract caught the 32px height (44px on a coarse pointer). The
        // visible box is untouched and only the hit area widens through a pseudo
        // element, so this row's layout does not change by a pixel.
        'touch-hit-expand h-8 whitespace-nowrap px-2.5',
        'text-body leading-body',
        // ⚠️ **The border is there at rest.** At first the inactive state was
        // `border-transparent` with the chip appearing only on hover, but then the
        // state the owner named (*"버튼도 아니고"* — it isn't even a button) is **exactly
        // what the screen shows at rest** — hover is discovered only by someone who
        // already believed it was a control. Affordance has to exist before the hand arrives.
        active
          ? 'border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] text-[color:var(--color-text-primary)]'
          : 'border-[color:var(--color-border-strong)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-elevated)] hover:text-[color:var(--color-text-primary)]',
      ) })}
    >
      {children}
    </Link>
  );
}
