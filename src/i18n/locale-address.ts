import { withTrailingSlash } from '@/shared/lib/public-pages/trailing-slash';

import { routing } from './routing';

/** An address that stays inside the app: a path, never `//host` and never a scheme. */
export function isInternalAddress(address: string): boolean {
  return address.startsWith('/') && !address.startsWith('//');
}

/** `/library/` becomes `/en/library/`; text that is not an in-app path is left as written. */
export function withLocale(address: string, locale: string): string {
  if (!isInternalAddress(address)) return address;
  return address === '/' ? `/${locale}/` : `/${locale}${address}`;
}

/** An in-app address ends its path with a slash; the query and hash stay as written. */
export function withPathSlash(address: string): string {
  if (!isInternalAddress(address)) return address;
  const [, path = '', rest = ''] = /^([^?#]*)(.*)$/.exec(address) ?? [];
  return `${withTrailingSlash(path)}${rest}`;
}

export function withoutLocale(pathname: string, locales: readonly string[] = routing.locales): string {
  const [, first = '', ...rest] = pathname.split('/');
  if (!locales.includes(first)) return pathname;
  return `/${rest.join('/')}`;
}
