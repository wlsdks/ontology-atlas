/**
 * The single source for the site's canonical URL.
 *
 * Layout metadata, project-detail canonicals, the sitemap and robots must all use
 * this value so search engines index one consistent canonical. Someone deploying
 * this OSS on their own domain changes this constant alone and all SEO follows.
 *
 * The default is the official GitHub Pages custom-domain deployment (Firebase
 * Hosting was dropped in 2026-07 to avoid the Spark plan's 360MB/day hard cap —
 * owner decision). Even on a local dev server the canonical metadata keeps
 * pointing at the public site.
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
