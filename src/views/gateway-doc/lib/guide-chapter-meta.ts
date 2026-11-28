import { getFormatter, getTranslations } from 'next-intl/server';

import { firstCommitDate, lastCommitDate } from '@/shared/lib/public-pages/source-dates';

import { GUIDE_ENTRY_PAGE, type GuidePage } from '../model/guide-pages';
import { guideSourcePath } from '../model/guide-pages';
import { guideStructuredData } from './guide-structured-data';

export interface GuideChapterMeta {
  headline: string;
  description: string;
  dateModified?: string;
  datePublished?: string;
  updated?: { dateTime: string; label: string };
  structuredData: ReturnType<typeof guideStructuredData>;
}

/**
 * Everything a guide route says about a chapter beyond its body, read once at build time by the
 * route's server component. `bodyPath` is the file the reader's locale actually renders, so a
 * chapter still shown in English is dated by the English file.
 */
export async function guideChapterMeta(page: GuidePage, locale: string, bodyPath: string): Promise<GuideChapterMeta> {
  const tNav = await getTranslations({ locale, namespace: 'gatewayNav' });
  const t = await getTranslations({ locale, namespace: 'metadata' });
  const headline = tNav(`guidePages.${page.titleKey}`);
  const description =
    page.segment === GUIDE_ENTRY_PAGE.segment ? t('descriptions.guide') : t(`guideDescriptions.${page.titleKey}`);
  const dateModified = lastCommitDate([bodyPath]);
  const datePublished = firstCommitDate(guideSourcePath(page, 'en'));

  let updated: GuideChapterMeta['updated'];
  if (dateModified) {
    const format = await getFormatter({ locale });
    // The committer's own calendar day, so the build machine's time zone cannot move it.
    const day = new Date(`${dateModified.slice(0, 10)}T00:00:00Z`);
    const date = format.dateTime(day, { dateStyle: 'long', timeZone: 'UTC' });
    updated = { dateTime: dateModified, label: tNav('updatedOn', { date }) };
  }

  return {
    headline,
    description,
    dateModified,
    datePublished,
    updated,
    structuredData: guideStructuredData({
      locale,
      page,
      headline,
      description,
      guideName: t('pages.guide'),
      dateModified,
      datePublished,
    }),
  };
}
