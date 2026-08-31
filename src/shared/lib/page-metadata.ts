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
  /** Only when the page has its own OG image; otherwise it inherits the root layout's. */
  ogImage?: string;
}

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
      url: canonical,
      title,
      description,
      locale,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}
