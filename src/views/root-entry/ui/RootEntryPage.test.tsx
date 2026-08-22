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
  },
}));

vi.mock('@/features/docs-vault-local', () => ({
  useLocalVault: () => mocks.vaultState,
}));

vi.mock('next-intl', () => ({
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
    mocks.vaultState = { handle: null, manifest: null, restoreAttempted: true };
  });

  /**
   * 2026-07-30 — the implementation reversing "root-first-open". This test locks **the reversed side**:
   * for a web visitor who has not opened any folder, `/` is the face, not the map. The map belongs to
   * `/topology`.
   */
  it('보여줄 볼트가 없는 웹 방문자에게 루트는 얼굴이다 — 지도가 아니라', () => {
    render(<RootEntryPage />);

    expect(screen.getByTestId('gateway-landing')).toBeInTheDocument();
    expect(screen.queryByTestId('topology-hub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-run')).not.toBeInTheDocument();
  });

  /**
   * **The other half of the reversal stands.** Someone who has opened a vault is a worker rather than a
   * visitor, so the root must not show them promotion. If this branch collapses, anyone with the app
   * installed or with their own vault sees the download guidance every time.
   */
  it('볼트를 연 웹 사용자에게는 루트가 그대로 지도다', () => {
    mocks.vaultState = {
      handle: {} as never,
      manifest: {} as never,
      restoreAttempted: true,
    };

    render(<RootEntryPage />);

    expect(screen.getByTestId('topology-hub')).toBeInTheDocument();
    expect(screen.queryByTestId('gateway-landing')).not.toBeInTheDocument();
  });

  /**
   * The installed app must not tell someone who already installed it to "download" — this half of
   * root-first-open was not reversed.
   */
  it('설치된 앱의 루트에는 얼굴이 뜨지 않는다', () => {
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
