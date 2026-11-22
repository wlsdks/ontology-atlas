import type { MetadataRoute } from 'next';
import { deriveIndexedProjects } from '@/entities/docs-vault';
import { SITE_URL } from '@/shared/config';
import { lastCommitDate } from '@/shared/lib/public-pages/source-dates';
import { LOCALE_META } from '@/i18n/locales';
import { routing } from '@/i18n/routing';
import {
  CHANGELOG_CONTENT_LOCALES,
  GUIDE_ENTRY_PAGE,
  GUIDE_PAGES,
  guideCanonicalPath,
  guideSourcePath,
} from '@/views/gateway-doc';

export const dynamic = 'force-static';

// Canonical surfaces a user can reach directly. Compatibility redirects, vault-mode-only entry
// points such as /project/new, and `/{locale}/` (canonical: `/{locale}/download/`) are excluded.
// `projects` and `library` are left out: their exported HTML holds under 200 characters of text,
// since the vault fills them in the browser, so they offer a crawler nothing to index.
const STATIC_ROUTES = [
  'download',
  'topology',
  'guide',
  'changelog',
  ...GUIDE_PAGES.slice(1).map(guideCanonicalPath),
  // Compatibility redirects such as 'ontology' are excluded — none is its own canonical
  // (`app/[locale]/ontology/page.tsx`). Putting an address whose canonical points elsewhere into
  // the sitemap makes two signals say different things.
];

function sourcesOf(route: string, locale: string): string[] {
  if (route === 'download') return ['src/views/download', 'messages/en/download.json'];
  if (route === 'changelog') return ['docs/records/changes', 'docs/records/releases'];
  if (route === 'topology') return ['app/[locale]/topology', 'messages/en/topology.json'];
  const page = route === 'guide' ? GUIDE_ENTRY_PAGE : GUIDE_PAGES.find((guide) => guideCanonicalPath(guide) === route);
  if (!page) return ['src/views/gateway-doc', `messages/${locale}`];
  return [
    'src/views/gateway-doc',
    guideSourcePath(page, locale),
    `messages/${locale}/gatewayNav.json`,
    `messages/${locale}/metadata.json`,
  ];
}

const localesOf = (route: string): readonly string[] =>
  route === 'changelog' ? CHANGELOG_CONTENT_LOCALES : routing.locales;

const hreflangOf = (locale: string): string =>
  (LOCALE_META as Record<string, { hreflang: string }>)[locale]?.hreflang ?? locale;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /**
   * The project list comes from the same source as route generation, `bundledProjectSlugs()`, less
   * the demo samples, whose pages are noindex (`app/[locale]/project/[slug]/page.tsx`).
   */
  const projects = deriveIndexedProjects();
  const entries: MetadataRoute.Sitemap = [];
  const modified = new Map(
    routing.locales.flatMap((locale) =>
      STATIC_ROUTES.map((route) => [`${locale}/${route}`, lastCommitDate(sourcesOf(route, locale))] as const),
    ),
  );

  for (const locale of routing.locales) {
    for (const route of STATIC_ROUTES) {
      const ownLocales = localesOf(route);
      if (!ownLocales.includes(locale)) continue;
      const path = `/${locale}/${route}/`;
      const lastModified = modified.get(`${locale}/${route}`);
      entries.push({
        url: `${SITE_URL}${path}`,
        ...(lastModified ? { lastModified } : {}),
        alternates: {
          // `x-default` must say the same as the page `<head>`'s hreflang (`buildPageMetadata`), or both
                  // are ignored.
          languages: {
            ...Object.fromEntries(
              ownLocales.map((l) => [
                hreflangOf(l),
                `${SITE_URL}/${l}/${route}/`,
              ])
            ),
            'x-default': `${SITE_URL}/${ownLocales[0]}/${route}/`,
          },
        },
      });
    }

    for (const project of projects) {
      entries.push({
        url: `${SITE_URL}/${locale}/project/${project.slug}/`,
        ...(project.updatedAt ? { lastModified: project.updatedAt } : {}),
        alternates: {
          languages: {
            ...Object.fromEntries(
              routing.locales.map((l) => [
                hreflangOf(l),
                `${SITE_URL}/${l}/project/${project.slug}/`,
              ])
            ),
            'x-default': `${SITE_URL}/${routing.defaultLocale}/project/${project.slug}/`,
          },
        },
      });
    }
  }

  return entries;
}
