import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { VaultSourceHydrationBoundary } from './VaultSourceHydrationBoundary';

const gate = vi.hoisted(() => ({ retry: vi.fn() }));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('../model/use-static-vault-source', () => ({
  useStaticVaultGate: () => ({ status: 'failed', wait: () => Promise.resolve(), retry: gate.retry }),
}));

describe('VaultSourceHydrationBoundary when the sample cannot be downloaded', () => {
  it('says so with a retry, never an empty folder, and retries on request', () => {
    render(
      <VaultSourceHydrationBoundary>
        <div data-testid="screen">screen</div>
      </VaultSourceHydrationBoundary>,
    );
    expect(screen.getByTestId('sample-load-failed')).toBeInTheDocument();
    expect(screen.queryByTestId('screen')).not.toBeInTheDocument();
    screen.getByRole('button', { name: 'retry' }).click();
    expect(gate.retry).toHaveBeenCalledTimes(1);
  });
});
