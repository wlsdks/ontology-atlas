import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadStaticVaultSource,
  resetStaticVaultSourcesForTests,
} from '@/entities/docs-vault/lib/bundled-vault/load-static-vault-source';
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
});
