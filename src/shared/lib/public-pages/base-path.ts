/**
 * Base path for a static export served from a subpath, injected at build time; empty for a root
 * deployment. Raw `<a href>`, `<img src>`, metadata links and hand-built fetch URLs must go through
 * this helper.
 */
export const BASE_PATH = process.env.ATLAS_PUBLIC_BASE_PATH ?? '';

export function withBasePath(path: string): string {
  if (!BASE_PATH) return path;
  if (!path.startsWith('/')) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}
