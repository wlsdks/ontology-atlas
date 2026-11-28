import { useRouter as useTanStackRouter } from '@tanstack/react-router';
import { forwardRef, useContext, useMemo, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { useLocale } from 'use-intl';

import { navigateToAddress, type AddressNavigation } from '@/shared/lib/navigation/navigate-to-address';
import { isInsidePane, linkPressSwapsPane, PaneNavigationContext } from '@/shared/lib/navigation/pane-link';
import { useCommittedAddress } from '@/shared/lib/navigation/use-committed-address';
import { isTauriVaultRuntime } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';

import { isInternalAddress, withLocale, withoutLocale, withPathSlash } from './locale-address';

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  /** The language the address is written in; the current one when absent. */
  locale?: string;
  replace?: boolean;
  /** `false` keeps the scroll position, as a pane that only changes its selection does. */
  scroll?: boolean;
}

interface Navigation extends AddressNavigation {
  locale?: string;
}

/**
 * Locale-aware `Link`, `useRouter` and `usePathname` for in-app routes, so every address keeps its language.
 * Text that is not an in-app path (an external URL, a `//host`) goes through untouched.
 *
 * In a plain browser a move to another page is a page load: each public page is its own prerendered
 * document and carries what only its own document holds. Inside the installed app it is a router move.
 */
export function usePathname(): string {
  return withoutLocale(useCommittedAddress().pathname);
}

export function useRouter() {
  const router = useTanStackRouter();
  const current = useLocale();
  return useMemo(() => {
    const go = (address: string, options: Navigation = {}, replace = false) => {
      const located = withLocale(address, options.locale ?? current);
      if (!isTauriVaultRuntime() && isInternalAddress(located)) {
        const target = withPathSlash(located);
        if (replace) window.location.replace(target);
        else window.location.assign(target);
        return;
      }
      navigateToAddress(router, located, { ...options, replace });
    };
    return {
      push: (address: string, options?: Navigation) => go(address, options),
      replace: (address: string, options?: Navigation) => go(address, options, true),
      back: () => router.history.back(),
      forward: () => router.history.forward(),
      refresh: () => void router.invalidate(),
    };
  }, [router, current]);
}

/** A link in the pane that leads to another screen crossfades the pane, as a rail press does. */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, locale, replace, scroll, onClick, ...rest },
  ref,
) {
  // A link only reaches the router when it is pressed, so one drawn without a router (a component test) is a plain anchor.
  const router = useTanStackRouter({ warn: false });
  const current = useLocale();
  const pane = useContext(PaneNavigationContext);
  const address = withPathSlash(withLocale(href, locale ?? current));
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    const anchor = event.currentTarget;
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (pane) {
      const swapsPane = linkPressSwapsPane(
        {
          defaultPrevented: event.defaultPrevented,
          button: event.button,
          modified,
          target: anchor.target,
          download: anchor.hasAttribute('download'),
          insidePane: isInsidePane(anchor),
        },
        href,
        pane.pathname,
      );
      if (swapsPane) {
        event.preventDefault();
        pane.crossfadeTo(href, { replace, scroll, locale });
        return;
      }
    }
    if (event.defaultPrevented || event.button !== 0 || modified || !isTauriVaultRuntime()) return;
    if (!isInternalAddress(address) || (anchor.target !== '' && anchor.target !== '_self') || anchor.hasAttribute('download')) {
      return;
    }
    event.preventDefault();
    navigateToAddress(router, address, {
      ...(replace === undefined ? {} : { replace }),
      ...(scroll === undefined ? {} : { scroll }),
    });
  };
  return <a {...rest} ref={ref} href={address} onClick={handleClick} />;
});
