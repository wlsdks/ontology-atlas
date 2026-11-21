import { describe, expect, it } from 'vitest';

import { SITE_URL } from '@/shared/config';
import { SITE_ORGANIZATION_ID, SITE_WEBSITE_ID } from '@/shared/config/site/site-entity';

import { GUIDE_ENTRY_PAGE, GUIDE_PAGES } from '../model/guide-pages';
import { guideStructuredData } from './guide-structured-data';

const relations = GUIDE_PAGES.find((page) => page.segment === 'relations')!;
const base = { headline: 'Relations', description: 'How relations work.', guideName: 'Guide' };

describe('guideStructuredData', () => {
  it('describes a chapter as a TechArticle at its canonical, joined to the site entities by id', () => {
    const { article } = guideStructuredData({
      ...base,
      locale: 'zh',
      page: relations,
      dateModified: '2026-11-19T10:00:00+09:00',
      datePublished: '2026-08-01T10:00:00+09:00',
    });
    expect(article).toMatchObject({
      '@type': 'TechArticle',
      headline: 'Relations',
      description: 'How relations work.',
      inLanguage: 'zh-Hans',
      url: `${SITE_URL}/zh/guide/relations/`,
      mainEntityOfPage: { '@id': `${SITE_URL}/zh/guide/relations/` },
      isPartOf: { '@id': SITE_WEBSITE_ID },
      author: { '@id': SITE_ORGANIZATION_ID },
      publisher: { '@id': SITE_ORGANIZATION_ID },
      dateModified: '2026-11-19T10:00:00+09:00',
      datePublished: '2026-08-01T10:00:00+09:00',
    });
  });

  it('omits a date Git could not answer instead of inventing one', () => {
    const { article } = guideStructuredData({ ...base, locale: 'en', page: relations });
    expect(article).not.toHaveProperty('dateModified');
    expect(article).not.toHaveProperty('datePublished');
  });

  it('breadcrumbs Guide then the chapter, without repeating the guide URL for chapter one', () => {
    const chapter = guideStructuredData({ ...base, locale: 'ko', page: relations }).breadcrumb.itemListElement;
    expect(chapter.map((step) => step.name)).toEqual(['Guide', 'Relations']);
    expect(chapter[0]).toMatchObject({ item: `${SITE_URL}/ko/guide/` });
    expect(chapter[1]).toMatchObject({ item: `${SITE_URL}/ko/guide/relations/` });

    const entry = guideStructuredData({ ...base, locale: 'ko', page: GUIDE_ENTRY_PAGE });
    expect(entry.article.url).toBe(`${SITE_URL}/ko/guide/`);
    expect(entry.breadcrumb.itemListElement[1]).not.toHaveProperty('item');
  });
});
