import { SITE_URL } from '@/shared/config';
import { RELEASE_MIN_MACOS, RELEASE_MIN_WINDOWS } from './release-facts';
import { MACOS_RELEASE, windowsAsset } from './release-state';

/**
 * `SoftwareApplication` structured data — the only schema that can earn this app download page a
 * **rich result** in search (price, operating system, category, version). The root layout's
 * `WebSite` schema describes the site rather than the app, so this page needs its own.
 *
 * ⚠️ **Version, download URL, and size are emitted only once a release is published.**
 *
 * Structured data demands **stricter** honesty than the screen — a falsehood on screen is seen by a
 * person and laughed off, while a falsehood here is indexed by a search engine and stays without our
 * knowing (and Google issues manual actions against structured data that contradicts the page). Not
 * putting placeholders in before publication is the contract this whole page has kept
 * (`release-state.ts`'s single published state), and the same discipline applies here.
 *
 * `offers.price: "0"` is a fact rather than marketing copy — this is MIT open source and no payment
 * surface exists. `isAccessibleForFree` rests on the same basis.
 */
export function downloadStructuredData(locale: string, description: string) {
  const published = MACOS_RELEASE.published && MACOS_RELEASE.assets.length > 0;
  const primary =
    MACOS_RELEASE.assets.find((asset) => asset.arch === 'aarch64') ?? MACOS_RELEASE.assets[0];
  const windows = windowsAsset();
  const downloadUrls = [
    ...(MACOS_RELEASE.published ? MACOS_RELEASE.assets.map((asset) => asset.downloadUrl) : []),
    ...(windows ? [windows.downloadUrl] : []),
  ];

  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Ontology Atlas',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: windows ? [RELEASE_MIN_MACOS, RELEASE_MIN_WINDOWS] : RELEASE_MIN_MACOS,
    description,
    url: `${SITE_URL}/${locale}/download/`,
    inLanguage: locale,
    license: 'https://opensource.org/licenses/MIT',
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    ...(published && primary
      ? {
          softwareVersion: MACOS_RELEASE.tag.replace(/^v/, ''),
          downloadUrl: downloadUrls,
          ...(MACOS_RELEASE.publishedAt ? { datePublished: MACOS_RELEASE.publishedAt } : {}),
        }
      : {}),
  };
}
