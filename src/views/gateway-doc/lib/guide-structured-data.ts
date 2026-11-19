import { absoluteUrl } from '@/shared/config';
import { SITE_ORGANIZATION_REF, SITE_WEBSITE_REF } from '@/shared/config/site-entity';
import { LOCALE_META } from '@/i18n/locales';
import { siteOgImagePath } from '@/shared/lib/public-pages/page-metadata';

import { guideCanonicalPath, type GuidePage } from '../model/guide-pages';

export interface GuideStructuredDataInput {
  locale: string;
  page: GuidePage;
  /** The chapter title in this locale. */
  headline: string;
  /** The chapter's meta description in this locale. */
  description: string;
  /** The guide's own name in this locale, the breadcrumb's first step. */
  guideName: string;
  /** Last commit to the body this locale reads (`lastCommitDate`). */
  dateModified?: string;
  /** First commit of the English chapter (`firstCommitDate`). */
  datePublished?: string;
}

/**
 * A guide chapter as a `TechArticle` with its breadcrumb. The url is the page canonical, so the
 * landing and chapter one describe one article; author and publisher join the site Organization
 * the root layout declares (`siteEntityGraph`) instead of restating it.
 */
export function guideStructuredData({
  locale,
  page,
  headline,
  description,
  guideName,
  dateModified,
  datePublished,
}: GuideStructuredDataInput) {
  const url = absoluteUrl(`/${locale}/${guideCanonicalPath(page)}/`);
  const guideUrl = absoluteUrl(`/${locale}/guide/`);
  const inLanguage = (LOCALE_META as Record<string, { htmlLang: string }>)[locale]?.htmlLang ?? locale;

  const article = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': `${url}#article`,
    headline,
    description,
    inLanguage,
    url,
    image: absoluteUrl(siteOgImagePath(locale)),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    isPartOf: SITE_WEBSITE_REF,
    author: SITE_ORGANIZATION_REF,
    publisher: SITE_ORGANIZATION_REF,
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: guideName, item: guideUrl },
      // The last step may omit its URL; chapter one's would repeat the guide's.
      { '@type': 'ListItem', position: 2, name: headline, ...(url === guideUrl ? {} : { item: url }) },
    ],
  };

  return { article, breadcrumb };
}
