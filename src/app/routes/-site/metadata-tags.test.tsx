import { afterEach, describe, expect, it, vi } from 'vitest';

import { siteMetadata } from '@/shared/lib/public-pages/site-metadata';

import { metadataTags } from './metadata-tags';

afterEach(() => vi.unstubAllEnvs());

const metaContent = (name: string) =>
  metadataTags(siteMetadata())
    .filter((element) => element.type === 'meta' && (element.props as { name?: string }).name === name)
    .map((element) => (element.props as { content: string }).content);

describe('the site head', () => {
  it('emits the search console verification tag when the build names a code', () => {
    vi.stubEnv('ATLAS_PUBLIC_GOOGLE_SITE_VERIFICATION', 'abc123');
    expect(metaContent('google-site-verification')).toEqual(['abc123']);
  });

  it('emits no verification tag when the build names none', () => {
    vi.stubEnv('ATLAS_PUBLIC_GOOGLE_SITE_VERIFICATION', '');
    expect(metaContent('google-site-verification')).toEqual([]);
  });
});
