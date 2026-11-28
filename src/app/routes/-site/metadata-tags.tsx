import { cloneElement, type ReactElement } from 'react';

import { absoluteUrl } from '@/shared/config';
import type { buildPageMetadata } from '@/shared/lib/public-pages/page-metadata';
import { withTrailingSlash } from '@/shared/lib/public-pages/trailing-slash';

export type PageMetadata = ReturnType<typeof buildPageMetadata>;

type Entry = readonly [key: string, element: ReactElement];

/** A path of this site becomes its absolute address; an address that already names a site stays as written. */
const absolute = (url: string | URL) => {
  const text = String(url);
  return text.startsWith('/') ? absoluteUrl(text) : text;
};

/** An address with the site's trailing-slash rule applied to its path. */
const addressWithSlash = (url: string | URL) => {
  const { origin, pathname, search, hash } = new URL(String(url));
  return `${origin}${withTrailingSlash(pathname)}${search}${hash}`;
};

/** The address a metadata link names, whether written as text, a URL or a descriptor. */
const hrefOf = (value: unknown): string | undefined => {
  if (typeof value === 'string' || value instanceof URL) return addressWithSlash(value);
  if (Array.isArray(value)) return hrefOf(value[0]);
  if (value && typeof value === 'object' && 'url' in value) return hrefOf(value.url);
  return undefined;
};

const joined = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return value.join(',');
  return typeof value === 'string' ? value : undefined;
};

function robotsContent(robots: PageMetadata['robots']): string | undefined {
  if (!robots) return undefined;
  if (typeof robots === 'string') return robots;
  return `${robots.index === false ? 'noindex' : 'index'}, ${robots.follow === false ? 'nofollow' : 'follow'}`;
}

function titleText(title: PageMetadata['title']): string | undefined {
  if (!title) return undefined;
  if (typeof title === 'string') return title;
  if ('absolute' in title && title.absolute) return title.absolute;
  if ('default' in title && title.default) return title.default;
  return undefined;
}

function imageEntries(prefix: 'og' | 'twitter', images: unknown): Entry[] {
  const list = Array.isArray(images) ? images : images ? [images] : [];
  return list.flatMap((image, index): Entry[] => {
    const source = typeof image === 'string' || image instanceof URL ? { url: image } : (image as Record<string, unknown>);
    const field = prefix === 'og' ? 'property' : 'name';
    const name = prefix === 'og' ? 'og:image' : 'twitter:image';
    const entries: Entry[] = [[`${name}-${index}`, <meta key={`${name}-${index}`} {...{ [field]: name }} content={absolute(source.url as string)} />]];
    for (const detail of ['width', 'height', 'alt'] as const) {
      if (prefix === 'og' && source[detail] !== undefined) {
        const key = `${name}:${detail}-${index}`;
        entries.push([key, <meta key={key} property={`${name}:${detail}`} content={String(source[detail])} />]);
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
  meta('description', typeof metadata.description === 'string' ? metadata.description : undefined);
  for (const author of Array.isArray(metadata.authors) ? metadata.authors : metadata.authors ? [metadata.authors] : []) {
    if (author.url) add(`author-link:${author.url}`, <link rel="author" href={String(author.url)} />);
    meta('author', author.name);
  }
  if (typeof metadata.manifest === 'string') add('manifest', <link rel="manifest" href={metadata.manifest} />);
  meta('keywords', joined(metadata.keywords));
  meta('robots', robotsContent(metadata.robots));

  const alternates = metadata.alternates;
  const canonical = hrefOf(alternates?.canonical);
  if (canonical) add('canonical', <link rel="canonical" href={canonical} />);
  for (const [language, url] of Object.entries(alternates?.languages ?? {})) {
    const href = hrefOf(url);
    if (href) add(`alternate:${language}`, <link rel="alternate" hrefLang={language} href={href} />);
  }

  meta('google-site-verification', typeof metadata.verification?.google === 'string' ? metadata.verification.google : undefined);
  for (const [name, content] of Object.entries(metadata.verification?.other ?? {})) meta(name, joined(content));

  const og = metadata.openGraph as Record<string, unknown> | null | undefined;
  if (og) {
    meta('og:title', typeof og.title === 'string' ? og.title : undefined, 'property');
    meta('og:description', typeof og.description === 'string' ? og.description : undefined, 'property');
    meta('og:url', og.url === undefined ? undefined : addressWithSlash(og.url as string), 'property');
    meta('og:site_name', typeof og.siteName === 'string' ? og.siteName : undefined, 'property');
    meta('og:locale', typeof og.locale === 'string' ? og.locale : undefined, 'property');
    entries.push(...imageEntries('og', og.images));
    for (const locale of (og.alternateLocale as string[] | undefined) ?? []) {
      add(`og:locale:alternate:${locale}`, <meta property="og:locale:alternate" content={locale} />);
    }
    meta('og:type', typeof og.type === 'string' ? og.type : undefined, 'property');
    meta('article:published_time', typeof og.publishedTime === 'string' ? og.publishedTime : undefined, 'property');
    meta('article:modified_time', typeof og.modifiedTime === 'string' ? og.modifiedTime : undefined, 'property');
  }

  const twitter = metadata.twitter as Record<string, unknown> | null | undefined;
  if (twitter) {
    meta('twitter:card', typeof twitter.card === 'string' ? twitter.card : undefined);
    meta('twitter:title', typeof twitter.title === 'string' ? twitter.title : undefined);
    meta('twitter:description', typeof twitter.description === 'string' ? twitter.description : undefined);
    entries.push(...imageEntries('twitter', twitter.images));
  }

  return entries.map(([key, element]) => cloneElement(element, { key }));
}

/** Renders a screen head; React hoists the elements into `<head>` on the server and the client alike. */
export function MetadataTags({ resolved }: { resolved: { metadata: PageMetadata; title: string } }) {
  return <>{metadataTags(resolved.metadata, resolved.title)}</>;
}
