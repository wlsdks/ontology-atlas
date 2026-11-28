import { SITE_URL } from '@/shared/config';
import { SITE_NAME } from '@/shared/config/site/site-entity';

import { withBasePath } from './base-path';
import type { PageMetadata } from './page-metadata';

const SITE_TAGLINE_FALLBACK =
  'Understand what your codebase builds, why it is structured that way, and what a change will affect.';

/**
 * The site's defaults, which every page inherits and a page's own fields replace whole. The root layout and the
 * website's prerender both start from this one list, so a field is stated once.
 */
export function siteMetadata(): PageMetadata {
  return {
    title: SITE_NAME,
    description: SITE_TAGLINE_FALLBACK,
    keywords: ['Ontology Atlas', 'ontology-atlas', 'codebase ontology', 'ontology', 'knowledge graph', 'markdown', 'frontmatter', 'AI agent', 'MCP', 'topology'],
    authors: [{ name: SITE_NAME, url: `${SITE_URL}/` }],
    // Metadata fields are not auto-prefixed by an optional base path.
    manifest: withBasePath('/manifest.webmanifest'),
    // Not hardcoded: a fork shipping this site's verification code would block its own Console registration.
    // Unset, the tag is not emitted.
    verification: {
      ...(process.env.ATLAS_PUBLIC_GOOGLE_SITE_VERIFICATION ? { google: process.env.ATLAS_PUBLIC_GOOGLE_SITE_VERIFICATION } : {}),
      ...(process.env.ATLAS_PUBLIC_BING_SITE_VERIFICATION ? { other: { 'msvalidate.01': process.env.ATLAS_PUBLIC_BING_SITE_VERIFICATION } } : {}),
    },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: SITE_URL,
      siteName: SITE_NAME,
      title: SITE_NAME,
      description: SITE_TAGLINE_FALLBACK,
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
      card: 'summary_large_image',
      title: SITE_NAME,
      description: SITE_TAGLINE_FALLBACK,
      images: ['/og-image.png'],
    },
    robots: { index: true, follow: true },
  };
}

export type LocaleWord = 'siteName' | 'siteTagline' | 'keywords';

/** The language's own words for the site name, tagline and search terms (Bing, Naver and Baidu read the terms). */
export function localeWords(read: (word: LocaleWord) => string): { siteName: string; description: string; keywords: string[] } {
  return {
    siteName: read('siteName'),
    description: read('siteTagline'),
    keywords: read('keywords').split(/\s*[,，、]\s*/),
  };
}
