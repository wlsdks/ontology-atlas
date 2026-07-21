import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSettingsMenu } from './AppSettingsMenu';

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: false,
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  isTauriVaultRuntime: () => mocks.isDesktopRuntime,
  getTauriVaultRootPath: () => null,
  openTauriVaultInFinder: vi.fn(),
}));

vi.mock('@/shared/lib/use-copy-feedback', () => ({
  useCopyFeedback: () => ({ state: 'idle' as const, copy: vi.fn() }),
}));

vi.mock('@/features/locale-switch', () => ({
  LocaleSwitch: () => <div data-testid="locale-switch" />,
}));

// B2 병합 — AppSettingsMenu 는 이제 app-wide LocalVaultProvider 를 useLocalVault
// 로 읽는다. 이 테스트는 provider 없이 렌더하므로 idle vault 를 mock 한다(설정
// 파일 패널은 vault loaded 상태에서만 뜨므로 VaultAgentSetupPanel.test.tsx 가
// 별도로 커버). LocalVaultPicker 는 stub 으로 대체해 vault 탭 도달만 확인한다.
vi.mock('@/features/docs-vault-local', () => ({
  useLocalVault: () => ({
    status: 'idle',
    handle: null,
    manifest: null,
    agentConfigStatus: null,
    errorMessage: null,
    lastLoadedAt: null,
    recentVaults: [],
    open: vi.fn(),
    openRecent: vi.fn(),
    forgetRecent: vi.fn(),
    close: vi.fn(),
    refresh: vi.fn(),
    requestPermission: vi.fn(),
    ensureAgentConfigs: vi.fn(),
    scaffoldOntology: vi.fn(),
  }),
  LocalVaultPicker: () => <div data-testid="local-vault-picker" />,
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({
    href,
    children,
    ...props
  }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const TAB_VAULT_NAME = /^nav\.settingsMenu\.tabVault/;

function openVaultTab() {
  render(<AppSettingsMenu mode="static" />);
  fireEvent.click(screen.getByTestId('app-settings-trigger'));
  fireEvent.click(screen.getByRole('tab', { name: TAB_VAULT_NAME }));
}

/**
 * `OperationsNav`'s standalone `ModeBadge` demo-link owned this hosted-vs-
 * installed routing decision before feat/rail-rollout retired it — its exact
 * `isDesktopRuntime ? '/docs/?intent=local' : '/download/'` branch moved
 * verbatim into this widget's "vault" tab (`vaultHref`). `test:desktop:runtime`
 * still needs a direct test guarding that branch, so it now points here
 * instead of the deleted `OperationsNav.test.tsx`.
 */
describe('AppSettingsMenu desktop acquisition boundary', () => {
  beforeEach(() => {
    mocks.isDesktopRuntime = false;
  });

  it('routes the hosted browser vault action to the app download page', () => {
    openVaultTab();
    expect(screen.getByRole('link', { name: /nav.settingsMenu.vaultTitle/i })).toHaveAttribute(
      'href',
      '/download/',
    );
  });

  it('keeps the installed desktop app vault action on the native local picker path', () => {
    mocks.isDesktopRuntime = true;
    openVaultTab();
    expect(screen.getByRole('link', { name: /nav.settingsMenu.vaultTitle/i })).toHaveAttribute(
      'href',
      '/docs/?intent=local',
    );
  });

  it('sends an already-loaded local vault straight back to /docs', () => {
    render(<AppSettingsMenu mode="local" />);
    fireEvent.click(screen.getByTestId('app-settings-trigger'));
    fireEvent.click(screen.getByRole('tab', { name: TAB_VAULT_NAME }));
    expect(screen.getByRole('link', { name: /nav.settingsMenu.vaultTitle/i })).toHaveAttribute(
      'href',
      '/docs/',
    );
  });
});

/**
 * B2 병합 — 이전 문서함 헤더 VaultToolsMenu 의 로컬 vault 관리(LocalVaultPicker)가
 * 설정 메뉴 vault 탭으로 이관됐다. 여기서는 그 도달만 확인(picker 내부 동작은
 * LocalVaultPicker.test.tsx, agent 설정 패널은 VaultAgentSetupPanel.test.tsx 가 커버).
 */
describe('AppSettingsMenu vault-tools merge', () => {
  beforeEach(() => {
    mocks.isDesktopRuntime = false;
  });

  it('hosts the local vault picker inside the vault tab', () => {
    openVaultTab();
    expect(screen.getByTestId('local-vault-picker')).toBeInTheDocument();
  });

  it('does not render the vault-aware agent setup panel while no vault is loaded', () => {
    render(<AppSettingsMenu mode="static" />);
    fireEvent.click(screen.getByTestId('app-settings-trigger'));
    fireEvent.click(screen.getByRole('tab', { name: /^nav\.settingsMenu\.tabMcpAgents/ }));
    // idle vault -> panel returns null, static MCP first-calls education shows instead.
    expect(
      screen.queryByRole('region', { name: 'docsVault.agentSetup.ariaLabel' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('nav.settingsMenu.mcpProofTitle')).toBeInTheDocument();
  });
});
