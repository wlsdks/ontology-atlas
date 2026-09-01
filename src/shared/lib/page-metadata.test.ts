import { describe, expect, it } from 'vitest';
import { buildPageMetadata } from './page-metadata';

// Bug found 2026-09-01: Next merges metadata by replacing the whole top-level
// openGraph/twitter key, so pages built here shipped
// `twitter:card=summary_large_image` with NO image and no og:site_name — the
// old comment claimed root-layout inheritance that never happens. Every card
// fact a page needs must be explicit in what this builder returns.
describe('buildPageMetadata', () => {
  const base = {
    locale: 'en',
    path: 'download',
    title: 'Download',
    description: 'Get the app.',
  };

  it('always carries the site OG image and site name, even without a page image', () => {
    const meta = buildPageMetadata(base);
    const og = meta.openGraph as { images: unknown[]; siteName?: string };
    expect(og.images).toEqual([
      { url: '/og-image.png', width: 1200, height: 630, alt: 'Ontology Atlas' },
    ]);
    expect(og.siteName).toBe('Ontology Atlas');
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
    expect(Object.keys(alternates.languages).sort()).toEqual(['en', 'ko', 'x-default']);
  });
});
