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

export interface SitemapEntry {
  url: string;
  lastModified?: string;
  alternates: { languages: Record<string, string> };
}

/*
 * The website's own pages. Every address that is a screen of the installed app answers with the app-only
 * page and is noindex, so none is listed; nor are compatibility redirects such as `ontology`, none of which
 * is its own canonical, or `/{locale}/` (canonical: `/{locale}/download/`). An address whose canonical points
 * elsewhere in the sitemap makes two signals say different things.
 */
const PAGES = ['download', 'sample', 'guide', 'changelog', ...GUIDE_PAGES.slice(1).map(guideCanonicalPath)];

function sourcesOf(route: string, locale: string): string[] {
  if (route === 'download') return ['src/views/download', 'messages/en/download.json'];
  if (route === 'changelog') return ['docs/records/changes', 'docs/records/releases'];
  if (route === 'sample') return ['src/views/sample-map', 'samples/storefront', 'messages/en/sampleMap.json'];
  const page = route === 'guide' ? GUIDE_ENTRY_PAGE : GUIDE_PAGES.find((guide) => guideCanonicalPath(guide) === route);
  if (!page) return ['src/views/gateway-doc', `messages/${locale}`];
  return [
    'src/views/gateway-doc',
    guideSourcePath(page, locale),
    `messages/${locale}/gatewayNav.json`,
    `messages/${locale}/metadata.json`,
  ];
}

const localesOf = (route: string): readonly string[] => (route === 'changelog' ? CHANGELOG_CONTENT_LOCALES : routing.locales);

const hreflangOf = (locale: string): string => (LOCALE_META as Record<string, { hreflang: string }>)[locale]?.hreflang ?? locale;

/** Each page in each language it has its own words in, dated by the last commit to what it says, never by the build. */
export function sitemapEntries(): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  for (const locale of routing.locales) {
    for (const route of PAGES) {
      const ownLocales = localesOf(route);
      if (!ownLocales.includes(locale)) continue;
      const lastModified = lastCommitDate(sourcesOf(route, locale));
      entries.push({
        url: `${SITE_URL}/${locale}/${route}/`,
        ...(lastModified ? { lastModified } : {}),
        alternates: {
          // `x-default` must say the same as the page's own `<head>` (`buildPageMetadata`), or both are ignored.
          languages: {
            ...Object.fromEntries(ownLocales.map((l) => [hreflangOf(l), `${SITE_URL}/${l}/${route}/`])),
            'x-default': `${SITE_URL}/${ownLocales[0]}/${route}/`,
          },
        },
      });
    }
  }
  return entries;
}

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function sitemapXml(entries: readonly SitemapEntry[]): string {
  const urls = entries.map((entry) =>
    [
      '<url>',
      `<loc>${escapeXml(entry.url)}</loc>`,
      ...Object.entries(entry.alternates.languages).map(
        ([language, href]) => `<xhtml:link rel="alternate" hreflang="${escapeXml(language)}" href="${escapeXml(href)}" />`,
      ),
      ...(entry.lastModified ? [`<lastmod>${escapeXml(entry.lastModified)}</lastmod>`] : []),
      '</url>',
    ].join('\n'),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
