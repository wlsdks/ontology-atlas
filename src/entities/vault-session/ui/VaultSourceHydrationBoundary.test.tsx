import { act, render, screen } from '@testing-library/react';
import { Suspense, useEffect } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadStaticVaultSource, resetStaticVaultSourcesForTests } from '@/entities/docs-vault/lib/bundled-vault/load-static-vault-source';
import { writeSampleSourcePreference } from '@/shared/lib/vault-folder/sample-source';
import { useSampleSource } from '../model/use-sample-source';
import { VaultSourceHydrationBoundary } from './VaultSourceHydrationBoundary';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

describe('VaultSourceHydrationBoundary', () => {
  beforeEach(() => resetStaticVaultSourcesForTests());
  afterEach(async () => {
    act(() => writeSampleSourcePreference('storefront'));
    // The shared setup keeps both samples in hand for every other test file.
    await Promise.all([loadStaticVaultSource('dogfood'), loadStaticVaultSource('storefront')]);
  });

  it('prerenders only the neutral route fallback, never bundled sample children', () => {
    const html = renderToString(
      <VaultSourceHydrationBoundary>
        <div>Storefront Services</div>
      </VaultSourceHydrationBoundary>,
    );

    expect(html).toContain('route-loading-fallback');
    expect(html).not.toContain('Storefront Services');
  });

  it('leaves the page fallback in place while the sample downloads, never a second loading state', async () => {
    let sawSecondLoadingState = false;
    const watcher = new MutationObserver(() => {
      if (document.querySelector('[data-testid="route-loading-fallback"]')) sawSecondLoadingState = true;
    });
    watcher.observe(document.body, { childList: true, subtree: true });
    const stop = () => watcher.disconnect();
    // Suspense retries run inside act, so the render and the download settle in one scope.
    await act(async () => {
      render(
        <Suspense fallback={<div data-testid="page-fallback">page fallback</div>}>
          <VaultSourceHydrationBoundary>
            <div data-testid="screen">screen</div>
          </VaultSourceHydrationBoundary>
        </Suspense>,
      );
      await loadStaticVaultSource('storefront');
    });
    stop();
    expect(sawSecondLoadingState).toBe(false);
    expect(screen.getByTestId('screen')).toBeInTheDocument();
    expect(screen.queryByTestId('page-fallback')).not.toBeInTheDocument();
  });

  it('keeps the screen mounted when the other sample is chosen', async () => {
    let mounts = 0;
    function Screen() {
      const [, setSample] = useSampleSource();
      useEffect(() => {
        mounts += 1;
      }, []);
      return (
        <button type="button" onClick={() => setSample('dogfood')}>
          choose
        </button>
      );
    }
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <VaultSourceHydrationBoundary>
            <Screen />
          </VaultSourceHydrationBoundary>
        </Suspense>,
      );
      await loadStaticVaultSource('storefront');
    });
    const button = screen.getByRole('button', { name: 'choose' });
    const before = mounts;
    act(() => button.click());
    expect(screen.queryByTestId('route-loading-fallback')).not.toBeInTheDocument();
    await act(async () => {
      await loadStaticVaultSource('dogfood');
    });
    expect(screen.getByRole('button', { name: 'choose' })).toBe(button);
    expect(mounts).toBe(before);
  });
});
