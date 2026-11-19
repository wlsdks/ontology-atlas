import { execFileSync } from 'node:child_process';
import type { MetadataRoute } from 'next';
import { deriveBundledProjects } from '@/entities/docs-vault';
import { SITE_URL } from '@/shared/config';
import { LOCALE_META } from '@/i18n/locales';
import { routing } from '@/i18n/routing';
import {
  CHANGELOG_CONTENT_LOCALES,
  GUIDE_ENTRY_PAGE,
  GUIDE_PAGES,
  guideCanonicalPath,
  guideSourcePath,
} from '@/views/gateway-doc';

// Static export — must resolve at build time.
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

/** Where each route's words live, so its `lastmod` is the last commit that changed them. */
function sourcesOf(route: string, locale: string): string[] {
  if (route === 'download') return ['src/views/download', 'messages/en/download.json'];
  if (route === 'changelog') return ['docs/records/changes', 'docs/records/releases'];
  if (route === 'topology') return ['app/[locale]/topology', 'messages/en/topology.json'];
  // A guide chapter in one language changes with its own body, title and description, not with
  // another language's.
  const page = route === 'guide' ? GUIDE_ENTRY_PAGE : GUIDE_PAGES.find((guide) => guideCanonicalPath(guide) === route);
  if (!page) return ['src/views/gateway-doc', `messages/${locale}`];
  return [
    'src/views/gateway-doc',
    guideSourcePath(page, locale),
    `messages/${locale}/gatewayNav.json`,
    `messages/${locale}/metadata.json`,
  ];
}

/** Google uses `lastmod` only when it is verifiably accurate, so it comes from Git or is omitted. */
function lastCommitDate(paths: string[]): string | undefined {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', ...paths], { encoding: 'utf8' }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

/** Locales whose copy of a route is a page of record; the rest canonicalize elsewhere (`buildPageMetadata`). */
const localesOf = (route: string): readonly string[] =>
  route === 'changelog' ? CHANGELOG_CONTENT_LOCALES : routing.locales;

const hreflangOf = (locale: string): string =>
  (LOCALE_META as Record<string, { hreflang: string }>)[locale]?.hreflang ?? locale;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /**
   * The project list must come from the same source as route generation, `bundledProjectSlugs()`, or
   * built pages go missing from the sitemap.
   */
  const projects = deriveBundledProjects();
  const entries: MetadataRoute.Sitemap = [];
  const modified = new Map(
    routing.locales.flatMap((locale) =>
      STATIC_ROUTES.map((route) => [`${locale}/${route}`, lastCommitDate(sourcesOf(route, locale))] as const),
    ),
  );

  // Per-locale entries for the static set + per-locale per-project entries.
  // Each entry advertises its hreflang siblings via `alternates.languages`,
  // which Google uses to pick the right localized URL for a user.
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
          // `x-default` is where we decide what to give a user in neither language (a French
          // browser, say). Without it the search engine picks for itself. It must say the same
          // thing as the page `<head>`'s hreflang (`buildPageMetadata`) — if the two diverge, both
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
          // Same rule as the static routes — omitting `x-default` leaves the search engine choosing
          // a default language for this entry alone.
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
