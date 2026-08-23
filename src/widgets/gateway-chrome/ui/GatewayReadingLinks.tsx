'use client';

import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import { stripLocalePrefix } from '@/shared/lib/nav-destination';
import { controlClass } from '@/shared/ui/control-class';

/**
 * The route to the two reading pages (`/guide` · `/changelog`) — **only at the widths
 * where the chrome collapses them.**
 *
 * ## Why it exists (measured 2026-08-07)
 *
 * `GatewayNav` collapses these two below `sm`. That judgement is right — a narrow
 * first screen belongs to the headline and the download button. The problem was that
 * **after collapsing there was nowhere to go.** The code comment said *"they are met
 * again in the footer on scroll"*, but the gateway footer holds only the licence and
 * stack strings and has **zero links at any width**. The guide and changelog routes
 * have no footer at all.
 *
 * Measured (static export · 390×844): **0** visible guide links on the gateway, **0**
 * changelog links, and **0** menus that open them. Both are in the DOM and simply not
 * drawn — the same as not being on screen, and by this repository's name, a neighbour
 * of the **dead-end CTA**.
 *
 * ## Why `sm:hidden`
 *
 * Above that width the chrome already provides them. Putting the same link in both
 * the chrome and the page makes one of the two a dead promise — the same judgement
 * `GatewayNav`'s preamble used when dropping "back to the map", followed here too.
 *
 * The page currently being viewed stays a link but carries `aria-current`. Removing it
 * would change how many items are in the row depending on width, forcing the reader to
 * re-read "is it one or two" every time.
 */
export function GatewayReadingLinks({ className }: { className?: string }) {
  const t = useTranslations('gatewayNav');
  const path = stripLocalePrefix(usePathname() ?? '/');
  const items = [
    { href: '/guide', label: t('guide'), testId: 'gateway-footer-guide' },
    { href: '/changelog', label: t('changelog'), testId: 'gateway-footer-changelog' },
  ] as const;

  return (
    <div
      data-testid="gateway-footer-reading"
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 sm:hidden', className)}
    >
      {items.map((item) => {
        const active = path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            data-testid={item.testId}
            aria-current={active ? 'page' : undefined}
            className={controlClass({
              shape: 'link',
              tone: active ? 'default' : 'secondary',
            })}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
