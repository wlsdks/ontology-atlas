import { describe, expect, it, vi } from 'vitest';

import { deriveBundledProjects } from '@/entities/docs-vault';
import { routing } from '@/i18n/routing';
import { SITE_URL } from '@/shared/config';
import { GUIDE_ENTRY_PAGE, GUIDE_PAGES } from '@/views/gateway-doc';

import sitemap from './sitemap';

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
  'projects',
  'download',
  'topology',
  'library',
  'ontology/insights',
  'guide',
  'changelog',
  ...GUIDE_PAGES.filter((page) => page.segment !== GUIDE_ENTRY_PAGE.segment).map(
    (page) => `guide/${page.segment}`,
  ),
] as const;

describe('public sitemap', () => {
  it('lists every canonical public page and no compatibility or duplicate guide address', async () => {
    const entries = await sitemap();
    const actual = entries.map((entry) => entry.url).sort();
    const expected = routing.locales
      .flatMap((locale) => [
        ...PUBLIC_STATIC_PATHS.map(
          (path) => `${SITE_URL}/${locale}/${path ? `${path}/` : ''}`,
        ),
        ...deriveBundledProjects().map(
          (project) => `${SITE_URL}/${locale}/project/${project.slug}/`,
        ),
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

  it('does not claim every static page changed at build time', async () => {
    const entries = await sitemap();
    const staticEntries = entries.filter((entry) => !entry.url.includes('/project/'));

    expect(staticEntries.length).toBeGreaterThan(0);
    for (const entry of staticEntries) expect(entry.lastModified).toBeUndefined();
  });

  it('keeps each canonical paired with its English, Korean, and x-default URLs', async () => {
    const entries = await sitemap();

    for (const entry of entries) {
      const languages = entry.alternates?.languages;
      expect(languages?.en).toMatch(/^https:\/\/ontologyatlas\.com\/en\//);
      expect(languages?.ko).toMatch(/^https:\/\/ontologyatlas\.com\/ko\//);
      expect(languages?.['x-default']).toBe(languages?.[routing.defaultLocale]);
    }
  });

  it('with four locales every entry lists all four plus x-default and is reciprocal', async () => {
    FOUR.active = true;
    try {
      const entries = await sitemap();
      const byUrl = new Map(entries.map((entry) => [entry.url, entry]));
      const hreflangs = ['en', 'ko', 'ja', 'zh-Hans'];
      for (const entry of entries) {
        const languages = entry.alternates?.languages ?? {};
        expect(Object.keys(languages).sort()).toEqual([...hreflangs, 'x-default'].sort());
        expect(Object.values(languages)).toContain(entry.url);
        for (const target of Object.values(languages)) {
          const sibling = byUrl.get(target as string);
          expect(sibling, `${target} is in the sitemap`).toBeDefined();
          expect(sibling?.alternates?.languages).toEqual(languages);
        }
      }
    } finally {
      FOUR.active = false;
    }
  });
});
