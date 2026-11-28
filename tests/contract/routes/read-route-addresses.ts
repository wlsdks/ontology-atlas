import { readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

/** `site` is the website's public pages; `app` is every screen of the installed app. */
export type RouteGroup = 'app' | 'site';

export interface RouteAddress {
  /** The address under a language, such as `/guide` or `/guide/$segment`; `/` is the language's entry. */
  address: string;
  group: RouteGroup;
  /** The route module, relative to the repository root. */
  file: string;
}

const ROUTES_FOLDER = join('src', 'app', 'routes', '$locale');
const GROUP_FOLDERS: ReadonlyArray<readonly [folder: string, group: RouteGroup]> = [
  ['_app', 'app'],
  ['_site', 'site'],
];

/**
 * Every address the router serves under a language, read from the route modules the way the router plugin
 * reads them: a name starting with `-` is not a route, a `route.tsx` is a layout, and the splat `$.tsx` is
 * the not-found screen rather than an address.
 */
export function readRouteAddresses(root = process.cwd()): RouteAddress[] {
  return GROUP_FOLDERS.flatMap(([folder, group]) =>
    readdirSync(join(root, ROUTES_FOLDER, folder), { recursive: true })
      .map((entry) => String(entry).split(sep))
      .filter((parts) => parts.every((part) => !part.startsWith('-')) && /\.tsx$/.test(parts.at(-1)!) && !/\.test\.tsx$/.test(parts.at(-1)!))
      .map((parts) => [...parts.slice(0, -1), parts.at(-1)!.replace(/\.tsx$/, '')])
      .filter((parts) => parts.at(-1) !== 'route' && parts.at(-1) !== '$')
      .map((parts) => ({
        address: `/${parts.filter((part) => part !== 'index').join('/')}`,
        group,
        file: `${join(ROUTES_FOLDER, folder, ...parts).split(sep).join('/')}.tsx`,
      })),
  ).sort((a, b) => a.address.localeCompare(b.address));
}
