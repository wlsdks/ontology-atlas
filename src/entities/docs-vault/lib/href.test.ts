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

  it('builds local dogfood handoff href for the installed app', () => {
    expect(buildDocsVaultHref({ intent: 'local', dogfood: true })).toBe(
      '/docs/?intent=local&dogfood=1',
    );
  });

  it('strips leading # from hash', () => {
    expect(buildDocsVaultHref({ slug: 'a', hash: '##frag' })).toBe(
      '/docs/?slug=a##frag',
    );
  });

  it('preserves a local return target for review flows', () => {
    expect(
      buildDocsVaultHref({
        slug: 'capabilities/mcp-server',
        via: 'insights:do-next',
        reviewId: 'neglected-hub:capability:mcp-server',
      }),
    ).toBe(
      '/docs/?slug=capabilities%2Fmcp-server&via=insights%3Ado-next&review=neglected-hub%3Acapability%3Amcp-server',
    );
    expect(
      buildDocsVaultHref({
        slug: 'capabilities/mcp-server',
        reviewId: 'orphan:capability:mcp-server',
      }),
    ).toBe('/docs/?slug=capabilities%2Fmcp-server');
  });
});
