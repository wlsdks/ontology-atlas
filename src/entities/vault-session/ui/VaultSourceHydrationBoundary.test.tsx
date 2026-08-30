import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { VaultSourceHydrationBoundary } from './VaultSourceHydrationBoundary';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('VaultSourceHydrationBoundary', () => {
  it('prerenders only the neutral route fallback, never bundled sample children', () => {
    const html = renderToString(
      <VaultSourceHydrationBoundary>
        <div>Storefront Services</div>
      </VaultSourceHydrationBoundary>,
    );

    expect(html).toContain('route-loading-fallback');
    expect(html).not.toContain('Storefront Services');
  });
});
