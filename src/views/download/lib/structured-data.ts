import { SITE_URL } from '@/shared/config';
import { GITHUB_REPO_URL } from '@/shared/config/social-links';
import { RELEASE_MIN_MACOS, RELEASE_MIN_WINDOWS } from './release-facts';
import { MACOS_RELEASE, windowsAsset } from './release-state';

const SITE_PUBLISHER = {
  '@type': 'Organization',
  name: 'ontology-atlas contributors',
  url: SITE_URL,
  sameAs: [GITHUB_REPO_URL],
};

/**
 * The app's `SoftwareApplication` schema (the root `WebSite` one describes the site). Version,
 * URL and size appear only once published: a false claim here is indexed and penalised.
 * Price 0 is a fact: MIT, with no payment surface.
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
    image: `${SITE_URL}/og-image.png`,
    sameAs: [GITHUB_REPO_URL],
    author: SITE_PUBLISHER,
    publisher: SITE_PUBLISHER,
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
