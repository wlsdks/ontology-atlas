import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
function openSheet(
  ui?: ReactNode,
  section?: 'screen' | 'background' | 'expand' | 'footprint' | 'workspace' | 'agent' | 'ai',
) {
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

  /**
   * A-3 (2026-08-02) — 「내 에이전트 연결」은 **LNB 한 줄**이고 그 내용은 곧바로
   * 오른쪽 칸에 선다. 종전엔 절 안에 요약 2행짜리 복도가 있고 그 행이 서브뷰로
   * 드릴인했다(빈칸 82.5% · 설정 항목 0개 · 드릴인 중 LNB 소실).
   *
   * 이 검사가 잠그는 것 셋: ① MCP 증명 장문은 첫 화면에 없다 ② 한 번의 클릭으로
   * 도착한다 ③ **도착해도 LNB 가 그대로 있다**(뒤로가기 계단 0).
   */
  it('lands the agent destination in one LNB click with the list still on screen', () => {
    openSheet();
    expect(screen.queryByText('nav.settingsMenu.mcpProofTitle')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('app-settings-nav-agent'));
    expect(screen.getByTestId('app-settings-pane-agent')).toBeInTheDocument();
    expect(screen.getByText('nav.settingsMenu.mcpProofTitle')).toBeInTheDocument();
    // 복도도, 뒤로가기도 없다.
    expect(screen.queryByTestId('app-settings-agent-drillin')).toBeNull();
    expect(screen.queryByTestId('app-settings-agent-back')).toBeNull();
    expect(screen.getByTestId('app-settings-nav')).toBeInTheDocument();
  });

  it('targets the packaged Agent Graph Workflow instead of the active local README', () => {
    expect(AGENT_GRAPH_WORKFLOW_HREF).toBe(
      '/docs/?source=server&sample=dogfood&slug=AGENT-GRAPH-WORKFLOW',
    );
  });

  it('says the workspace is not connected instead of drawing an empty setup panel', () => {
    openSheet(undefined, 'agent');
    expect(screen.getByText('nav.settingsMenu.agentStatusNoVault')).toBeInTheDocument();
  });

  /**
   * **요구하는 행동을 그 자리에서 할 수 있어야 한다** (2026-08-11, 북극성 워크스루 실측).
   *
   * 이 카드는 *"작업공간 폴더를 열면 …"* 이라고 폴더를 열라고 말하는데, 그 칸에서 누를
   * 수 있는 것은 「첫 호출 안내 복사」 하나뿐이었다(실측: 그 밖 컨트롤 2개, 폴더 열기 0개).
   * 폴더 열기는 **옆 칸**(작업 공간)에 있었다 — 화면이 시킨 일을 그 화면에서 못 한다.
   *
   * 이 저장소가 이미 정해 둔 강등 카드 계약이 「왜 + **어디서 되는지**」인데, 이 카드는
   * 왜만 말하고 어디로는 안 말했다. 한 번 더 찾게 만들 이유가 없으니 **그 자리에서**
   * 열게 한다.
   */
  it('폴더를 열라고 말하는 카드는 그 자리에서 폴더를 열 수 있다', () => {
    openSheet(undefined, 'agent');
    expect(screen.getByTestId('app-settings-agent-open-folder')).toBeInTheDocument();
  });

  /**
   * #80 — [AI 연결]은 새 라우트가 아니라 이 시트의 서브뷰다. 브라우저(브리지
   * 없음)에서는 키 입력 필드를 만들지 않고 이유를 설명한다.
   */
  it('opens the in-app agent destination from its own LNB row', () => {
    openSheet(undefined, 'ai');
    expect(screen.getByTestId('app-settings-pane-ai')).toBeInTheDocument();
    expect(screen.getByTestId('ai-connection-view')).toBeInTheDocument();
    // 서브뷰가 아니라 칸이다 — 목록은 그대로 있다.
    expect(screen.getByTestId('app-settings-body')).toBeInTheDocument();
  });

  /**
   * 설정 창의 「설정에서 키 등록」이 타는 경로 — 시트가 **닫힌 상태에서**
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
      expect(screen.queryByTestId('app-settings-pane-ai')).toBeNull();

      act(() => requestSettingsView('ai'));

      expect(screen.getByTestId('app-settings-pane-ai')).toBeInTheDocument();
      expect(screen.getByTestId('app-settings-body')).toBeInTheDocument();
    } finally {
      if (visible) Object.defineProperty(HTMLElement.prototype, 'offsetParent', visible);
      else Reflect.deleteProperty(HTMLElement.prototype, 'offsetParent');
    }
  });

  it('ignores the request when its own trigger is not rendered at this width', () => {
    // 숨은 인스턴스까지 응답하면 같은 시트가 두 겹으로 열린다.
    render(<AppSettingsMenu mode="static" />);
    act(() => requestSettingsView('ai'));
    expect(screen.queryByTestId('app-settings-pane-ai')).toBeNull();
  });

  it('renders the honest desktop-only card instead of a key field in the browser', () => {
    openSheet(undefined, 'ai');
    expect(screen.getByTestId('ai-connection-web-degraded')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-key-input-anthropic')).toBeNull();
  });

  /**
   * Esc 사다리가 한 칸이 됐다 — 서브뷰가 없으니 물러날 중간 층도 없다.
   * (안쪽에 펼친 키 입력 카드가 있을 때 그것부터 접는 계약은 `AiConnectionPanel`
   * 이 그대로 소유한다.)
   */
  it('Escape closes the sheet — there is no subview left to back out of', () => {
    openSheet(undefined, 'ai');
    fireEvent.keyDown(screen.getByTestId('app-settings-popover'), {
      key: 'Escape',
      bubbles: true,
    });
    // 퇴장 presence 동안 그림은 한 프레임 더 남으므로 **상태**로 잰다.
    expect(screen.getByTestId('app-settings-trigger')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  /**
   * ## 이 표면은 자리와 성질이 네 번 바뀌었다 — 테스트는 **현행**을 잠근다
   *
   * ① 가운데 모달 → ② 우측 비모달 도크 → ③ 가운데 비모달 →
   * ④ **가운데 모달 + 딤**(소유자 2026-07-30, Claude 데스크톱 설정 참조).
   *
   * ②로 간 이유는 *"설정 창이 지도 가리는거"* 였다 — 「지도 배경」·「발자국」 절이
   * *"바꾸면 지도가 즉시 반영된다"* 를 약속하는데 정작 그 지도를 가렸다.
   *
   * **④에서 그 이유가 사라졌다.** 두 절은 이미 **패널 안에 실시간 미리보기**를
   * 갖고 있다(`FootprintPreview` 는 지도와 같은 렌더러, 배경 스와치는 실제
   * `--canvas-bg-*` 토큰). 값을 만지며 결과를 보는 문제는 지도가 아니라
   * 미리보기가 풀고 있었고, 도크는 이미 풀린 문제를 위해 자리를 희생했다.
   *
   * 그래서 아래 검사가 지키는 것은 **딤이 실제로 존재하고, 그 사실과
   * `aria-modal` 이 일치한다**는 것이다. 이 일치가 이 표면에서 반복해 틀렸던
   * 지점이다 — 비모달 시절에 `aria-modal` 을 걸면 거짓이고, 모달인데 안 걸면
   * 보조기술이 차단 사실을 모른다.
   */
  it('딤이 있고, 그 사실과 aria-modal 이 일치한다', () => {
    openSheet();
    const overlay = screen.getByTestId('app-settings-overlay');
    const panel = screen.getByTestId('app-settings-popover');

    // 뒤가 실제로 어두워진다 — 그래서 차단 주장이 참이 된다.
    expect(overlay.className).toContain('backdrop-medium');
    // 딤이 포인터를 받아야 바깥이 실제로 막힌다. `pointer-events-none` 이면
    // 화면만 어둡고 클릭은 통과해, 보이는 것과 되는 것이 어긋난다.
    expect(overlay.className).not.toContain('pointer-events-none');
    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(panel).toHaveAttribute('role', 'dialog');
  });

  /** 모달이면 초점도 안에 머문다 — 딤 뒤로 Tab 이 빠져나가면 차단이 반쪽이다. */
  it('모달이므로 Tab 이 창 안에 머문다', async () => {
    openSheet(undefined, 'agent');
    const panel = screen.getByTestId('app-settings-popover');
    // 마지막 초점 대상은 절마다 다르므로 **DOM 순서의 끝**을 그때그때 고른다 —
    // 특정 컨트롤을 이름으로 박으면 절 구성이 바뀔 때마다 테스트가 거짓으로 깨진다.
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const last = focusables[focusables.length - 1];

    await waitFor(() => expect(panel).toHaveFocus());
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    // 트랩이 살아 있으면 마지막 항목에 머물지 않고 앞으로 되감긴다.
    expect(last).not.toHaveFocus();
  });

  /**
   * 가이드 자동 시작 가드는 `aria-modal` 로 "다른 표면과 대화 중"을 판정했다.
   * 설정 창이 그 속성을 잃었으므로 마커로 이어 두지 않으면 설정 위로 안내가 뜬다.
   */
  it('설정 창에 안내 가드용 마커가 있다', () => {
    openSheet();
    expect(screen.getByTestId('app-settings-popover')).toHaveAttribute(
      'data-surface-role',
      'settings-dock',
    );
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
      screen.getByRole('radio', { name: 'nav.settingsMenu.viewModePlain' }),
    );
    expect(sc.onAudiencePlainChange).toHaveBeenCalledWith(true);
    fireEvent.click(
      screen.getByRole('radio', { name: 'nav.settingsMenu.indexDefaultCollapsed' }),
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

  /**
   * A-3 이후 이 시트의 Esc 사다리는 **한 칸**이다. 종전엔 드릴인 서브뷰가
   * 있어서 첫 Esc 가 루트로 물러나고 둘째 Esc 가 닫았다 — 그 중간 층이
   * 사라졌으므로 첫 Esc 가 곧 닫기다.
   */
  it('Escape from an agent section closes at once — no intermediate step remains', () => {
    const onOpenChange = vi.fn();
    render(<AppSettingsMenu mode="static" open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByTestId('app-settings-nav-agent'));
    expect(screen.getByTestId('app-settings-pane-agent')).toBeInTheDocument();
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

  /**
   * 소유자 확정: *"가로 세로 적당한 크기여야하고 고정 사이즈여야함"*.
   *
   * 종전엔 높이가 내용을 따라가서 절을 바꿀 때마다 창이 늘었다 줄었다 했다.
   * jsdom 은 레이아웃을 계산하지 않으므로 rect 로는 못 재고, **크기를 정하는
   * 클래스가 절과 무관하게 같은지**로 잠근다 — 이 성질이 깨지는 방식은
   * "어느 절에서만 다른 클래스가 붙는다" 뿐이라 그걸 정확히 겨눈다.
   */
  it('창 크기는 절을 바꿔도 고정이다', () => {
    openSheet();
    const panel = screen.getByTestId('app-settings-popover');
    const sizeClasses = () =>
      panel.className
        .split(/\s+/)
        .filter((c) => /^h-\[|^w-\[|^max-h-\[|^max-w-\[/.test(c))
        .sort()
        .join(' ');
    const baseline = sizeClasses();
    expect(baseline, '고정 높이가 없다 — 내용이 창 크기를 정하고 있다').toMatch(/h-\[\d+px\]/);
    expect(baseline, '고정 폭이 없다').toMatch(/w-\[\d+px\]/);
    for (const item of ['background', 'expand', 'footprint', 'notify', 'workspace', 'runtimes', 'agent', 'ai']) {
      fireEvent.click(screen.getByTestId(`app-settings-nav-${item}`));
      expect(sizeClasses(), `${item} 절에서 창 크기가 바뀐다`).toBe(baseline);
    }
  });

  /**
   * LNB 는 **묶음**을 가진다. 다섯 항목이 왜 그 순서인지를 말하는 것이 묶음의
   * 일이고, 그게 없으면 목록이 그냥 다섯 줄이다.
   */
  it('LNB 는 두 묶음으로 나뉘고 5·4 로 갈린다', () => {
    openSheet();
    const nav = screen.getByTestId('app-settings-nav');
    // 문구가 아니라 **구조**로 잠근다 — 라벨을 다듬을 때마다 깨지면 안 된다.
    const groups = [...nav.children];
    expect(groups.length, '묶음이 둘이 아니다').toBe(2);
    // 2026-08-16 에 「이어진 것」이 3 → 4 가 됐다(실행기 절 신설). 이 검사가
    // 지키는 것은 개수가 아니라 **묶음이 둘이고 각각 제목이 있다**는 구조다 —
    // 개수는 그 구조의 부수치라 절을 늘릴 때 같이 갱신한다.
    expect(groups.map((g) => g.querySelectorAll('button').length)).toEqual([5, 4]);
    for (const g of groups) {
      expect(g.querySelector('p'), '묶음에 제목이 없다 — 그러면 그냥 일곱 줄이다').not.toBeNull();
    }
  });

  /**
   * 아이콘은 훑기 채널이다. 하나라도 빠지면 그 항목만 글자로 찾아야 해서,
   * 있으나 마나 한 채널이 된다 — 그래서 "다섯 다"가 계약이다.
   */
  it('LNB 항목마다 아이콘이 하나씩 있다', () => {
    openSheet();
    for (const item of ['screen', 'background', 'expand', 'footprint', 'notify', 'workspace', 'runtimes', 'agent', 'ai']) {
      const svgs = screen.getByTestId(`app-settings-nav-${item}`).querySelectorAll('svg');
      expect(svgs.length, `${item} 항목에 아이콘이 없다`).toBe(1);
    }
  });

  it('LNB 여덟 절을 모두 싣는다', () => {
    openSheet();
    for (const item of ['screen', 'background', 'expand', 'footprint', 'notify', 'workspace', 'agent', 'ai']) {
      expect(screen.getByTestId(`app-settings-nav-${item}`)).toBeInTheDocument();
    }
  });

  /**
   * 「알림」 셋은 **「화면」으로 돌아가지 않는다** (2026-08-02, 소유자 지적).
   *
   * 이 셋은 원래 「화면」 절 바닥에 얹혀 있었고, 그 자리를 정당화한 주석까지
   * 있었다 — 즉 **의도적으로 거기 있었다.** 그래서 되돌아갈 길이 넓다: 다음에
   * 알림 관련 행을 하나 더 만드는 사람이 「화면」에 붙이면 아무 검사도 안
   * 걸린다(양쪽 다 정당한 컴포넌트 배치라 lint 가 볼 리터럴이 없다).
   *
   * 그래서 **두 방향을 함께** 잠근다: 알림 컨트롤이 「알림」 절에 있을 것, 그리고
   * 「화면」 절에는 없을 것. 한쪽만 잠그면 복제(양쪽에 다 있는 상태)를 통과시킨다.
   */
  it('알림 컨트롤은 「알림」 절에 있고 「화면」 절에는 없다', () => {
    const NOTIFY_CONTROLS = [
      'app-settings-agent-status',
      'app-settings-agent-notifications',
      'app-settings-agent-notification-kinds',
    ];
    openSheet();

    // 첫 화면(=「화면」 절)에는 하나도 없다.
    expect(screen.getByTestId('app-settings-pane-screen')).toBeInTheDocument();
    for (const testId of NOTIFY_CONTROLS) {
      expect(
        screen.queryByTestId(testId),
        `${testId} 가 「화면」 절에 남아 있다 — 알림은 자기 절로 빠졌다`,
      ).toBeNull();
    }

    fireEvent.click(screen.getByTestId('app-settings-nav-notify'));
    expect(screen.getByTestId('app-settings-pane-notify')).toBeInTheDocument();
    for (const testId of NOTIFY_CONTROLS) {
      expect(screen.getByTestId(testId), `${testId} 가 「알림」 절에 없다`).toBeInTheDocument();
    }
  });

  it('첫 화면은 화면 절이고, 다른 절 내용은 아직 없다', () => {
    openSheet();
    expect(screen.getByTestId('app-settings-pane-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('app-settings-canvas-background')).toBeNull();
    expect(screen.queryByTestId('app-settings-expand')).toBeNull();
    expect(screen.queryByTestId('app-settings-footprint')).toBeNull();
  });

  it('배경 절이 3택을 싣는다', () => {
    openSection('background');
    expect(screen.getByTestId('app-settings-canvas-background')).toBeInTheDocument();
    for (const variant of ['dot', 'web', 'depth']) {
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
    fireEvent.click(screen.getByTestId('app-settings-canvas-bg-web'));
    expect(screen.getByTestId('app-settings-canvas-bg-web')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('app-settings-canvas-bg-dot')).toHaveAttribute('aria-checked', 'false');
    expect(window.localStorage.getItem('ontology-atlas:canvas-background:v1')).toBe('web');
  });

  it('발자국 절은 프리셋이 먼저고 슬라이더는 접혀 있다', () => {
    openSection('footprint');
    expect(screen.getByTestId('app-settings-footprint')).toBeInTheDocument();
    expect(screen.getByTestId('app-settings-footprint-preset-default')).toBeInTheDocument();
    expect(screen.queryByTestId('app-settings-footprint-size')).toBeNull();
    fireEvent.click(screen.getByTestId('app-settings-footprint-detail-toggle'));
    expect(screen.getByTestId('app-settings-footprint-size')).toBeInTheDocument();
  });

  /* ── 확장 절 (2026-08-01, 시안 `.qa-scratch/proto-expand.html` 이식) ──── */

  it('확장 절은 어포던스 3안 · 구조 4안 · 슬라이더 3개를 싣는다', () => {
    openSection('expand');
    expect(screen.getByTestId('app-settings-expand')).toBeInTheDocument();
    for (const value of ['pill', 'bar', 'badge']) {
      expect(screen.getByTestId(`app-settings-expand-affordance-${value}`)).toBeInTheDocument();
    }
    for (const value of ['disc', 'fan', 'ring', 'column']) {
      expect(screen.getByTestId(`app-settings-expand-structure-${value}`)).toBeInTheDocument();
    }
    // 세 숫자는 **접혀서 시작한다**(2026-08-02 디자인 감사) — 여섯 항목이 같은
    // 무게로 나란히 서면 이 절이 「고르는 자리」가 아니라 목록으로 읽힌다.
    // 이웃한 「발자국」이 이미 쓰는 문법(「직접 맞추기」)을 그대로 쓴다.
    for (const id of [
      'app-settings-expand-batch',
      'app-settings-expand-label-attempts',
      'app-settings-expand-max-open',
    ]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    fireEvent.click(screen.getByTestId('app-settings-expand-detail-toggle'));
    for (const id of [
      'app-settings-expand-batch',
      'app-settings-expand-label-attempts',
      'app-settings-expand-max-open',
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  /**
   * **시안 전용 시험 부하는 옮기지 않는다.** 시안의 「볼트 규모」(작음/실제/큼)는
   * 자기를 재려고 만든 손잡이지 제품 설정이 아니다 — 그게 여기 들어오면 사용자가
   * 자기 데이터의 크기를 «고르는» 컨트롤을 보게 된다.
   */
  it('시안의 「볼트 규모」는 제품 설정에 없다', () => {
    openSection('expand');
    for (const value of ['small', 'real', 'huge']) {
      expect(screen.queryByTestId(`app-settings-expand-scale-${value}`)).toBeNull();
    }
  });

  /**
   * 슬라이더 상·하한은 **시안 값 그대로**다. 여기서 좁히면 시안이 27조합을
   * 실측하며 확인한 범위 밖의 화면만 제품에 남는다.
   */
  it('슬라이더 범위가 시안 값과 같다', () => {
    openSection('expand');
    fireEvent.click(screen.getByTestId('app-settings-expand-detail-toggle'));
    const range = (id: string) => {
      const el = screen.getByTestId(id) as HTMLInputElement;
      return [el.min, el.max];
    };
    expect(range('app-settings-expand-batch')).toEqual(['4', '24']);
    expect(range('app-settings-expand-label-attempts')).toEqual(['3', '40']);
    expect(range('app-settings-expand-max-open')).toEqual(['1', '6']);
  });

  /**
   * **기본 어포던스는 「머리 위 막대」다** (소유자 결정 2026-08-01). 이건 오늘
   * 화면을 의도적으로 바꾸는 값이라, 설정을 한 번도 안 건드린 사람이 실제로 그
   * 값을 받는지가 계약이다 — 화면 쪽 계약은
   * `tests/contract/expand-affordance.contract.test.ts` 가 렌더로 잰다.
   */
  it('설정을 안 건드리면 어포던스는 「머리 위 막대」다', () => {
    openSection('expand');
    expect(screen.getByTestId('app-settings-expand-affordance-bar')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByTestId('app-settings-expand-affordance-pill')).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('어포던스를 고르면 저장되고 aria-checked 가 따라간다', () => {
    openSection('expand');
    fireEvent.click(screen.getByTestId('app-settings-expand-affordance-badge'));
    expect(screen.getByTestId('app-settings-expand-affordance-badge')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(
      JSON.parse(window.localStorage.getItem('ontology-atlas:expand:v1') ?? '{}').affordance,
    ).toBe('badge');
  });

  /** 고른 값이 무엇을 하는지 한 줄로 말한다 — 이름만으로는 셋이 안 갈린다. */
  it('고른 어포던스·구조의 설명이 바뀐다', () => {
    openSection('expand');
    const hint = () => screen.getByTestId('app-settings-expand-affordance-hint').textContent;
    const before = hint();
    fireEvent.click(screen.getByTestId('app-settings-expand-affordance-pill'));
    expect(hint()).not.toBe(before);
    const structureHint = () =>
      screen.getByTestId('app-settings-expand-structure-hint').textContent;
    const structureBefore = structureHint();
    fireEvent.click(screen.getByTestId('app-settings-expand-structure-ring'));
    expect(structureHint()).not.toBe(structureBefore);
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

/**
 * 「다른 폴더에서 노드 가져오기」는 **설정 → 작업 공간**에 있다 (2026-08-02
 * 이관, INDEX 바닥에서 옮겨 옴).
 *
 * 양방향으로 잠근다 — `TopologyIndexPanel.test.tsx` 가 「INDEX 에는 없다」를,
 * 이 케이스가 「설정에는 있다」를 본다. 한쪽만 잠그면 **아무 데도 없는 상태**를
 * 통과시킨다(모듈이 자립형이라 호출 한 줄만 지우면 조용히 사라진다).
 */
describe('AppSettingsMenu — 가져오기 모듈의 자리', () => {
  it('작업 공간 절이 가져오기 모듈을 싣는다', () => {
    // 모듈은 **vault 가 로드된 상태에서만** 스스로 렌더하는 자립형이라, 이
    // 테스트의 idle vault 목에서는 DOM 에 아무것도 안 남는다. 그래서 렌더 결과가
    // 아니라 **배선 자체**를 본다 — 이 저장소가 다른 자립 모듈에도 쓰는 방식이다.
    const source = readFileSync(
      join(__dirname, 'AppSettingsMenu.tsx'),
      'utf-8',
    );
    const workspaceBranch = source.slice(
      source.indexOf("section === 'workspace' ?"),
      source.indexOf("section === 'agent' ?"),
    );
    expect(workspaceBranch, '작업 공간 절이 없다').not.toBe('');
    expect(
      workspaceBranch,
      '가져오기 모듈이 작업 공간 절에서 사라졌다 — INDEX 로 되돌아갔거나 통째로 없어졌다',
    ).toContain('<BlockImportModule />');
  });
});
