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
   * 2026-07-30 — 「root-first-open」 뒤집기 구현. 이 테스트는 **뒤집힌 쪽**을
   * 잠근다: 아직 아무 폴더도 안 연 웹 방문자에게 `/` 는 지도가 아니라 얼굴이다.
   * 지도는 `/topology` 가 갖는다.
   */
  it('보여줄 볼트가 없는 웹 방문자에게 루트는 얼굴이다 — 지도가 아니라', () => {
    render(<RootEntryPage />);

    expect(screen.getByTestId('gateway-landing')).toBeInTheDocument();
    expect(screen.queryByTestId('topology-hub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-run')).not.toBeInTheDocument();
  });

  /**
   * **뒤집기의 나머지 절반은 그대로다.** 볼트를 연 사람은 방문자가 아니라
   * 작업자라, 루트가 그 사람에게 홍보를 보여주면 안 된다. 이 분기가 무너지면
   * 설치·자기 볼트를 가진 사람이 매번 다운로드 안내를 본다.
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
   * 설치된 앱은 자기를 이미 설치한 사람에게 "다운로드하세요" 를 보여주면 안 된다 —
   * root-first-open 의 이 절반은 뒤집히지 않았다.
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
