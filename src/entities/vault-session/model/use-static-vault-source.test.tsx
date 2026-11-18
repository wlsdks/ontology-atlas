import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadStaticVaultSource,
  resetStaticVaultSourcesForTests,
} from '@/entities/docs-vault/lib/bundled-vault/load-static-vault-source';
import { bundledSamples } from '@/entities/docs-vault';
import { writeSampleSourcePreference } from '@/shared/lib/vault-folder/sample-source';
import { useSampleSource } from './use-sample-source';
import { useStaticVaultSource, useStaticVaultStatus } from './use-static-vault-source';

const desktop = vi.hoisted(() => ({ value: false }));
vi.mock('@/shared/lib/desktop-shell/desktop-shell', () => ({
  isDesktopShell: () => desktop.value,
}));

function Probe() {
  const source = useStaticVaultSource();
  const status = useStaticVaultStatus();
  return (
    <span data-testid="probe">
      {status}:{source.source}:{source.manifest.docs.length}
    </span>
  );
}

describe('useStaticVaultSource', () => {
  beforeEach(() => {
    resetStaticVaultSourcesForTests();
    desktop.value = false;
  });

  afterEach(async () => {
    // The shared setup keeps both samples in hand for every other test file.
    await Promise.all([loadStaticVaultSource('dogfood'), loadStaticVaultSource('storefront')]);
  });

  it('reads empty while the web sample downloads, then the sample', async () => {
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toMatch(/^ready:storefront:[1-9]/));
  });

  it('shows loading before the chunk lands', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('loading:storefront:0');
  });

  it('never downloads a sample in the installed app', async () => {
    desktop.value = true;
    render(<Probe />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('none:storefront:0');
  });

  it('fetches nothing for a reader that only wants what is already there', async () => {
    function Quiet() {
      const source = useStaticVaultSource(undefined, { demand: false });
      return <span data-testid="quiet">{source.manifest.docs.length}</span>;
    }
    render(<Quiet />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(screen.getByTestId('quiet')).toHaveTextContent('0');
    expect(bundledSamples.state('storefront')).toBe('idle');
  });

  it('keeps the sample on show while the other one downloads, then swaps in place', async () => {
    await loadStaticVaultSource('storefront');
    function Probe2() {
      const [, setSample] = useSampleSource();
      const source = useStaticVaultSource();
      return (
        <>
          <button type="button" onClick={() => setSample('dogfood')}>
            switch
          </button>
          <span data-testid="shown">{source.source}</span>
        </>
      );
    }
    render(<Probe2 />);
    expect(screen.getByTestId('shown')).toHaveTextContent('storefront');
    act(() => {
      screen.getByRole('button', { name: 'switch' }).click();
    });
    // Never empty and never the old name's mismatch: the previous sample stays until the next lands.
    expect(screen.getByTestId('shown')).toHaveTextContent('storefront');
    await waitFor(() => expect(screen.getByTestId('shown')).toHaveTextContent('dogfood'));
    act(() => writeSampleSourcePreference('storefront'));
  });
});
