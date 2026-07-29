import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { MouseEventHandler, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestSettingsView } from '@/shared/lib/settings-view-intent';
import {
  AGENT_GRAPH_WORKFLOW_HREF,
  AppSettingsMenu,
} from './AppSettingsMenu';

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: false,
  vaultRootPath: null as string | null,
  vaultStatus: 'idle' as string,
  vaultHandleName: null as string | null,
  revealInFinder: vi.fn(),
  copyPath: vi.fn(),
  locale: 'en',
  rememberRouteFocusIntent: vi.fn(),
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  isTauriVaultRuntime: () => mocks.isDesktopRuntime,
  getTauriVaultRootPath: () => mocks.vaultRootPath,
  openTauriVaultInFinder: (...args: unknown[]) => mocks.revealInFinder(...args),
}));

vi.mock('@/shared/lib/use-copy-feedback', () => ({
  useCopyFeedback: () => ({ state: 'idle' as const, copy: mocks.copyPath }),
}));

vi.mock('@/shared/ui/route-focus-manager', () => ({
  buildRouteFocusHref: (href: string) =>
    `${href}${href.includes('?') ? '&' : '?'}focus=main`,
  rememberRouteFocusIntent: mocks.rememberRouteFocusIntent,
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
  // 번들 MCP 서버는 설치 앱에서만 보인다 — jsdom 은 웹 세션과 같은 자리다.
  useAgentServer: () => ({
    kind: 'unavailable',
    launch: null,
    binaryPath: null,
    reason: 'The bundled MCP server is only available in the installed app.',
  }),
  useLocalVault: () => ({
    status: mocks.vaultStatus,
    handle: mocks.vaultHandleName ? { name: mocks.vaultHandleName } : null,
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
    onClick,
    ...props
  }: {
    href: string;
    children: ReactNode;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
  } & Record<string, unknown>) => (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
  useLocale: () => mocks.locale,
}));

/**
 * 시트를 연다. 2026-07-29 에 설정이 **LNB 2단**이 되면서, 화면 절이 아닌 내용은
 * 왼쪽 목록을 눌러야 나온다 — 그래서 절을 인자로 받는다. 기본값은 첫 화면(화면 절).
 */
function openSheet(ui?: ReactNode, section?: 'screen' | 'background' | 'footprint' | 'workspace' | 'agent') {
  render(ui ?? <AppSettingsMenu mode="static" />);
  fireEvent.click(screen.getByTestId('app-settings-trigger'));
  if (section && section !== 'screen') fireEvent.click(screen.getByTestId(`app-settings-nav-${section}`));
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
    mocks.rememberRouteFocusIntent.mockClear();
  });

  it('routes the hosted browser vault action to the app download page', () => {
    openSheet(undefined, 'workspace');
    expect(
      screen.getByRole('link', { name: /nav\.settingsMenu\.vaultTitle/i }),
    ).toHaveAttribute('href', '/download/?focus=main');
  });

  it('keeps the installed desktop app vault action on the native local picker path', () => {
    mocks.isDesktopRuntime = true;
    openSheet(undefined, 'workspace');
    expect(
      screen.getByRole('link', { name: /nav\.settingsMenu\.vaultTitle/i }),
    ).toHaveAttribute('href', '/docs/?intent=local&focus=main');
  });

  it('sends an already-loaded local vault straight back to /docs', () => {
    openSheet(<AppSettingsMenu mode="local" />, 'workspace');
    expect(
      screen.getByRole('link', { name: /nav\.settingsMenu\.vaultTitle/i }),
    ).toHaveAttribute('href', '/docs/?focus=main');
  });

  it('records the destination reading-start intent before activating the vault link', () => {
    openSheet(<AppSettingsMenu mode="local" />, 'workspace');
    fireEvent.click(
      screen.getByRole('link', { name: /nav\.settingsMenu\.vaultTitle/i }),
    );

    expect(mocks.rememberRouteFocusIntent).toHaveBeenCalledWith('/docs/');
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

  it('C14 — scrim and panel mount in the same tick with same-frame enter motion', () => {
    // No lazy chunk gates the panel: the moment the sheet opens, BOTH the scrim
    // and the panel are present synchronously (no waitFor), and both carry their
    // --motion-base enter class so they animate in together, not one-frame-late.
    openSheet();
    const overlay = screen.getByTestId('app-settings-overlay');
    const panel = screen.getByTestId('app-settings-popover');
    expect(overlay).toBeInTheDocument();
    expect(panel).toBeInTheDocument();
    expect(overlay.className).toContain('app-settings-scrim-in');
    expect(panel.className).toContain('app-settings-panel-in');
  });

  it('shows the workspace folder row with a direct open action when no vault is loaded', () => {
    openSheet(undefined, 'workspace');
    expect(screen.getByTestId('app-settings-workspace-folder')).toBeInTheDocument();
    expect(
      screen.getByText('nav.settingsMenu.workspaceFolderEmpty'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('app-settings-open-folder')).toHaveTextContent(
      'nav.settingsMenu.workspaceFolderOpen',
    );
  });

  it('keeps MCP proof long-form OFF the root sheet and behind the agent drill-in', () => {
    openSheet(undefined, 'agent');
    expect(screen.queryByText('nav.settingsMenu.mcpProofTitle')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('app-settings-agent-drillin'));
    expect(screen.getByTestId('app-settings-agent-view')).toBeInTheDocument();
    expect(screen.getByText('nav.settingsMenu.mcpProofTitle')).toBeInTheDocument();
    // 뒤로가기 헤더 — 루트 시트로 복귀.
    fireEvent.click(screen.getByTestId('app-settings-agent-back'));
    expect(screen.getByTestId('app-settings-body')).toBeInTheDocument();
  });

  it('targets the packaged Agent Graph Workflow instead of the active local README', () => {
    expect(AGENT_GRAPH_WORKFLOW_HREF).toBe(
      '/docs/?source=server&sample=dogfood&slug=AGENT-GRAPH-WORKFLOW',
    );
  });

  it('summarizes agent state as a single row value while no vault is loaded', () => {
    openSheet(undefined, 'agent');
    expect(screen.getByTestId('app-settings-agent-summary')).toHaveTextContent(
      'nav.settingsMenu.agentStatusNoVault',
    );
  });

  /**
   * #80 — [AI 연결]은 새 라우트가 아니라 이 시트의 서브뷰다. 브라우저(브리지
   * 없음)에서는 키 입력 필드를 만들지 않고 이유를 설명한다.
   */
  it('opens the AI connection subview from a single root row', () => {
    openSheet(undefined, 'agent');
    expect(screen.getByTestId('app-settings-ai-summary')).toHaveTextContent(
      'settings.ai.chipDesktopOnly',
    );
    fireEvent.click(screen.getByTestId('app-settings-ai-drillin'));
    expect(screen.getByTestId('app-settings-ai-view')).toBeInTheDocument();
    expect(screen.queryByTestId('app-settings-body')).toBeNull();
  });

  /**
   * 지도 오른쪽 도크의 「설정에서 키 등록」이 타는 경로 — 시트가 **닫힌 상태에서**
   * 요청을 받아 곧바로 [AI 연결] 서브뷰로 열린다. 사용자에게 톱니 위치를 말로
   * 알려주는 대신 문을 주기 위한 유일한 연결선이다.
   *
   * `offsetParent` 를 스텁하는 이유: 이 위젯은 폭에 따라 두 트리거로 두 번
   * 마운트되므로 **보이는 쪽만** 응답해야 하고, jsdom 은 레이아웃이 없어 모든
   * 요소가 숨은 것으로 계산된다.
   */
  it('opens straight into the AI subview when another surface asks for it', () => {
    const visible = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get: () => document.body,
    });
    try {
      render(<AppSettingsMenu mode="static" />);
      expect(screen.queryByTestId('app-settings-ai-view')).toBeNull();

      act(() => requestSettingsView('ai'));

      expect(screen.getByTestId('app-settings-ai-view')).toBeInTheDocument();
      expect(screen.queryByTestId('app-settings-body')).toBeNull();
    } finally {
      if (visible) Object.defineProperty(HTMLElement.prototype, 'offsetParent', visible);
      else Reflect.deleteProperty(HTMLElement.prototype, 'offsetParent');
    }
  });

  it('ignores the request when its own trigger is not rendered at this width', () => {
    // 숨은 인스턴스까지 응답하면 같은 시트가 두 겹으로 열린다.
    render(<AppSettingsMenu mode="static" />);
    act(() => requestSettingsView('ai'));
    expect(screen.queryByTestId('app-settings-ai-view')).toBeNull();
  });

  it('renders the honest desktop-only card instead of a key field in the browser', () => {
    openSheet(undefined, 'agent');
    fireEvent.click(screen.getByTestId('app-settings-ai-drillin'));
    expect(screen.getByTestId('ai-connection-web-degraded')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-key-input-anthropic')).toBeNull();
  });

  it('Escape from the AI subview returns to the root sheet, not to the map', () => {
    openSheet(undefined, 'agent');
    fireEvent.click(screen.getByTestId('app-settings-ai-drillin'));
    fireEvent.keyDown(screen.getByTestId('app-settings-ai-view'), { key: 'Escape' });
    expect(screen.getByTestId('app-settings-body')).toBeInTheDocument();
  });

  it('keeps forward and reverse Tab inside the modal settings sheet', async () => {
    openSheet(undefined, 'agent');
    const panel = screen.getByTestId('app-settings-popover');
    const close = screen.getByLabelText('nav.settingsMenu.closeLabel');
    // 시트의 마지막 초점 대상 — [AI 연결] 행이 추가되며 여기로 옮겨졌다(#80).
    const last = screen.getByTestId('app-settings-ai-drillin');

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
    // 에이전트 드릴인은 이제 LNB 의 「AI 에이전트」 절 안에 있다.
    fireEvent.click(screen.getByTestId('app-settings-nav-agent'));
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

// Phase 5 #20/#21 — 개인화 피커(캔버스 배경 3택·노드 아이콘 2택)가 [화면]
// 그룹에 나타나고, 선택이 로컬에 지속되며 aria-checked 로 반영되는지.
describe('AppSettingsMenu appearance pickers (#20/#21)', () => {
  beforeEach(() => {
    mocks.isDesktopRuntime = false;
    window.localStorage.clear();
  });

  /**
   * 설정은 2026-07-29 에 **LNB 2단**이 됐다(소유자 재지시). 절이 다섯이라 드릴인은
   * 값 몇 개를 비교하며 고르는 일에 맞지 않았다 — 매번 뒤로 나갔다 다시 들어가야
   * 했다. 이 헬퍼가 왼쪽 목록을 누르므로, 배선이 끊기면 아래 테스트가 먼저 터진다.
   */
  const openSection = (section: string) => {
    openSheet();
    fireEvent.click(screen.getByTestId(`app-settings-nav-${section}`));
  };

  it('LNB 다섯 절을 모두 싣는다', () => {
    openSheet();
    for (const item of ['screen', 'background', 'footprint', 'workspace', 'agent']) {
      expect(screen.getByTestId(`app-settings-nav-${item}`)).toBeInTheDocument();
    }
  });

  it('첫 화면은 화면 절이고, 다른 절 내용은 아직 없다', () => {
    openSheet();
    expect(screen.getByTestId('app-settings-pane-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('app-settings-canvas-background')).toBeNull();
    expect(screen.queryByTestId('app-settings-footprint')).toBeNull();
  });

  it('배경 절이 4택을 싣는다', () => {
    openSection('background');
    expect(screen.getByTestId('app-settings-canvas-background')).toBeInTheDocument();
    for (const variant of ['dot', 'flow', 'web', 'gravity']) {
      expect(screen.getByTestId(`app-settings-canvas-bg-${variant}`)).toBeInTheDocument();
    }
  });

  /** 아이콘 세트는 지도 밖에도 적용되므로 화면 절에 남는다 — 배경 절로 딸려가면 안 된다. */
  it('노드 아이콘은 화면 절에 있다', () => {
    openSheet();
    expect(screen.getByTestId('app-settings-glyph-set')).toBeInTheDocument();
  });

  it('defaults to dot / geometric selected', () => {
    openSection('background');
    expect(screen.getByTestId('app-settings-canvas-bg-dot')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('app-settings-nav-screen'));
    expect(screen.getByTestId('app-settings-glyph-set-geometric')).toHaveAttribute('aria-checked', 'true');
  });

  it('persists a canvas-background choice and reflects it in aria-checked', () => {
    openSection('background');
    fireEvent.click(screen.getByTestId('app-settings-canvas-bg-flow'));
    expect(screen.getByTestId('app-settings-canvas-bg-flow')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('app-settings-canvas-bg-dot')).toHaveAttribute('aria-checked', 'false');
    expect(window.localStorage.getItem('ontology-atlas:canvas-background:v1')).toBe('flow');
  });

  it('발자국 절은 프리셋이 먼저고 슬라이더는 접혀 있다', () => {
    openSection('footprint');
    expect(screen.getByTestId('app-settings-footprint')).toBeInTheDocument();
    expect(screen.getByTestId('app-settings-footprint-preset-default')).toBeInTheDocument();
    expect(screen.queryByTestId('app-settings-footprint-size')).toBeNull();
    fireEvent.click(screen.getByTestId('app-settings-footprint-detail-toggle'));
    expect(screen.getByTestId('app-settings-footprint-size')).toBeInTheDocument();
  });

  /**
   * 테두리 굵기는 **윤곽선일 때만** 화면에 영향이 있다. 채움 상태에서 노출하면
   * "만져도 안 바뀌는 컨트롤"이 되고, 그건 컨트롤이 거짓말을 하는 것이다.
   */
  it('hides the outline weight slider while the print is filled', () => {
    openSection('footprint');
    fireEvent.click(screen.getByTestId('app-settings-footprint-detail-toggle'));
    expect(screen.queryByTestId('app-settings-footprint-stroke')).toBeNull();
    const fillOptions = within(screen.getByTestId('app-settings-footprint-fill')).getAllByRole('radio');
    fireEvent.click(fillOptions[1]);
    expect(screen.getByTestId('app-settings-footprint-stroke')).toBeInTheDocument();
  });

  it('persists a node-icon set choice and reflects it in aria-checked', () => {
    openSheet();
    fireEvent.click(screen.getByTestId('app-settings-glyph-set-line'));
    expect(screen.getByTestId('app-settings-glyph-set-line')).toHaveAttribute('aria-checked', 'true');
    expect(window.localStorage.getItem('ontology-atlas:glyph-set:v1')).toBe('line');
  });
});


// #72 — 선택한 vault 의 절대 경로 확인/복사/Finder 열기. B2 병합에서
// `VaultToolsMenu` 가 삭제되며 이 표면을 담당하던 `LocalVaultPicker` 가 아무
// 데도 마운트되지 않는 고아가 됐고, 데스크톱 사용자는 "이 vault 가 디스크
// 어디에 있나" 를 확인할 방법을 잃었다(opus5 검수 2026-07-25). 그 컴포넌트는
// 자기 테스트에서 직접 렌더돼 통과하고 있었다 — false-green.
describe('AppSettingsMenu — vault 절대 경로 (#72)', () => {
  beforeEach(() => {
    mocks.vaultRootPath = null;
    mocks.vaultStatus = 'idle';
    mocks.vaultHandleName = null;
    mocks.revealInFinder.mockClear();
    mocks.copyPath.mockClear();
  });

  it('웹(경로 없음)에서는 경로 행이 없다 — 없는 값을 있는 척하지 않는다', () => {
    mocks.vaultStatus = 'loaded';
    mocks.vaultHandleName = 'my-vault';
    openSheet();

    expect(screen.queryByTestId('app-settings-vault-path')).not.toBeInTheDocument();
  });

  it('데스크톱에서 절대 경로를 보여주고 복사/Finder 열기를 제공한다', () => {
    mocks.vaultStatus = 'loaded';
    mocks.vaultHandleName = 'my-vault';
    mocks.vaultRootPath = '/Users/me/Team Vault/docs/ontology';
    openSheet(undefined, 'workspace');

    const row = screen.getByTestId('app-settings-vault-path');
    expect(row).toHaveTextContent('/Users/me/Team Vault/docs/ontology');

    fireEvent.click(screen.getByTestId('app-settings-copy-vault-path'));
    expect(mocks.copyPath).toHaveBeenCalledWith('/Users/me/Team Vault/docs/ontology');

    fireEvent.click(screen.getByTestId('app-settings-reveal-vault-path'));
    expect(mocks.revealInFinder).toHaveBeenCalledWith('/Users/me/Team Vault/docs/ontology');
  });

  it('vault 가 안 열려 있으면 경로 행도 없다', () => {
    mocks.vaultRootPath = '/Users/me/stale';
    openSheet();

    expect(screen.queryByTestId('app-settings-vault-path')).not.toBeInTheDocument();
  });
});
