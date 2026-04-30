import { describe, expect, it } from 'vitest';
import { buildDocsVaultHref } from './href';

describe('buildDocsVaultHref', () => {
  it('keeps account scope when building doc links', () => {
    expect(
      buildDocsVaultHref({
        accountId: 'stress-lab',
        slug: 'ARCHITECTURE',
      }),
    ).toBe('/docs/?account=stress-lab&slug=ARCHITECTURE');
  });

  it('appends hash after query params', () => {
    expect(
      buildDocsVaultHref({
        accountId: 'stress-lab',
        slug: 'ARCHITECTURE',
        hash: '#section',
      }),
    ).toBe('/docs/?account=stress-lab&slug=ARCHITECTURE#section');
  });
});
