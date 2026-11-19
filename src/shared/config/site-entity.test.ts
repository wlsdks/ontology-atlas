import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { SITE_URL } from './site';
import { GITHUB_REPO_URL } from './social-links';
import { SITE_ORGANIZATION_ID, SITE_WEBSITE_ID, siteEntityGraph } from './site-entity';

type Node = Record<string, unknown> & { '@type': string };

describe('siteEntityGraph', () => {
  const graph = siteEntityGraph(['en', 'ko'])['@graph'] as Node[];
  const organization = graph.find((node) => node['@type'] === 'Organization')!;
  const website = graph.find((node) => node['@type'] === 'WebSite')!;

  it('declares one Organization and one WebSite under stable ids on the site origin', () => {
    expect(graph).toHaveLength(2);
    expect(organization['@id']).toBe(`${SITE_URL}/#org`);
    expect(website['@id']).toBe(`${SITE_URL}/#website`);
  });

  it('makes the Organization the WebSite publisher by reference, not by a second copy', () => {
    expect(website.publisher).toEqual({ '@id': SITE_ORGANIZATION_ID });
    expect(SITE_WEBSITE_ID).not.toBe(SITE_ORGANIZATION_ID);
  });

  it('gives the Organization a logo that ships in public/ and the repository as a sameAs', () => {
    const logo = organization.logo as { url: string };
    const file = logo.url.slice(SITE_URL.length);
    expect(existsSync(path.join(process.cwd(), 'public', file))).toBe(true);
    expect(organization.sameAs).toContain(GITHUB_REPO_URL);
  });
});
