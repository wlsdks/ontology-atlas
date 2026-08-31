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

  /*
   * ⚠️ Census state 1b, the worst finding of the 2026-08-31 sweep: somebody who connected a folder,
   * then moved or deleted it, came back to the promotional face with **no trace** that a folder had
   * ever been chosen. The gateway still renders — there is nothing else to show — but it can no
   * longer be the whole answer.
   */
  it('연결했던 폴더를 잃은 재방문자에게 무슨 일이 있었는지 말하고 피커를 건넨다', () => {
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

    // The face still renders; the notice is added to it rather than replacing it.
    expect(screen.getByTestId('gateway-landing')).toBeInTheDocument();
    expect(screen.getByTestId('root-entry-lost-vault-notice')).toHaveTextContent(
      'Cannot find my-atlas',
    );
    fireEvent.click(screen.getByTestId('root-entry-lost-vault-open'));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('이름을 모르면 이름 자리를 비운 문장 대신 이름 없이도 성립하는 문장을 쓴다', () => {
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

  /*
   * Dismissing hides the line. It must **not** forget the stored handle: a failed restore is not
   * proof the folder is gone forever, and forgetting it deletes the one fact the next visit needs.
   */
  it('알림을 닫아도 기억한 폴더를 지우지 않는다', () => {
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

  it('복구가 끝나기 전에는 아직 아무 말도 하지 않는다', () => {
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
