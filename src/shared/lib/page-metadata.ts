import type { Metadata } from 'next';
import { SITE_URL } from '@/shared/config';
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
  /** Path after the locale prefix; empty for the root. e.g. `download`, `ontology/insights`. */
  path: string;
  title: string;
  description: string;
  /** Only when the page has its own OG image; otherwise the site OG image is used. */
  ogImage?: string;
  /**
   * Set when the page's directory carries an `opengraph-image.tsx` file
   * convention. Next injects that generated image itself, and a leaf `images`
   * value — including one arriving through an object spread — OVERRIDES it
   * (`resolve-metadata` treats an own `images` property as authoritative). So
   * the builder must omit the key entirely, not set it to anything
   * (2026-09-01 review: every project share carried the generic site card
   * while the page's own comment claimed the per-slug card would win).
   */
  hasFileConventionImage?: boolean;
}

/**
 * The site-wide social card. Every page must carry it EXPLICITLY: Next merges
 * metadata by replacing the whole top-level `openGraph`/`twitter` key, so the
 * root layout's images were dropped on every page that used this builder —
 * the live pages shipped `twitter:card=summary_large_image` with no image at
 * all (bug found 2026-09-01; the old comment claimed inheritance that never
 * happens).
 */
const SITE_OG_IMAGE = { url: '/og-image.png', width: 1200, height: 630, alt: 'Ontology Atlas' };

/** `og:locale` wants a full territory tag; bare `en`/`ko` is what the router uses. */
const OG_LOCALE: Record<string, string> = { en: 'en_US', ko: 'ko_KR' };

function absolute(locale: string, path: string): string {
  const tail = path ? `/${path}` : '';
  return `${SITE_URL}/${locale}${tail}`;
}

export function buildPageMetadata({
  locale,
  path,
  title,
  description,
  ogImage,
  hasFileConventionImage,
}: PageMetadataInput): Metadata {
  const canonical = absolute(locale, path);

  /**
   * Declare every locale to every other, plus `x-default`. Without the latter a
   * search engine decides for itself what to serve a visitor matching no locale (a
   * French-language browser, say) — and that choice would not be ours.
   */
  const languages: Record<string, string> = { 'x-default': absolute(routing.defaultLocale, path) };
  for (const l of routing.locales) languages[l] = absolute(l, path);

  return {
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      type: 'website',
      siteName: 'Ontology Atlas',
      url: canonical,
      title,
      description,
      locale: OG_LOCALE[locale] ?? locale,
      ...(hasFileConventionImage ? {} : { images: [ogImage ? { url: ogImage } : SITE_OG_IMAGE] }),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(hasFileConventionImage ? {} : { images: [ogImage ?? SITE_OG_IMAGE.url] }),
    },
  };
}
