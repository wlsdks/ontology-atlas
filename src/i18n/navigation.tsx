'use client';

import { forwardRef, useContext, type ComponentProps, type MouseEvent } from 'react';
import { createNavigation } from 'next-intl/navigation';

import { isInsidePane, linkPressSwapsPane, PaneNavigationContext } from '@/shared/lib/navigation/pane-link';
import { routing } from './routing';

const navigation = createNavigation(routing);

/**
 * Locale-aware Link / useRouter / usePathname for in-app routes, so the locale prefix is kept.
 * External URLs and root `/` redirects use the bare next/* exports.
 */
export const { usePathname, useRouter } = navigation;

type LinkProps = ComponentProps<typeof navigation.Link>;

/** A link in the pane that leads to another screen crossfades the pane, as a rail press does. */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ onClick, ...props }, ref) {
  const pane = useContext(PaneNavigationContext);
  const { href, replace, scroll, locale } = props;
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (!pane || typeof href !== 'string') return;
    const anchor = event.currentTarget;
    const swapsPane = linkPressSwapsPane(
      {
        defaultPrevented: event.defaultPrevented,
        button: event.button,
        modified: event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
        target: anchor.target,
        download: anchor.hasAttribute('download'),
        insidePane: isInsidePane(anchor),
      },
      href,
      pane.pathname,
    );
    if (!swapsPane) return;
    event.preventDefault();
    pane.crossfadeTo(href, { replace, scroll, locale });
  };
  return <navigation.Link ref={ref} {...props} onClick={handleClick} />;
});
