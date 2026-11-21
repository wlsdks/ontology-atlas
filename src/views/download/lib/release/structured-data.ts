import { SITE_URL } from '@/shared/config';
import { GITHUB_REPO_URL } from '@/shared/config/site/social-links';
import { SITE_ORGANIZATION_REF } from '@/shared/config/site/site-entity';
import { RELEASE_MIN_MACOS, RELEASE_MIN_WINDOWS } from './release-facts';
import { MACOS_RELEASE, windowsAsset } from './release-state';


/**
 * The app's `SoftwareApplication` schema (the root `WebSite` one describes the site). Version,
 * URL and size appear only once published: a false claim here is indexed and penalised.
 * Price 0 is a fact: MIT, with no payment surface.
 */
/** `naming` is the brand as this locale reads it and the words its searchers use. */
export function downloadStructuredData(locale: string, description: string, naming: { reading: string; keywords: string }) {
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
    alternateName: [...new Set(['ontology-atlas', naming.reading])].filter((name) => name !== 'Ontology Atlas'),
    keywords: naming.keywords.split(/\s*[,，、]\s*/),
    applicationCategory: 'DeveloperApplication',
    operatingSystem: windows ? [RELEASE_MIN_MACOS, RELEASE_MIN_WINDOWS] : RELEASE_MIN_MACOS,
    description,
    url: `${SITE_URL}/${locale}/download/`,
    inLanguage: locale,
    image: `${SITE_URL}/og/${locale}.png`,
    // What an answer engine can cite beside the claim: the app's own map, and the guide.
    screenshot: `${SITE_URL}/gateway/projects.${locale === 'ko' ? 'ko' : 'en'}.webp`,
    softwareHelp: { '@type': 'CreativeWork', url: `${SITE_URL}/${locale}/guide/` },
    sameAs: [GITHUB_REPO_URL],
    // The root layout declares the Organization once; this joins that node instead of restating it.
    author: SITE_ORGANIZATION_REF,
    publisher: SITE_ORGANIZATION_REF,
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
