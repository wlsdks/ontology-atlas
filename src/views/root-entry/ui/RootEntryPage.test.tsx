import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RootEntryPage } from './RootEntryPage';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  isDesktopRuntime: false,
  vaultState: {
    handle: null as unknown,
    manifest: null as unknown,
    restoreAttempted: true,
  },
}));

vi.mock('@/features/docs-vault-local', () => ({
  useLocalVault: () => mocks.vaultState,
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    if (key === 'openingLocalVaultPicker') return 'Opening local vault picker';
    return key;
  },
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  isTauriVaultRuntime: () => mocks.isDesktopRuntime,
}));

vi.mock('@/views/landing', () => ({
  LandingPage: () => <div data-testid="landing">landing</div>,
}));

vi.mock('@/views/ontology-view', () => ({
  OntologyViewPage: () => <div data-testid="ontology">ontology</div>,
}));

describe('RootEntryPage', () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.isDesktopRuntime = false;
    mocks.vaultState = { handle: null, manifest: null, restoreAttempted: true };
  });

  it('keeps the hosted web root on the landing page when no vault is loaded', () => {
    render(<RootEntryPage />);

    expect(screen.getByTestId('landing')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('routes the desktop app without a restored vault into the local picker flow', async () => {
    mocks.isDesktopRuntime = true;

    render(<RootEntryPage />);

    expect(screen.queryByTestId('landing')).not.toBeInTheDocument();
    expect(screen.getByText('Opening local vault picker')).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/docs/?intent=local');
    });
  });

  it('waits for the local vault restore attempt before desktop picker routing', async () => {
    mocks.isDesktopRuntime = true;
    mocks.vaultState = { handle: null, manifest: null, restoreAttempted: false };

    render(<RootEntryPage />);

    expect(screen.queryByTestId('landing')).not.toBeInTheDocument();
    expect(screen.getByText('Opening local vault picker')).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.replace).not.toHaveBeenCalled();
    });
  });

  it('opens the ontology workspace when a vault is already loaded', () => {
    mocks.isDesktopRuntime = true;
    mocks.vaultState = {
      handle: { name: 'vault' },
      manifest: { docs: [] },
      restoreAttempted: true,
    };

    render(<RootEntryPage />);

    expect(screen.getByTestId('ontology')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('routes stale restored desktop handles back to the picker instead of the workspace', async () => {
    mocks.isDesktopRuntime = true;
    mocks.vaultState = {
      handle: { name: 'missing-vault' },
      manifest: null,
      restoreAttempted: true,
    };

    render(<RootEntryPage />);

    expect(screen.queryByTestId('ontology')).not.toBeInTheDocument();
    expect(screen.getByText('Opening local vault picker')).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/docs/?intent=local');
    });
  });
});
