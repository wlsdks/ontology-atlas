import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RootEntryPage } from './RootEntryPage';

const mocks = vi.hoisted(() => ({
  isDesktopShell: false,
  vaultState: {
    handle: null as unknown,
    manifest: null as unknown,
    restoreAttempted: true,
  } as Record<string, unknown>,
}));

vi.mock('@/entities/vault-session/model/vault-provider/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/vault-provider/LocalVaultProvider')>()),
  useLocalVault: () => mocks.vaultState,
}));

vi.mock('use-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => {
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

vi.mock('@/shared/lib/desktop-shell/desktop-shell', () => ({
  isDesktopShell: () => mocks.isDesktopShell,
}));

vi.mock('@/views/first-run', () => ({
  FirstRunPage: () => <div data-testid="first-run">first run</div>,
}));

vi.mock('@/views/home', () => ({
  HomePage: () => <div data-testid="topology-hub">topology hub</div>,
}));

describe('RootEntryPage', () => {
  beforeEach(() => {
    mocks.isDesktopShell = false;
    mocks.vaultState = { handle: null, manifest: null, restoreAttempted: true };
  });

  it('shows the map at the root for a web user with an open vault', async () => {
    mocks.vaultState = {
      handle: {} as never,
      manifest: {} as never,
      restoreAttempted: true,
    };

    render(<RootEntryPage search={{}} />);

    expect(await screen.findByTestId('topology-hub')).toBeInTheDocument();
  });

  it('keeps the neutral frame in the server-rendered root shell', () => {
    const html = renderToString(<RootEntryPage search={{}} />);

    // Until the browser knows whether this is the installed app, only the neutral frame paints.
    expect(html).toContain('Opening local vault picker');
  });

  it('shows the first-run surface in the desktop shell when no vault is loaded', async () => {
    mocks.isDesktopShell = true;

    render(<RootEntryPage search={{}} />);

    expect(await screen.findByTestId('first-run')).toBeInTheDocument();
  });

  it('holds the neutral boot frame until the vault restore attempt settles', () => {
    mocks.isDesktopShell = true;
    mocks.vaultState = { handle: null, manifest: null, restoreAttempted: false };

    render(<RootEntryPage search={{}} />);

    expect(screen.queryByTestId('first-run')).not.toBeInTheDocument();
    expect(screen.getByText('Opening local vault picker')).toBeInTheDocument();
  });

  it('opens the topology hub when a vault is already loaded', async () => {
    mocks.isDesktopShell = true;
    mocks.vaultState = {
      handle: { name: 'vault' },
      manifest: { docs: [] },
      restoreAttempted: true,
    };

    render(<RootEntryPage search={{}} />);

    expect(await screen.findByTestId('topology-hub')).toBeInTheDocument();
  });

  it('drops stale restored desktop handles into first-run instead of the workspace', async () => {
    mocks.isDesktopShell = true;
    mocks.vaultState = {
      handle: { name: 'missing-vault' },
      manifest: null,
      restoreAttempted: true,
    };

    render(<RootEntryPage search={{}} />);

    expect(await screen.findByTestId('first-run')).toBeInTheDocument();
    expect(screen.queryByTestId('topology-hub')).not.toBeInTheDocument();
  });
});
