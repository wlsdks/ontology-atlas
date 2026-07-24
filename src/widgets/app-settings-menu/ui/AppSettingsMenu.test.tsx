import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSettingsMenu } from './AppSettingsMenu';

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: false,
  locale: 'en',
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
  LocaleSwitch: ({
    onSwitchStart,
  }: {
    onSwitchStart?: (nextLocale: string) => void;
  }) => (
    <button
      type="button"
      data-testid="locale-switch"
      onClick={() => onSwitchStart?.('ko')}
    >
      locale
    </button>
  ),
}));

// 설정 통합 2026-07-24 — AppSettingsMenu 는 app-wide LocalVaultProvider 를
// useLocalVault 로 읽는다. 이 테스트는 provider 없이 렌더하므로 idle vault 를
// mock 한다(에이전트 상세 패널은 vault loaded 상태에서만 뜨므로
// VaultAgentSetupPanel.test.tsx 가 별도로 커버).
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
  useLocale: () => mocks.locale,
}));

function openSheet(ui?: ReactNode) {
  render(ui ?? <AppSettingsMenu mode="static" />);
  fireEvent.click(screen.getByTestId('app-settings-trigger'));
}

/**
 * `OperationsNav`'s standalone `ModeBadge` demo-link owned this hosted-vs-
 * installed routing decision — its exact
 * `isDesktopRuntime ? '/docs/?intent=local' : '/download/'` branch lives in
 * this widget's [작업공간] 문서함 링크 행 (`vaultHref`). `test:desktop:runtime`
 * still needs a direct test guarding that branch.
 */
describe('AppSettingsMenu desktop acquisition boundary', () => {
  beforeEach(() => {
    mocks.isDesktopRuntime = false;
  });

  it('routes the hosted browser vault action to the app download page', () => {
    openSheet();
    expect(
      screen.getByRole('link', { name: /nav\.settingsMenu\.vaultTitle/i }),
    ).toHaveAttribute('href', '/download/');
  });

  it('keeps the installed desktop app vault action on the native local picker path', () => {
    mocks.isDesktopRuntime = true;
    openSheet();
    expect(
      screen.getByRole('link', { name: /nav\.settingsMenu\.vaultTitle/i }),
    ).toHaveAttribute('href', '/docs/?intent=local');
  });

  it('sends an already-loaded local vault straight back to /docs', () => {
    openSheet(<AppSettingsMenu mode="local" />);
    expect(
      screen.getByRole('link', { name: /nav\.settingsMenu\.vaultTitle/i }),
    ).toHaveAttribute('href', '/docs/');
  });
});

/**
 * 설정 통합 2026-07-24 (소유자 지시) — 5탭 모달 폐지. 단일 컬럼 시트가 [화면]
 * [작업공간] [AI 에이전트] 3그룹을 한 화면에 담고, MCP 상세는 드릴인 서브뷰
 * 뒤로 이동한다. 기본 화면에 탭·빈 패널·MCP 증명 장문이 0 임을 가드.
 */
describe('AppSettingsMenu single-sheet recomposition', () => {
  beforeEach(() => {
    mocks.isDesktopRuntime = false;
    mocks.locale = 'en';
    window.sessionStorage.clear();
  });

  it('renders no tabs — the sheet is a single scroll column', () => {
    openSheet();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByTestId('app-settings-body')).toBeInTheDocument();
  });

  it('overlay dims the page behind (modality scrim token)', () => {
    openSheet();
    expect(screen.getByTestId('app-settings-overlay').className).toContain('scrim');
  });

  it('shows the workspace folder row with a direct open action when no vault is loaded', () => {
    openSheet();
    expect(screen.getByTestId('app-settings-workspace-folder')).toBeInTheDocument();
    expect(
      screen.getByText('nav.settingsMenu.workspaceFolderEmpty'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('app-settings-open-folder')).toHaveTextContent(
      'nav.settingsMenu.workspaceFolderOpen',
    );
  });

  it('keeps MCP proof long-form OFF the root sheet and behind the agent drill-in', () => {
    openSheet();
    expect(screen.queryByText('nav.settingsMenu.mcpProofTitle')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('app-settings-agent-drillin'));
    expect(screen.getByTestId('app-settings-agent-view')).toBeInTheDocument();
    expect(screen.getByText('nav.settingsMenu.mcpProofTitle')).toBeInTheDocument();
    // 뒤로가기 헤더 — 루트 시트로 복귀.
    fireEvent.click(screen.getByTestId('app-settings-agent-back'));
    expect(screen.getByTestId('app-settings-body')).toBeInTheDocument();
  });

  it('summarizes agent state as a single row value while no vault is loaded', () => {
    openSheet();
    expect(screen.getByTestId('app-settings-agent-summary')).toHaveTextContent(
      'nav.settingsMenu.agentStatusNoVault',
    );
  });

  it('keeps forward and reverse Tab inside the modal settings sheet', async () => {
    openSheet();
    const panel = screen.getByTestId('app-settings-popover');
    const close = screen.getByLabelText('nav.settingsMenu.closeLabel');
    const last = screen.getByTestId('app-settings-agent-drillin');

    await waitFor(() => expect(panel).toHaveFocus());
    expect(panel).toHaveAttribute('aria-modal', 'true');

    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(close).toHaveFocus();

    close.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('returns focus to the equivalent settings trigger after a locale navigation remount', async () => {
    const first = render(<AppSettingsMenu mode="static" />);
    fireEvent.click(screen.getByTestId('app-settings-trigger'));
    fireEvent.click(screen.getByTestId('locale-switch'));
    first.unmount();

    mocks.locale = 'ko';
    render(<AppSettingsMenu mode="static" />);

    await waitFor(() => {
      expect(screen.getByTestId('app-settings-trigger')).toHaveFocus();
    });
    expect(screen.getByTestId('app-settings-trigger')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('restores the exact responsive trigger variant when two settings entries remount', async () => {
    const first = render(
      <AppSettingsMenu mode="static" triggerVariant="chrome-tile" />,
    );
    fireEvent.click(screen.getByTestId('app-settings-trigger'));
    fireEvent.click(screen.getByTestId('locale-switch'));
    first.unmount();

    mocks.locale = 'ko';
    render(
      <>
        <AppSettingsMenu mode="static" triggerVariant="rail-tile" />
        <AppSettingsMenu mode="static" triggerVariant="chrome-tile" />
      </>,
    );
    const triggers = screen.getAllByTestId('app-settings-trigger');
    const railTrigger = triggers.find(
      (trigger) => trigger.getAttribute('data-trigger-variant') === 'rail-tile',
    );
    const chromeTrigger = triggers.find(
      (trigger) => trigger.getAttribute('data-trigger-variant') === 'chrome-tile',
    );

    await waitFor(() => expect(chromeTrigger).toHaveFocus());
    expect(railTrigger).not.toHaveFocus();
  });
});

/**
 * screenControls — 지도(HomePage)만 주입하는 화면 상태 행(보기 모드·INDEX 기본
 * 상태). 미주입 페이지(빌더 등)에선 행 자체가 없다.
 */
describe('AppSettingsMenu screenControls injection', () => {
  const controls = () => ({
    audiencePlain: false,
    onAudiencePlainChange: vi.fn(),
    indexCollapsed: false,
    onIndexCollapsedChange: vi.fn(),
  });

  it('hides view-mode and INDEX rows when screenControls is not injected', () => {
    openSheet();
    expect(screen.queryByTestId('app-settings-view-mode')).not.toBeInTheDocument();
    expect(screen.queryByTestId('app-settings-index-default')).not.toBeInTheDocument();
  });

  it('renders both rows and reports segment changes when injected', () => {
    const sc = controls();
    openSheet(<AppSettingsMenu mode="static" screenControls={sc} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'nav.settingsMenu.viewModePlain' }),
    );
    expect(sc.onAudiencePlainChange).toHaveBeenCalledWith(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'nav.settingsMenu.indexDefaultCollapsed' }),
    );
    expect(sc.onIndexCollapsedChange).toHaveBeenCalledWith(true);
  });
});

/**
 * P3 결함⑥ (사용성 전수 검수 2026-07-23) — 검색 팔레트(⌘K)가 이 다이얼로그
 * 위에 중첩되는 결함의 처방. `open`/`onOpenChange` 를 주면 controlled, 생략하면
 * 기존 self-managed 동작 그대로(하위호환).
 */
describe('AppSettingsMenu controlled open (P3 결함⑥)', () => {
  beforeEach(() => {
    mocks.isDesktopRuntime = false;
  });

  it('stays uncontrolled (self-managed) when open/onOpenChange are omitted — existing behavior unchanged', () => {
    render(<AppSettingsMenu mode="static" />);
    expect(screen.getByTestId('app-settings-trigger')).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByTestId('app-settings-trigger'));
    expect(screen.getByTestId('app-settings-trigger')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('app-settings-popover')).toBeInTheDocument();
  });

  it('renders open when the controlled `open` prop is true, without needing a trigger click', () => {
    render(<AppSettingsMenu mode="static" open onOpenChange={() => {}} />);
    expect(screen.getByTestId('app-settings-trigger')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('app-settings-popover')).toBeInTheDocument();
  });

  it('clicking the trigger reports the toggle via onOpenChange instead of managing its own state', () => {
    const onOpenChange = vi.fn();
    render(<AppSettingsMenu mode="static" open={false} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByTestId('app-settings-trigger'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    // controlled — the prop the test passed in never changed, so the component
    // still reports itself closed until the caller re-renders it open.
    expect(screen.getByTestId('app-settings-trigger')).toHaveAttribute('aria-expanded', 'false');
  });

  it('⌘K while controlled-open reports close via onOpenChange (Guardian B2 — palette wins, settings demotes)', () => {
    const onOpenChange = vi.fn();
    render(<AppSettingsMenu mode="static" open onOpenChange={onOpenChange} />);
    fireEvent.keyDown(screen.getByTestId('app-settings-popover'), {
      key: 'k',
      metaKey: true,
      bubbles: true,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('the close button reports close via onOpenChange when controlled', () => {
    const onOpenChange = vi.fn();
    render(<AppSettingsMenu mode="static" open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByLabelText('nav.settingsMenu.closeLabel'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Escape inside the agent drill-in restores the root row before closing', async () => {
    const onOpenChange = vi.fn();
    render(<AppSettingsMenu mode="static" open onOpenChange={onOpenChange} />);
    const drillIn = screen.getByTestId('app-settings-agent-drillin');
    fireEvent.click(drillIn);
    await waitFor(() => {
      expect(screen.getByTestId('app-settings-agent-back')).toHaveFocus();
    });
    fireEvent.keyDown(screen.getByTestId('app-settings-popover'), {
      key: 'Escape',
      bubbles: true,
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByTestId('app-settings-body')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('app-settings-agent-drillin')).toHaveFocus();
    });
    fireEvent.keyDown(screen.getByTestId('app-settings-popover'), {
      key: 'Escape',
      bubbles: true,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
