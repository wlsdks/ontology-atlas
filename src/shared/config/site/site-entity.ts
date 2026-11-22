import { SITE_URL } from './site';
import { GITHUB_REPO_URL, MAKER_LINKEDIN_URL, xProfileUrl } from './social-links';

/**
 * The site's one Organization and WebSite, declared once in the root layout and referenced by `@id`
 * everywhere else. Restating the publisher on each page under a different name made search engines
 * see several authors; one node with stable ids lets every page's JSON-LD join the same graph.
 *
 * No Person: the repository states no maker's public name (README, LICENSE, package.json), so the
 * Organization is the author.
 */
export const SITE_NAME = 'Ontology Atlas';
export const SITE_ORGANIZATION_ID = `${SITE_URL}/#org`;
export const SITE_WEBSITE_ID = `${SITE_URL}/#website`;

export const SITE_ORGANIZATION_REF = { '@id': SITE_ORGANIZATION_ID } as const;
export const SITE_WEBSITE_REF = { '@id': SITE_WEBSITE_ID } as const;

const SITE_DESCRIPTION =
  'Understand what your codebase builds, why it is structured that way, and what a change will affect.';

export function siteEntityGraph(inLanguage: readonly string[]) {
  const sameAs = [GITHUB_REPO_URL, xProfileUrl(), MAKER_LINKEDIN_URL].filter(
    (url): url is string => typeof url === 'string' && url.length > 0,
  );
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': SITE_ORGANIZATION_ID,
        name: SITE_NAME,
        alternateName: 'ontology-atlas',
        url: `${SITE_URL}/`,
        logo: {
          '@type': 'ImageObject',
          url: `${SITE_URL}/brand-icon-512.png`,
          width: 512,
          height: 512,
        },
        sameAs,
      },
      {
        '@type': 'WebSite',
        '@id': SITE_WEBSITE_ID,
        name: SITE_NAME,
        alternateName: 'ontology-atlas',
        url: `${SITE_URL}/`,
        description: SITE_DESCRIPTION,
        inLanguage: [...inLanguage],
        publisher: SITE_ORGANIZATION_REF,
      },
    ],
  };
}
