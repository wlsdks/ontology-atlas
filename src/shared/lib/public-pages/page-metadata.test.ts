import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { routing } from '@/i18n/routing';
import { buildPageMetadata, fitMetaDescription, META_DESCRIPTION_MAX, type PageMetadataLocales } from './page-metadata';

// The page merge replaces the whole top-level openGraph/twitter key, so every card
// fact must be explicit in what the builder returns.
describe('buildPageMetadata', () => {
  const base = {
    locale: 'en',
    path: 'download',
    title: 'Download',
    description: 'Get the app.',
  };

  it.each(['en', 'ko', 'ja', 'zh'])(
    'always carries the %s site card and site name, even without a page image',
    (locale) => {
      const meta = buildPageMetadata({ ...base, locale });
      const og = meta.openGraph as { images: unknown[]; siteName?: string };
      expect(og.images).toEqual([
        { url: `/og/${locale}.png`, width: 1200, height: 630, alt: 'Ontology Atlas' },
      ]);
      expect(og.siteName).toBe('Ontology Atlas');
      expect((meta.twitter as { images: string[] }).images).toEqual([`/og/${locale}.png`]);
    },
  );

  it.each([...routing.locales])('ships the %s card the metadata points at', (locale) => {
    expect(existsSync(path.join(process.cwd(), 'public', 'og', `${locale}.png`))).toBe(true);
  });

  it('falls back to the English site card for a locale outside the registry', () => {
    const meta = buildPageMetadata({ ...base, locale: 'fr' });
    expect((meta.openGraph as { images: { url: string }[] }).images[0].url).toBe('/og-image.png');
    expect((meta.twitter as { images: string[] }).images).toEqual(['/og-image.png']);
  });

  it('a page-specific OG image wins on both card families', () => {
    const meta = buildPageMetadata({ ...base, ogImage: '/download-og.png' });
    expect((meta.openGraph as { images: unknown[] }).images).toEqual([
      { url: '/download-og.png' },
    ]);
    expect((meta.twitter as { images: string[] }).images).toEqual(['/download-og.png']);
  });

  it('maps the router locale to a full og:locale territory tag', () => {
    expect((buildPageMetadata(base).openGraph as { locale: string }).locale).toBe('en_US');
    expect(
      (buildPageMetadata({ ...base, locale: 'ko' }).openGraph as { locale: string }).locale,
    ).toBe('ko_KR');
  });

  it('keeps the canonical and the full hreflang set intact', () => {
    const meta = buildPageMetadata(base);
    const alternates = meta.alternates as {
      canonical: string;
      languages: Record<string, string>;
    };
    expect(alternates.canonical).toMatch(/\/en\/download$/);
    expect(Object.keys(alternates.languages).sort()).toEqual([
      'en',
      'ja',
      'ko',
      'x-default',
      'zh-Hans',
    ]);
  });
});

describe('buildPageMetadata — a four-locale registry', () => {
  const registry: PageMetadataLocales = {
    locales: ['en', 'ko', 'ja', 'zh'],
    defaultLocale: 'en',
    meta: {
      en: { htmlLang: 'en', hreflang: 'en', ogLocale: 'en_US', intlTag: 'en-US', script: 'latin' },
      ko: { htmlLang: 'ko', hreflang: 'ko', ogLocale: 'ko_KR', intlTag: 'ko-KR', script: 'hangul' },
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

  it.each(['en', 'ko', 'ja', 'zh'])('lists all four plus x-default on %s, canonical is its own', (locale) => {
    const meta = buildPageMetadata(
      { locale, path: 'download', title: 'T', description: 'D' },
      registry,
    );
    const alternates = meta.alternates as { canonical: string; languages: Record<string, string> };
    expect(alternates.canonical).toMatch(new RegExp(`/${locale}/download$`));
    expect(alternates.languages).toEqual({
      'x-default': expect.stringMatching(/\/en\/download$/),
      en: expect.stringMatching(/\/en\/download$/),
      ko: expect.stringMatching(/\/ko\/download$/),
      ja: expect.stringMatching(/\/ja\/download$/),
      'zh-Hans': expect.stringMatching(/\/zh\/download$/),
    });
  });

  it('takes og:locale from the registry', () => {
    const og = (locale: string) =>
      (buildPageMetadata({ locale, path: '', title: 'T', description: 'D' }, registry)
        .openGraph as { locale: string }).locale;
    expect(og('ja')).toBe('ja_JP');
    expect(og('zh')).toBe('zh_CN');
  });
});

describe('buildPageMetadata — index signals', () => {
  const base = { path: 'agents', title: 'T', description: 'D' };
  type Signals = {
    robots?: { index: boolean; follow: boolean };
    alternates?: { canonical: string; languages?: Record<string, string> };
    openGraph: { locale: string; alternateLocale?: string[] };
  };
  const signals = (input: Parameters<typeof buildPageMetadata>[0]) => buildPageMetadata(input) as unknown as Signals;

  it('marks a noindex page noindex-follow and declares no canonical, hreflang or alternate og:locale', () => {
    const meta = signals({ ...base, locale: 'ko', noindex: true });
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates).toBeUndefined();
    expect(meta.openGraph.alternateLocale).toBeUndefined();
    expect(meta.openGraph.locale).toBe('ko_KR');
  });

  it('names every other routed locale as an alternate og:locale on an indexable page', () => {
    const meta = signals({ ...base, locale: 'ja' });
    expect(meta.robots).toBeUndefined();
    expect(meta.openGraph.alternateLocale?.sort()).toEqual(['en_US', 'ko_KR', 'zh_CN']);
  });

  it('points a locale without its own words at the content locale and declares no cluster', () => {
    const meta = signals({ ...base, path: 'changelog', locale: 'zh', contentLocales: ['en'] });
    expect(meta.alternates).toEqual({ canonical: expect.stringMatching(/\/en\/changelog$/) });
    expect(meta.openGraph.alternateLocale).toBeUndefined();
  });

  it('keeps only the content locales and x-default in the content locale cluster', () => {
    const meta = signals({ ...base, path: 'changelog', locale: 'en', contentLocales: ['en'] });
    expect(meta.alternates?.canonical).toMatch(/\/en\/changelog$/);
    expect(Object.keys(meta.alternates?.languages ?? {}).sort()).toEqual(['en', 'x-default']);
    expect(meta.openGraph.alternateLocale).toBeUndefined();
  });
});

describe('fitMetaDescription', () => {
  it('keeps a description that fits and cuts a long one at a word, inside the limit', () => {
    expect(fitMetaDescription('A short, complete description of the page.')).toBe('A short, complete description of the page.');
    const long = 'word '.repeat(60);
    const fitted = fitMetaDescription(long);
    expect(fitted.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
    expect(fitted).toMatch(/word…$/);
  });

  it('cuts text without spaces by whole characters, never inside one', () => {
    const fitted = fitMetaDescription('😀'.repeat(200));
    expect(Array.from(fitted)).toHaveLength(META_DESCRIPTION_MAX);
    expect(fitted.endsWith('😀…')).toBe(true);
  });

  it.each(['en', 'ko', 'ja', 'zh'])('finds every %s page description and the site default within 25-160 characters', async (locale) => {
    const { default: metadata } = await import(`../../../../messages/${locale}/metadata.json`);
    const all = [metadata.siteTagline, ...Object.values(metadata.descriptions), ...Object.values(metadata.guideDescriptions)] as string[];
    for (const text of all) {
      expect(text.length, text).toBeGreaterThanOrEqual(25);
      expect(text.length, text).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
    }
  });
});
