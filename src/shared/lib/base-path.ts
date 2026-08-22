/**
 * Base path for a static export served from a subpath (a GitHub Pages project
 * site, for instance). Injected at build time; empty for a root deployment.
 *
 * `next/link` and the router get this from `basePath` in `next.config`, but raw
 * `<a href>`, `next/image` `src`, metadata links and hand-built fetch URLs are
 * not prefixed automatically and must go through this helper.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function withBasePath(path: string): string {
  if (!BASE_PATH) return path;
  if (!path.startsWith('/')) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}
