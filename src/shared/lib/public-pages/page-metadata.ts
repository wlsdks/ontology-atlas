import type { Metadata } from 'next';
import { SITE_URL } from '@/shared/config';
import { LOCALE_META, type LocaleMeta } from '@/i18n/locales';
import { routing } from '@/i18n/routing';

/**
 * Per-page metadata — the layer search engines use to **find and choose** this site.
 *
 * **Why it was needed.** The root layout already had what it needs (`metadataBase`,
 * OG, Twitter, `WebSite` JSON-LD, an hreflang sitemap, robots), but **most individual
 * pages carried only a `title`**, and three things break without more:
 *
 * - **No description** → Google scrapes the snippet out of the body. Most of this
 *   site's body is canvas pixels with almost no prose to scrape, so the snippet ends
 *   up empty or made of UI label fragments.
 * - **No canonical** → several paths to the same document (`/ko/download` and
 *   `/ko/download/`) compete with each other.
 * - **No hreflang** → it is in the sitemap but not in the document, leaving the page
 *   itself with no basis for which of ko/en to serve to whom.
 *
 * **Absolute URLs are required.** Even with `metadataBase`, `alternates` does not
 * auto-prefix an optional deployment basePath — a trap this repo already pinned
 * in the `app/layout.tsx` comments. Hence assembling from `SITE_URL` here.
 */
export interface PageMetadataInput {
  locale: string;
  /** Path after the locale prefix; empty for the root. e.g. `download`, `guide/cli`. */
  path: string;
  title: string;
  description: string;
  /** Only when the page has its own OG image; otherwise the locale's site card is used. */
  ogImage?: string;
  /**
   * Set when the page directory has an `opengraph-image.tsx`. A leaf `images` value, even via
   * spread, overrides it, so the builder must omit the key entirely.
   */
  hasFileConventionImage?: boolean;
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

/**
 * Every page must carry the social card explicitly: Next replaces the whole top-level
 * `openGraph`/`twitter` key when merging, so root layout images are dropped. A routed locale
 * gets its own card (`pnpm og:build`); anything else falls back to the English site card.
 */
function siteOgImage(locale: string, locales: readonly string[]) {
  const url = locales.includes(locale) ? `/og/${locale}.png` : '/og-image.png';
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
    hasFileConventionImage,
    absoluteTitle,
    noindex = false,
    contentLocales,
  }: PageMetadataInput,
  registry: PageMetadataLocales = ROUTED_LOCALES,
): Metadata {
  const summary = fitMetaDescription(description);
  const ownLocales = contentLocales ?? registry.locales;
  const hasOwnContent = ownLocales.includes(locale);
  const canonical = absolute(hasOwnContent ? locale : (ownLocales[0] ?? registry.defaultLocale), path);
  const ogLocaleOf = (l: string) => registry.meta[l]?.ogLocale ?? l;

  /**
   * Declare every locale to every other, plus `x-default`. Without the latter a
   * search engine decides for itself what to serve a visitor matching no locale (a
   * French-language browser, say) — and that choice would not be ours.
   */
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
      ...(hasFileConventionImage ? {} : { images: [ogImage ? { url: ogImage } : siteImage] }),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: summary,
      ...(hasFileConventionImage ? {} : { images: [ogImage ?? siteImage.url] }),
    },
  };
}
