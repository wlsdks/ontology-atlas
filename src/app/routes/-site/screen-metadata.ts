import { createTranslator } from 'use-intl';

import type { AppLocale } from '@/i18n/locales';
import { documentTitle } from '@/shared/lib/public-pages/document-title';
import { buildPageMetadata, type PageMetadata } from '@/shared/lib/public-pages/page-metadata';
import { localeWords, siteMetadata } from '@/shared/lib/public-pages/site-metadata';


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

/** The language's own words for the site name, tagline and search terms; a page title joins the name with ` · `. */
function localeMetadata(read: ReadMessage): { metadata: PageMetadata; siteName: string } {
  const { siteName, description, keywords } = localeWords((word) => read('metadata', word));
  return { siteName, metadata: { description, keywords } };
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

/** The merge the site's addresses were indexed under: a field a page sets replaces the inherited one whole. */
export function resolveMetadata(own: PageMetadata, read: ReadMessage): { metadata: PageMetadata; title: string } {
  const { metadata: inLanguage, siteName } = localeMetadata(read);
  const merged: PageMetadata = { ...siteMetadata(), ...inLanguage, ...own };
  const ownTitle = own.title;
  const title =
    typeof ownTitle === 'string'
      ? documentTitle(ownTitle, siteName)
      : ownTitle && 'absolute' in ownTitle && ownTitle.absolute
        ? ownTitle.absolute
        : siteName;
  return { metadata: merged, title };
}
