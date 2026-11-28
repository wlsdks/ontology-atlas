import { createFormatter } from 'use-intl';

import type { AppLocale } from '@/i18n/locales';
import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';
import {
  GUIDE_ENTRY_PAGE,
  guideCanonicalPath,
  guideSourcePath,
  guideStructuredData,
  resolveGuidePage,
  type GatewayDocument,
} from '@/views/gateway-doc';
import { buildPageMetadata } from '@/shared/lib/public-pages/page-metadata';

import type { BuildFacts } from './build-facts';
import { messageReader, resolveMetadata, type MessageTree } from './screen-metadata';

const englishChapters = import.meta.glob<string>('/docs/guide/*.md', { query: '?raw', import: 'default' });
const translatedChapters = import.meta.glob<string>('/docs-i18n/guide/*/*.md', { query: '?raw', import: 'default' });

/**
 * A chapter's body in the reader's language, from the one file that holds it. Each file is its own chunk, so
 * a page fetches only its chapter. A language without a translation of the chapter reads the English one and
 * says so by `sourcePath`.
 */
async function readChapterDocument(segment: string, locale: AppLocale): Promise<GatewayDocument & { sourcePath: string }> {
  const { page } = resolveGuidePage(segment);
  const translated = translatedChapters[`/${guideSourcePath(page, locale)}`];
  if (locale !== 'en' && translated) {
    return { raw: await translated(), bundledOmittedSections: 0, language: locale, sourcePath: guideSourcePath(page, locale) };
  }
  const english = englishChapters[`/${guideSourcePath(page, 'en')}`];
  const raw = english ? parseFrontmatter(await english()).body.replace(/^(\r?\n)+/, '') : null;
  return { raw, bundledOmittedSections: 0, language: 'en', sourcePath: guideSourcePath(page, 'en') };
}

/** Everything a guide route says about one chapter: its head, its structured data, its body and the words around it. */
export async function loadGuideChapter({
  locale,
  segment,
  messages,
  buildFacts,
}: {
  locale: AppLocale;
  segment: string | undefined;
  messages: MessageTree;
  buildFacts: BuildFacts;
}) {
  const read = messageReader(locale, messages);
  const { page, matched } = resolveGuidePage(segment);
  const isEntry = page.segment === GUIDE_ENTRY_PAGE.segment;
  const document = await readChapterDocument(page.segment, locale);
  const dates = await buildFacts.sourceDates(document.sourcePath, guideSourcePath(page, 'en'));
  const headline = read('gatewayNav', `guidePages.${page.titleKey}`);
  const description = isEntry ? read('metadata', 'descriptions.guide') : read('metadata', `guideDescriptions.${page.titleKey}`);

  let updated: { dateTime: string; label: string } | undefined;
  if (dates.modified) {
    // The committer's own calendar day, so the build machine's time zone cannot move it.
    const day = new Date(`${dates.modified.slice(0, 10)}T00:00:00Z`);
    const date = createFormatter({ locale }).dateTime(day, { dateStyle: 'long', timeZone: 'UTC' });
    updated = { dateTime: dates.modified, label: read('gatewayNav', 'updatedOn', { date }) };
  }

  const base = buildPageMetadata({
    locale,
    path: guideCanonicalPath(page),
    title: isEntry && segment === undefined ? read('metadata', 'pages.guide') : `${headline} · ${read('metadata', 'pages.guide')}`,
    description,
  });
  const resolved = resolveMetadata(
    {
      ...base,
      openGraph: {
        ...base.openGraph,
        type: 'article',
        ...(dates.published ? { publishedTime: dates.published } : {}),
        ...(dates.modified ? { modifiedTime: dates.modified } : {}),
      },
    },
    read,
  );

  return {
    resolved,
    document,
    page,
    matched,
    title: headline,
    lead: isEntry ? read('gatewayNav', 'guideLead') : undefined,
    notice: matched ? undefined : read('gatewayNav', 'guideUnknownSegment'),
    updated,
    structuredData: guideStructuredData({
      locale,
      page,
      headline,
      description,
      guideName: read('metadata', 'pages.guide'),
      dateModified: dates.modified,
      datePublished: dates.published,
    }),
  };
}
