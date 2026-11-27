import { createTranslator } from 'use-intl';

import type { AppLocale } from '@/i18n/locales';
import { SITE_URL } from '@/shared/config';
import { SITE_NAME } from '@/shared/config/site/site-entity';
import { buildPageMetadata } from '@/shared/lib/public-pages/page-metadata';
import { withBasePath } from '@/shared/lib/public-pages/base-path';

import type { PageMetadata } from './metadata-tags';

export interface MessageRef {
  namespace: string;
  key: string;
}

/**
 * What a route says about itself in `<head>`, declared once on the route (`staticData.head`) and read by
 * the screen's own title and by the prerender, so the two cannot drift.
 *
 * - `page`: an indexed public page with its own canonical address and language cluster.
 * - `card`: a screen of the installed app; a plain browser sees the app-only page, so it is `noindex` and
 *   names no canonical, yet keeps the page's social card.
 * - `title-only`: a redirect or a transient screen; it inherits the site's card and only names itself.
 */
export type ScreenHead =
  | { kind: 'page'; path: string; title: MessageRef; description: MessageRef; absoluteTitle?: boolean; contentLocales?: readonly string[] }
  | { kind: 'card'; path: string; title: MessageRef; description: MessageRef }
  | { kind: 'title-only'; title: MessageRef; description?: MessageRef; follow: boolean };

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    head?: ScreenHead;
    /** The values a route's own params take, for a route that is prerendered once per value and language. */
    prerenderParams?: () => Record<string, string>[];
  }
}

export type MessageTree = Record<string, unknown>;

/** Reads one message the way `useTranslations(namespace)(key)` does. */
export type ReadMessage = (namespace: string, key: string, values?: Record<string, string | number>) => string;

export function messageReader(locale: AppLocale, messages: MessageTree): ReadMessage {
  return (namespace, key, values) =>
    createTranslator({ locale, messages, namespace } as never)(key as never, values as never) as string;
}

const SITE_TAGLINE_FALLBACK =
  'Understand what your codebase builds, why it is structured that way, and what a change will affect.';

/** The site's defaults, which every page inherits and a page's own fields replace whole. */
export function siteMetadata(): PageMetadata {
  return {
    title: SITE_NAME,
    description: SITE_TAGLINE_FALLBACK,
    keywords: ['Ontology Atlas', 'ontology-atlas', 'codebase ontology', 'ontology', 'knowledge graph', 'markdown', 'frontmatter', 'AI agent', 'MCP', 'topology'],
    authors: [{ name: SITE_NAME, url: `${SITE_URL}/` }],
    manifest: withBasePath('/manifest.webmanifest'),
    verification: {
      ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } : {}),
      ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? { other: { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } } : {}),
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

/** The language's own words for the site name, tagline and search terms; a page title joins the name with ` · `. */
function localeMetadata(read: ReadMessage): { metadata: PageMetadata; siteName: string } {
  const siteName = read('metadata', 'siteName');
  return {
    siteName,
    metadata: {
      description: read('metadata', 'siteTagline'),
      keywords: read('metadata', 'keywords').split(/\s*[,，、]\s*/),
    },
  };
}

function screenOwnMetadata(head: ScreenHead, locale: AppLocale, read: ReadMessage): PageMetadata {
  const title = read(head.title.namespace, head.title.key);
  if (head.kind === 'title-only') {
    return {
      title,
      ...(head.description ? { description: read(head.description.namespace, head.description.key) } : {}),
      robots: { index: false, follow: head.follow },
    };
  }
  return buildPageMetadata({
    locale,
    path: head.path,
    title,
    description: read(head.description.namespace, head.description.key),
    ...(head.kind === 'card' ? { noindex: true } : { absoluteTitle: head.absoluteTitle, contentLocales: head.contentLocales }),
  });
}

/** A screen's `<head>` facts: the site's defaults, then its language's, then the screen's own. */
export function screenMetadata(head: ScreenHead, locale: AppLocale, read: ReadMessage): { metadata: PageMetadata; title: string } {
  return resolveMetadata(screenOwnMetadata(head, locale, read), read);
}

/** The merge Next performed and the site's addresses were indexed under: a field a page sets replaces the inherited one whole. */
export function resolveMetadata(own: PageMetadata, read: ReadMessage): { metadata: PageMetadata; title: string } {
  const { metadata: inLanguage, siteName } = localeMetadata(read);
  const merged: PageMetadata = { ...siteMetadata(), ...inLanguage, ...own };
  const ownTitle = own.title;
  const title =
    typeof ownTitle === 'string'
      ? `${ownTitle} · ${siteName}`
      : ownTitle && 'absolute' in ownTitle && ownTitle.absolute
        ? ownTitle.absolute
        : siteName;
  return { metadata: merged, title };
}
