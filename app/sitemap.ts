import type { MetadataRoute } from 'next';
import { deriveBundledProjects } from '@/entities/docs-vault';
import { SITE_URL } from '@/shared/config';
import { routing } from '@/i18n/routing';
import { GUIDE_PAGES, guideCanonicalPath } from '@/views/gateway-doc';

// Static export — must resolve at build time.
export const dynamic = 'force-static';

// Canonical surfaces a user can reach directly. Compatibility redirects and vault-mode-only entry
// points such as /project/new are excluded.
const STATIC_ROUTES = [
  '',
  'projects',
  'download',
  'topology',
  'docs',
  'guide',
  'changelog',
  ...GUIDE_PAGES.slice(1).map(guideCanonicalPath),
  // 'ontology' is excluded — it redirects to `/topology`, so it is not its own canonical
  // (`app/[locale]/ontology/page.tsx`). Putting an address whose canonical points elsewhere into
  // the sitemap makes two signals say different things.
  'ontology/insights',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /**
   * The sitemap's project list must come from **the same source as route generation** — exactly the
   * set of addresses `bundledProjectSlugs()` produces.
   *
   * It used to read only the dogfood manifest. So when the `/project/storefront/` 404 was fixed by
   * switching only route generation to the full set, addresses existed **in the build but not in the
   * sitemap** (measured 2026-08-01: `public-routes-coherence` reported
   * `en: slug present as HTML but missing from sitemap: storefront`). The one demo the app promotes
   * everywhere still did not exist as far as crawlers were concerned.
   *
   * A value derived in two places lets a half-fix pass. They are merged into one.
   */
  const projects = deriveBundledProjects();
  const entries: MetadataRoute.Sitemap = [];

  // Per-locale entries for the static set + per-locale per-project entries.
  // Each entry advertises its hreflang siblings via `alternates.languages`,
  // which Google uses to pick the right localized URL for a user.
  for (const locale of routing.locales) {
    for (const route of STATIC_ROUTES) {
      const path = route ? `/${locale}/${route}/` : `/${locale}/`;
      entries.push({
        url: `${SITE_URL}${path}`,
        changeFrequency: 'weekly',
        priority: route === '' ? 1 : 0.8,
        alternates: {
          // `x-default` is where we decide what to give a user in neither language (a French
          // browser, say). Without it the search engine picks for itself. It must say the same
          // thing as the page `<head>`'s hreflang (`buildPageMetadata`) — if the two diverge, both
          // are ignored.
          languages: {
            ...Object.fromEntries(
              routing.locales.map((l) => [l, `${SITE_URL}${route ? `/${l}/${route}/` : `/${l}/`}`])
            ),
            'x-default': `${SITE_URL}${route ? `/${routing.defaultLocale}/${route}/` : `/${routing.defaultLocale}/`}`,
          },
        },
      });
    }

    for (const project of projects) {
      entries.push({
        url: `${SITE_URL}/${locale}/project/${project.slug}/`,
        ...(project.updatedAt ? { lastModified: project.updatedAt } : {}),
        changeFrequency: 'weekly',
        priority: 0.7,
        alternates: {
          // Same rule as the static routes — omitting `x-default` leaves the search engine choosing
          // a default language for this entry alone.
          languages: {
            ...Object.fromEntries(
              routing.locales.map((l) => [l, `${SITE_URL}/${l}/project/${project.slug}/`])
            ),
            'x-default': `${SITE_URL}/${routing.defaultLocale}/project/${project.slug}/`,
          },
        },
      });
    }
  }

  return entries;
}
