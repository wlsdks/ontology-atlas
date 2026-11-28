import { SITE_URL } from '@/shared/config';
import { LOCALE_META, type LocaleMeta } from '@/i18n/locales';
import { routing } from '@/i18n/routing';

interface MetadataImage {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

/** What a page says about itself in `<head>`: one field per tag the site writes, nothing the site never reads. */
export interface PageMetadata {
  title?: string | { absolute: string };
  description?: string;
  keywords?: string[];
  authors?: { name: string; url?: string }[];
  manifest?: string;
  robots?: { index: boolean; follow: boolean };
  alternates?: { canonical: string; languages?: Record<string, string> };
  verification?: { google?: string; other?: Record<string, string> };
  openGraph?: {
    type: 'website' | 'article';
    siteName: string;
    url: string;
    title: string;
    description: string;
    locale: string;
    alternateLocale?: string[];
    images?: MetadataImage[];
    publishedTime?: string;
    modifiedTime?: string;
  };
  twitter?: {
    card: 'summary_large_image';
    title: string;
    description: string;
    images?: string[];
  };
}

/** What `buildPageMetadata` returns: a page always carries its social card. */
export type BuiltPageMetadata = PageMetadata & Required<Pick<PageMetadata, 'openGraph' | 'twitter'>>;

/**
 * Each page states its own description, canonical and hreflang: a canvas body leaves nothing to
 * snippet, and duplicate paths compete. URLs are absolute from `SITE_URL` because `alternates` does
 * not prefix a deployment basePath, even with `metadataBase`.
 */
export interface PageMetadataInput {
  locale: string;
  path: string;
  title: string;
  description: string;
  /** Only when the page has its own OG image; otherwise the locale's site card is used. */
  ogImage?: string;
  absoluteTitle?: boolean;
  /**
   * A page whose exported HTML holds no content a search engine can use (the vault fills it in the
   * browser). It is `noindex, follow` and declares neither a canonical nor hreflang: a page outside
   * the sitemap must not claim to be a page of record (`scripts/web/check-seo-surface.mjs`).
   */
  noindex?: boolean;
  /**
   * The locales whose copy of this page has its own words, default locale first; omitted means all.
   * Another locale's copy canonicalizes to the default locale's and declares no hreflang, so search
   * engines see one page instead of translations of the same body under different titles.
   */
  contentLocales?: readonly string[];
}

/** The locale's site card (`pnpm og:build`), or the English one for a locale outside the routes. */
export function siteOgImagePath(locale: string, locales: readonly string[] = routing.locales): string {
  return locales.includes(locale) ? `/og/${locale}.png` : '/og-image.png';
}

/**
 * Every page carries its social card explicitly, because the site's page merge (`resolveMetadata`)
 * replaces a whole top-level `openGraph`/`twitter` key rather than merging inside it. A routed locale
 * gets its own card (`pnpm og:build`); anything else falls back to the English site card.
 */
function siteOgImage(locale: string, locales: readonly string[]) {
  const url = siteOgImagePath(locale, locales);
  return { url, width: 1200, height: 630, alt: 'Ontology Atlas' };
}

export interface PageMetadataLocales {
  locales: readonly string[];
  defaultLocale: string;
  meta: Readonly<Record<string, LocaleMeta>>;
}

const ROUTED_LOCALES: PageMetadataLocales = {
  locales: routing.locales,
  defaultLocale: routing.defaultLocale,
  meta: LOCALE_META,
};

function absolute(locale: string, path: string): string {
  const tail = path ? `/${path}` : '';
  return `${SITE_URL}/${locale}${tail}`;
}

/** Bing flags a meta description outside 25-160 characters; Google cuts the snippet near 160 too. */
export const META_DESCRIPTION_MAX = 160;

/** A description within `META_DESCRIPTION_MAX`, cut at the last word that fits, with an ellipsis. */
export function fitMetaDescription(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const characters = Array.from(flat);
  if (characters.length <= META_DESCRIPTION_MAX) return flat;
  const room = characters.slice(0, META_DESCRIPTION_MAX - 1).join('');
  const space = room.lastIndexOf(' ');
  return `${(space > META_DESCRIPTION_MAX / 2 ? room.slice(0, space) : room).replace(/[\s,;:.—\-，。、；：]+$/u, '')}…`;
}

export function buildPageMetadata(
  {
    locale,
    path,
    title,
    description,
    ogImage,
    absoluteTitle,
    noindex = false,
    contentLocales,
  }: PageMetadataInput,
  registry: PageMetadataLocales = ROUTED_LOCALES,
): BuiltPageMetadata {
  const summary = fitMetaDescription(description);
  const ownLocales = contentLocales ?? registry.locales;
  const hasOwnContent = ownLocales.includes(locale);
  const canonical = absolute(hasOwnContent ? locale : (ownLocales[0] ?? registry.defaultLocale), path);
  const ogLocaleOf = (l: string) => registry.meta[l]?.ogLocale ?? l;

  /* Plus `x-default`, or a search engine picks what a visitor matching no locale sees. */
  const languages: Record<string, string> = {
    'x-default': absolute(ownLocales.includes(registry.defaultLocale) ? registry.defaultLocale : ownLocales[0]!, path),
  };
  for (const l of ownLocales) languages[registry.meta[l]?.hreflang ?? l] = absolute(l, path);
  const siteImage = siteOgImage(locale, registry.locales);
  const declaresCluster = !noindex && hasOwnContent;
  const alternateLocales = declaresCluster ? ownLocales.filter((l) => l !== locale).map(ogLocaleOf) : [];

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description: summary,
    ...(noindex
      ? { robots: { index: false, follow: true } }
      : { alternates: declaresCluster ? { canonical, languages } : { canonical } }),
    openGraph: {
      type: 'website',
      siteName: 'Ontology Atlas',
      url: canonical,
      title,
      description: summary,
      locale: ogLocaleOf(locale),
      ...(alternateLocales.length > 0 ? { alternateLocale: alternateLocales } : {}),
      images: [ogImage ? { url: ogImage } : siteImage],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: summary,
      images: [ogImage ?? siteImage.url],
    },
  };
}
