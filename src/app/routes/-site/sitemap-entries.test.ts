import { describe, expect, it, vi } from 'vitest';

import { routing } from '@/i18n/routing';
import { SITE_URL } from '@/shared/config';
import { CHANGELOG_CONTENT_LOCALES, GUIDE_ENTRY_PAGE, GUIDE_PAGES } from '@/views/gateway-doc';

import { sitemapEntries } from '../../../../scripts/web/site/sitemap';

const FOUR = vi.hoisted(() => ({ active: false }));

vi.mock('@/i18n/routing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/i18n/routing')>();
  return {
    ...actual,
    routing: new Proxy(actual.routing, {
      get: (target, key) =>
        key === 'locales' && FOUR.active
          ? ['en', 'ko', 'ja', 'zh']
          : Reflect.get(target, key),
    }),
  };
});

vi.mock('@/i18n/locales', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/i18n/locales')>();
  return {
    ...actual,
    LOCALE_META: {
      ...actual.LOCALE_META,
      ja: { htmlLang: 'ja', hreflang: 'ja', ogLocale: 'ja_JP', intlTag: 'ja-JP', script: 'han-kana' },
      zh: {
        htmlLang: 'zh-Hans',
        hreflang: 'zh-Hans',
        ogLocale: 'zh_CN',
        intlTag: 'zh-CN',
        script: 'han-kana',
      },
    },
  };
});

const PUBLIC_STATIC_PATHS = [
  'download',
  'sample',
  'guide',
  ...GUIDE_PAGES.filter((page) => page.segment !== GUIDE_ENTRY_PAGE.segment).map(
    (page) => `guide/${page.segment}`,
  ),
] as const;

describe('public sitemap', () => {
  it('lists every canonical public page and no compatibility or duplicate guide address', () => {
    const entries = sitemapEntries();
    const actual = entries.map((entry) => entry.url).sort();
    const expected = routing.locales
      .flatMap((locale) => [
        ...PUBLIC_STATIC_PATHS.map(
          (path) => `${SITE_URL}/${locale}/${path ? `${path}/` : ''}`,
        ),
        ...(CHANGELOG_CONTENT_LOCALES.includes(locale) ? [`${SITE_URL}/${locale}/changelog/`] : []),
      ])
      .sort();

    expect(actual).toEqual(expected);
    for (const locale of routing.locales) {
      expect(actual).not.toContain(
        `${SITE_URL}/${locale}/guide/${GUIDE_ENTRY_PAGE.segment}/`,
      );
      expect(actual).not.toContain(`${SITE_URL}/${locale}/ontology/studio/`);
      expect(actual).not.toContain(`${SITE_URL}/${locale}/ontology/edit/`);
    }
  });

  it('lists the sample map and no address that is a screen of the installed app', () => {
    const urls = (sitemapEntries()).map((entry) => entry.url);
    expect(urls).toContain(`${SITE_URL}/en/sample/`);
    expect(urls.filter((url) => /\/(topology|project|projects|library|agents)\//.test(url))).toEqual([]);
  });

  it('dates a static page by the last commit to its words, never by the build', () => {
    const before = Date.now();
    const entries = sitemapEntries();
    const staticEntries = entries;

    expect(staticEntries.length).toBeGreaterThan(0);
    const dates = new Set<string>();
    for (const entry of staticEntries) {
      if (entry.lastModified === undefined) continue;
      const at = new Date(entry.lastModified).getTime();
      expect(Number.isNaN(at)).toBe(false);
      expect(at).toBeLessThanOrEqual(before);
      dates.add(String(entry.lastModified));
    }
    // Pages with different sources do not all change in one commit.
    expect(dates.size).not.toBe(1);
  });

  it('lists one changelog, in its content locale, paired only with x-default', () => {
    const changelogs = (sitemapEntries()).filter((entry) => entry.url.endsWith('/changelog/'));
    expect(changelogs.map((entry) => entry.url)).toEqual([`${SITE_URL}/en/changelog/`]);
    expect(changelogs[0]?.alternates.languages).toEqual({
      en: `${SITE_URL}/en/changelog/`,
      'x-default': `${SITE_URL}/en/changelog/`,
    });
  });

  it('keeps each translated canonical paired with its English, Korean, and x-default URLs', () => {
    const entries = (sitemapEntries()).filter((entry) => !entry.url.endsWith('/changelog/'));

    for (const entry of entries) {
      const languages = entry.alternates.languages;
      expect(languages?.en).toMatch(/^https:\/\/ontologyatlas\.com\/en\//);
      expect(languages?.ko).toMatch(/^https:\/\/ontologyatlas\.com\/ko\//);
      expect(languages?.['x-default']).toBe(languages?.[routing.defaultLocale]);
    }
  });

  it('with four locales every translated entry lists all four plus x-default and is reciprocal', () => {
    FOUR.active = true;
    try {
      const entries = (sitemapEntries()).filter((entry) => !entry.url.endsWith('/changelog/'));
      const byUrl = new Map(entries.map((entry) => [entry.url, entry]));
      const hreflangs = ['en', 'ko', 'ja', 'zh-Hans'];
      for (const entry of entries) {
        const languages = entry.alternates.languages ?? {};
        expect(Object.keys(languages).sort()).toEqual([...hreflangs, 'x-default'].sort());
        expect(Object.values(languages)).toContain(entry.url);
        for (const target of Object.values(languages)) {
          const sibling = byUrl.get(target as string);
          expect(sibling, `${target} is in the sitemap`).toBeDefined();
          expect(sibling?.alternates.languages).toEqual(languages);
        }
      }
    } finally {
      FOUR.active = false;
    }
  });
});
