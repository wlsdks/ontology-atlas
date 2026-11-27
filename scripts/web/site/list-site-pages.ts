import type { StaticDataRouteOption } from '@tanstack/react-router';
import type { createAtlasRouter } from '../../../src/app/router/create-atlas-router';
import type { ScreenHead } from '../../../src/app/routes/-site/screen-metadata';
import { routing } from '@/i18n/routing';

/** What each address of the website is written as. */
export type SitePage =
  /** A public page: the router renders it and the browser hydrates it. */
  | { kind: 'router'; path: string; locale: (typeof routing.locales)[number] }
  /** An address that is a screen of the installed app: the two faces, no screen. */
  | { kind: 'app-address'; path: string; locale: (typeof routing.locales)[number]; head: ScreenHead }
  /** `/<language>/`: the website's entry, which a script sends on to the download page. */
  | { kind: 'locale-entry'; path: string; locale: (typeof routing.locales)[number]; head: ScreenHead };

type Router = ReturnType<typeof createAtlasRouter>;

/** The part of a route this list reads; the generated route types cannot be indexed by an id read from a loop. */
interface ListedRoute {
  id: string;
  fullPath: string;
  children?: unknown;
  options: { staticData?: StaticDataRouteOption };
}

const hasChildren = (route: ListedRoute) => route.children !== undefined;

/**
 * Every address the website holds, read from the router's own route tree: a route under the public layout is
 * a page in each language, a route under the app layout is an app address in each, and a `$param` is
 * expanded by the values its route declares. The list is never written twice.
 */
export function listSitePages(router: Router): SitePage[] {
  const pages: SitePage[] = [];
  for (const route of Object.values(router.routesById as unknown as Record<string, ListedRoute>)) {
    if (hasChildren(route) || route.id === '__root__' || route.id === '/' || route.id.endsWith('/$')) continue;
    const isPublic = route.id.startsWith('/$locale/_site/');
    const isApp = route.id.startsWith('/$locale/_app/');
    if (!isPublic && !isApp) continue;
    const staticData = route.options.staticData;
    const valuesOfParams = staticData?.prerenderParams?.() ?? [{}];
    for (const locale of routing.locales) {
      for (const values of valuesOfParams) {
        const path = `${route.fullPath.replace('$locale', locale).replace(/\$(\w+)/g, (_match: string, name: string) => {
          const value = values[name];
          if (value === undefined) throw new Error(`${route.id} has the param $${name} and declares no values for it (staticData.prerenderParams)`);
          return value;
        })}/`.replace(/\/+$/, '/');
        if (isPublic) {
          pages.push({ kind: 'router', path, locale });
          continue;
        }
        const head = staticData?.head;
        if (!head) throw new Error(`${route.id} declares no head (staticData.head), so its address cannot be prerendered`);
        pages.push({ kind: route.id === '/$locale/_app/' ? 'locale-entry' : 'app-address', path, locale, head });
      }
    }
  }
  return pages.sort((a, b) => a.path.localeCompare(b.path));
}
