import { cloneElement, type ReactElement } from 'react';

import { absoluteUrl } from '@/shared/config';
import type { PageMetadata } from '@/shared/lib/public-pages/page-metadata';
import { withTrailingSlash } from '@/shared/lib/public-pages/trailing-slash';

type Entry = readonly [key: string, element: ReactElement];
type OpenGraph = NonNullable<PageMetadata['openGraph']>;
type Twitter = NonNullable<PageMetadata['twitter']>;

/** A path of this site becomes its absolute address; an address that already names a site stays as written. */
const absolute = (url: string) => (url.startsWith('/') ? absoluteUrl(url) : url);

/** An address with the site's trailing-slash rule applied to its path. */
const addressWithSlash = (url: string) => {
  const { origin, pathname, search, hash } = new URL(url);
  return `${origin}${withTrailingSlash(pathname)}${search}${hash}`;
};

function robotsContent(robots: NonNullable<PageMetadata['robots']>): string {
  return `${robots.index ? 'index' : 'noindex'}, ${robots.follow ? 'follow' : 'nofollow'}`;
}

function titleText(title: PageMetadata['title']): string | undefined {
  if (typeof title === 'string') return title;
  return title !== undefined && 'absolute' in title ? title.absolute : undefined;
}

function imageEntries(prefix: 'og', images: OpenGraph['images']): Entry[];
function imageEntries(prefix: 'twitter', images: Twitter['images']): Entry[];
function imageEntries(prefix: 'og' | 'twitter', images: OpenGraph['images'] | Twitter['images']): Entry[] {
  return (images ?? []).flatMap((image, index): Entry[] => {
    const source = typeof image === 'string' ? { url: image } : image;
    const field = prefix === 'og' ? 'property' : 'name';
    const name = prefix === 'og' ? 'og:image' : 'twitter:image';
    const entries: Entry[] = [[`${name}-${index}`, <meta key={`${name}-${index}`} {...{ [field]: name }} content={absolute(source.url)} />]];
    if (prefix === 'og' && 'width' in source) {
      for (const detail of ['width', 'height', 'alt'] as const) {
        const value = source[detail];
        if (value === undefined) continue;
        const key = `${name}:${detail}-${index}`;
        entries.push([key, <meta key={key} property={`${name}:${detail}`} content={String(value)} />]);
      }
    }
    return entries;
  });
}

/**
 * A page's resolved metadata as the `<title>`, `<meta>` and `<link>` elements React 19 hoists into
 * `<head>`, in the order and spelling a search engine already knows from the site: one rule per
 * field, so a page states each fact once and a prerendered page and its hydration say the same.
 */
export function metadataTags(metadata: PageMetadata, resolvedTitle?: string): ReactElement[] {
  const entries: Entry[] = [];
  const add = (key: string, element: ReactElement) => entries.push([key, element]);
  const meta = (name: string, content: string | undefined, attribute: 'name' | 'property' = 'name') => {
    if (content !== undefined) add(`${attribute}:${name}`, <meta {...{ [attribute]: name }} content={content} />);
  };

  const title = resolvedTitle ?? titleText(metadata.title);
  if (title) add('title', <title>{title}</title>);
  meta('description', metadata.description);
  for (const author of metadata.authors ?? []) {
    if (author.url) add(`author-link:${author.url}`, <link rel="author" href={author.url} />);
    meta('author', author.name);
  }
  if (metadata.manifest !== undefined) add('manifest', <link rel="manifest" href={metadata.manifest} />);
  meta('keywords', metadata.keywords?.join(','));
  meta('robots', metadata.robots && robotsContent(metadata.robots));

  const alternates = metadata.alternates;
  if (alternates) add('canonical', <link rel="canonical" href={addressWithSlash(alternates.canonical)} />);
  for (const [language, url] of Object.entries(alternates?.languages ?? {})) {
    add(`alternate:${language}`, <link rel="alternate" hrefLang={language} href={addressWithSlash(url)} />);
  }

  meta('google-site-verification', metadata.verification?.google);
  for (const [name, content] of Object.entries(metadata.verification?.other ?? {})) meta(name, content);

  const og = metadata.openGraph;
  if (og) {
    meta('og:title', og.title, 'property');
    meta('og:description', og.description, 'property');
    meta('og:url', addressWithSlash(og.url), 'property');
    meta('og:site_name', og.siteName, 'property');
    meta('og:locale', og.locale, 'property');
    entries.push(...imageEntries('og', og.images));
    for (const locale of og.alternateLocale ?? []) {
      add(`og:locale:alternate:${locale}`, <meta property="og:locale:alternate" content={locale} />);
    }
    meta('og:type', og.type, 'property');
    meta('article:published_time', og.publishedTime, 'property');
    meta('article:modified_time', og.modifiedTime, 'property');
  }

  const twitter = metadata.twitter;
  if (twitter) {
    meta('twitter:card', twitter.card);
    meta('twitter:title', twitter.title);
    meta('twitter:description', twitter.description);
    entries.push(...imageEntries('twitter', twitter.images));
  }

  return entries.map(([key, element]) => cloneElement(element, { key }));
}

/** Renders a screen head; React hoists the elements into `<head>` on the server and the client alike. */
export function MetadataTags({ resolved }: { resolved: { metadata: PageMetadata; title: string } }) {
  return <>{metadataTags(resolved.metadata, resolved.title)}</>;
}
