import { fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RootEntryPage } from './RootEntryPage';

const mocks = vi.hoisted(() => ({
  isDesktopShell: false,
  open: () => Promise.resolve(),
  vaultState: {
    handle: null as unknown,
    manifest: null as unknown,
    restoreAttempted: true,
  } as Record<string, unknown>,
}));

vi.mock('@/entities/vault-session/model/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/LocalVaultProvider')>()),
  useLocalVault: () => mocks.vaultState,
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (key === 'lostVaultMissing') return `Cannot find ${values?.name ?? ''}`;
    if (key === 'lostVaultUnreadable') return 'Could not reopen the folder';
    if (key === 'lostVaultAction') return 'Pick the folder again';
    if (key === 'lostVaultDismiss') return 'Close this notice';
    if (key === 'openingLocalVaultPicker') return 'Opening local vault picker';
    if (key === 'redirectEyebrow') return 'Local ontology store';
    if (key === 'redirectTitle') return 'Preparing your local ontology workbench';
    if (key === 'redirectBody') return 'Ontology Atlas opens the local store setup before any hosted page.';
    if (key === 'redirectFilesProof') return 'Markdown files stay local';
    if (key === 'redirectGraphProof') return 'Frontmatter becomes the graph';
    if (key === 'redirectAgentProof') return 'Agent gate uses MCP and CLI fallback';
    return key;
  },
}));

vi.mock('@/shared/lib/desktop-shell', () => ({
  isDesktopShell: () => mocks.isDesktopShell,
}));

vi.mock('@/views/first-run', () => ({
  FirstRunPage: () => <div data-testid="first-run">first run</div>,
}));

vi.mock('@/views/home', () => ({
  HomePage: () => <div data-testid="topology-hub">topology hub</div>,
}));

vi.mock('@/views/download', () => ({
  GatewayLandingPage: () => <div data-testid="gateway-landing">gateway landing</div>,
}));

describe('RootEntryPage', () => {
  beforeEach(() => {
    mocks.isDesktopShell = false;
    mocks.open = () => Promise.resolve();
    mocks.vaultState = { handle: null, manifest: null, restoreAttempted: true };
  });

  it('tells a returning visitor who lost the connected folder what happened and offers the picker', () => {
    const open = vi.fn(() => Promise.resolve());
    mocks.open = open;
    mocks.vaultState = {
      handle: null,
      manifest: null,
      restoreAttempted: true,
      status: 'error',
      errorCode: 'path-missing',
      recentVaults: [{ name: 'my-atlas' }],
      open,
    };

    render(<RootEntryPage />);

    expect(screen.getByTestId('gateway-landing')).toBeInTheDocument();
    expect(screen.getByTestId('root-entry-lost-vault-notice')).toHaveTextContent(
      'Cannot find my-atlas',
    );
    fireEvent.click(screen.getByTestId('root-entry-lost-vault-open'));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('uses a sentence that works without a name when the folder name is unknown', () => {
    mocks.vaultState = {
      handle: null,
      manifest: null,
      restoreAttempted: true,
      status: 'error',
      errorCode: 'access-failed',
      recentVaults: [],
      open: mocks.open,
    };

    render(<RootEntryPage />);

    const notice = screen.getByTestId('root-entry-lost-vault-notice');
    expect(notice).toHaveTextContent('Could not reopen the folder');
    expect(notice.textContent).not.toContain('Cannot find');
  });

  it('keeps the remembered folder when the notice is dismissed', () => {
    const forgetRecent = vi.fn();
    mocks.vaultState = {
      handle: null,
      manifest: null,
      restoreAttempted: true,
      status: 'error',
      errorCode: 'path-missing',
      recentVaults: [{ name: 'my-atlas' }],
      open: mocks.open,
      forgetRecent,
    };

    render(<RootEntryPage />);
    fireEvent.click(screen.getByTestId('root-entry-lost-vault-dismiss'));

    expect(screen.queryByTestId('root-entry-lost-vault-notice')).not.toBeInTheDocument();
    expect(forgetRecent).not.toHaveBeenCalled();
  });

  it('says nothing before recovery finishes', () => {
    mocks.vaultState = {
      handle: null,
      manifest: null,
      restoreAttempted: false,
      status: 'error',
      errorCode: 'path-missing',
      recentVaults: [{ name: 'my-atlas' }],
      open: mocks.open,
    };

    render(<RootEntryPage />);

    expect(screen.queryByTestId('root-entry-lost-vault-notice')).not.toBeInTheDocument();
  });

  it('shows the gateway, not the map, at the root for a web visitor with no vault', () => {
    render(<RootEntryPage />);

    expect(screen.getByTestId('gateway-landing')).toBeInTheDocument();
    expect(screen.queryByTestId('topology-hub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-run')).not.toBeInTheDocument();
  });

  it('shows the map at the root for a web user with an open vault', () => {
    mocks.vaultState = {
      handle: {} as never,
      manifest: {} as never,
      restoreAttempted: true,
    };

    render(<RootEntryPage />);

    expect(screen.getByTestId('topology-hub')).toBeInTheDocument();
    expect(screen.queryByTestId('gateway-landing')).not.toBeInTheDocument();
  });

  it('shows no gateway at the root of the installed app', () => {
    mocks.isDesktopShell = true;

    render(<RootEntryPage />);

    expect(screen.queryByTestId('gateway-landing')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run')).toBeInTheDocument();
  });

  it('keeps landing copy out of the server-rendered root shell', () => {
    const html = renderToString(<RootEntryPage />);

    expect(html).toContain('Opening local vault picker');
    expect(html).not.toContain('data-testid="landing"');
    expect(html).not.toContain('landing');
  });

  it('shows the first-run surface in the desktop shell when no vault is loaded', () => {
    mocks.isDesktopShell = true;

    render(<RootEntryPage />);

    expect(screen.queryByTestId('landing')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run')).toBeInTheDocument();
  });

  it('holds the neutral boot frame until the vault restore attempt settles', () => {
    mocks.isDesktopShell = true;
    mocks.vaultState = { handle: null, manifest: null, restoreAttempted: false };

    render(<RootEntryPage />);

    expect(screen.queryByTestId('landing')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-run')).not.toBeInTheDocument();
    expect(screen.getByText('Opening local vault picker')).toBeInTheDocument();
  });

  it('opens the topology hub when a vault is already loaded', () => {
    mocks.isDesktopShell = true;
    mocks.vaultState = {
      handle: { name: 'vault' },
      manifest: { docs: [] },
      restoreAttempted: true,
    };

    render(<RootEntryPage />);

    expect(screen.getByTestId('topology-hub')).toBeInTheDocument();
  });

  it('drops stale restored desktop handles into first-run instead of the workspace', () => {
    mocks.isDesktopShell = true;
    mocks.vaultState = {
      handle: { name: 'missing-vault' },
      manifest: null,
      restoreAttempted: true,
    };

    render(<RootEntryPage />);

    expect(screen.queryByTestId('topology-hub')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run')).toBeInTheDocument();
  });
});
