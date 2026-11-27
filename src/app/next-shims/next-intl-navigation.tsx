import { useRouter as useTanStackRouter } from '@tanstack/react-router';
import { forwardRef, useMemo, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { useLocale } from 'use-intl';

import { isTauriVaultRuntime } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';

import { navigateToAddress, type AddressNavigation } from '../router/navigate-to-address';
import { useCommittedAddress } from '../router/use-committed-address';

interface Routing {
  locales: readonly string[];
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  locale?: string;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean;
}

const isInternal = (address: string) => address.startsWith('/') && !address.startsWith('//');

/** `/library/` becomes `/en/library/`; text that is not an in-app path is left as written. */
function withLocale(address: string, locale: string): string {
  if (!isInternal(address)) return address;
  return address === '/' ? `/${locale}/` : `/${locale}${address}`;
}

/** An in-app address ends its path with a slash, as Next's `trailingSlash` wrote every link; query and hash stay as written. */
function withTrailingSlash(address: string): string {
  if (!isInternal(address)) return address;
  const [, path = '', rest = ''] = /^([^?#]*)(.*)$/.exec(address) ?? [];
  return path.endsWith('/') || /\.[a-z0-9]+$/i.test(path) ? address : `${path}/${rest}`;
}

function withoutLocale(pathname: string, locales: readonly string[]): string {
  const [, first = '', ...rest] = pathname.split('/');
  if (!locales.includes(first)) return pathname;
  return `/${rest.join('/')}`;
}

/** The slice of next-intl's navigation Atlas uses, over TanStack Router. */
export function createNavigation(routing: Routing) {
  function usePathname(): string {
    return withoutLocale(useCommittedAddress().pathname, routing.locales);
  }

  function useRouter() {
    const router = useTanStackRouter();
    const current = useLocale();
    return useMemo(() => {
      const go = (address: string, options: AddressNavigation & { locale?: string } = {}, replace = false) =>
        navigateToAddress(router, withLocale(address, options.locale ?? current), { ...options, replace });
      return {
        push: (address: string, options?: AddressNavigation & { locale?: string }) => go(address, options),
        replace: (address: string, options?: AddressNavigation & { locale?: string }) => go(address, options, true),
        back: () => router.history.back(),
        forward: () => router.history.forward(),
        prefetch: (_address: string) => undefined,
        refresh: () => void router.invalidate(),
      };
    }, [router, current]);
  }

  const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
    { href, locale, replace, scroll, prefetch: _prefetch, onClick, ...rest },
    ref,
  ) {
    const router = useTanStackRouter();
    const current = useLocale();
    const address = withTrailingSlash(withLocale(href, locale ?? current));
    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      // In a plain browser a link between pages is a page load: each public page is its own prerendered document.
      if (!isTauriVaultRuntime()) return;
      if (!isInternal(address) || (rest.target !== undefined && rest.target !== '_self') || rest.download !== undefined) return;
      event.preventDefault();
      navigateToAddress(router, address, { ...(replace === undefined ? {} : { replace }), ...(scroll === undefined ? {} : { scroll }) });
    };
    return <a {...rest} ref={ref} href={address} onClick={handleClick} />;
  });

  return { Link, useRouter, usePathname };
}
