import { describe, expect, it } from 'vitest';
import { buildDocsVaultHref } from './href';

describe('buildDocsVaultHref', () => {
  it('builds slug-only href', () => {
    expect(buildDocsVaultHref({ slug: 'ARCHITECTURE' })).toBe(
      '/docs/?slug=ARCHITECTURE',
    );
  });

  it('encodes special characters in slug', () => {
    expect(buildDocsVaultHref({ slug: 'foo bar' })).toBe(
      '/docs/?slug=foo%20bar',
    );
  });

  it('appends hash after query params', () => {
    expect(
      buildDocsVaultHref({ slug: 'ARCHITECTURE', hash: '#section' }),
    ).toBe('/docs/?slug=ARCHITECTURE#section');
  });

  it('handles empty input — returns root /docs/', () => {
    expect(buildDocsVaultHref()).toBe('/docs/');
  });

  it('strips leading # from hash', () => {
    expect(buildDocsVaultHref({ slug: 'a', hash: '##frag' })).toBe(
      '/docs/?slug=a##frag',
    );
  });
});
