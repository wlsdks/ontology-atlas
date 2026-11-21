/**
 * The single source for the site's canonical URL: layout metadata, project canonicals, the
 * sitemap and robots all read it, so a self-hosted deployment changes this constant alone. It
 * points at the public site even on a local dev server.
 */
export const SITE_URL = "https://ontologyatlas.com";

/**
 * Turns a relative path such as `/project/foo/` into an absolute canonical URL.
 * The trailing slash follows Next.js's `trailingSlash: true` policy.
 */
export function absoluteUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}
