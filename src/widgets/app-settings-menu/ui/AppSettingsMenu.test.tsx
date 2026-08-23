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

// Settings consolidation 2026-07-24 — AppSettingsMenu reads the app-wide
// LocalVaultProvider through useLocalVault. This test renders without a provider,
// so an idle vault is mocked (the agent detail panel appears only with a loaded
// vault, and VaultAgentSetupPanel.test.tsx covers that separately).
vi.mock('@/features/docs-vault-local', () => ({
  // The bundled MCP server is visible only in the installed app — jsdom is in the same position as a web session.
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

const routerPush = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
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
 * Open the sheet. When settings became a **two-column LNB** on 2026-07-29,
 * anything outside the screen section required clicking the left list — hence the
 * section argument. It defaults to the first screen (the screen section).
 */
function openSheet(
  ui?: ReactNode,
  section?: 'screen' | 'background' | 'expand' | 'footprint' | 'workspace' | 'ai',
) {
  render(ui ?? <AppSettingsMenu mode="static" />);
  fireEvent.click(screen.getByTestId('app-settings-trigger'));
  if (section && section !== 'screen') fireEvent.click(screen.getByTestId(`app-settings-nav-${section}`));
}

/**
 * `OperationsNav`'s standalone `ModeBadge` demo-link owned this hosted-vs-
 * installed routing decision — its exact
 * `isDesktopRuntime ? '/docs/?intent=local' : '/download/'` branch lives in this
 * widget's [workspace] docs-vault link row (`vaultHref`). `test:desktop:runtime`
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
 * Settings consolidation 2026-07-24 (owner instruction) — the five-tab modal was
 * retired. A single-column sheet holds the [screen] [workspace] [AI agent] groups
 * on one screen, and the MCP detail moves behind a drill-in subview. Guards that
 * the default screen has zero tabs, zero empty panels and no long MCP proof text.
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
   * ⚠️ **This section left the sheet on 2026-08-21** (ledger 90). The old check was
   * "one click reaches the agent section inside this sheet", and that place is now
   * the "Agent" destination.
   *
   * So what is pinned here changes: **a signpost stands where it left, and it sends
   * you to the destination.** `surfaces.md`'s "Blocking only half is the worst option" is the basis — removed from the nav, the way in
   * still has to answer.
   */
  it('빠져나간 자리에 이정표가 서서 목적지로 보낸다', () => {
    openSheet();
    // The section itself is no longer in the sheet.
    expect(screen.queryByTestId('app-settings-nav-runtimes')).toBeNull();
    expect(screen.queryByTestId('app-settings-pane-agent')).toBeNull();
    // The long proof packet is not in the sheet either — the destination took it.
    expect(screen.queryByText('nav.settingsMenu.mcpProofTitle')).not.toBeInTheDocument();

    routerPush.mockClear();
    fireEvent.click(screen.getByTestId('app-settings-nav-agents'));
    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(String(routerPush.mock.calls[0][0])).toContain('/agents/');
  });

  /**
   * The hierarchy seat's prescription: **this row is not this sheet's
   * protagonist.** The winner is "Open Conversation" inside the destination, and the
   * signpost must not compete with it.
   */
  it('이정표 행은 인디고를 쓰지 않는다', () => {
    openSheet();
    const row = screen.getByTestId('app-settings-nav-agents');
    // The focus ring's indigo is an app-wide specification and is not measured — what is measured is **surface and text**.
    expect(row.className).not.toMatch(/bg-\[color:var\(--color-indigo/);
    expect(row.className).not.toMatch(/text-\[color:var\(--color-indigo/);
  });

  it('targets the packaged Agent Graph Workflow instead of the active local README', () => {
    expect(AGENT_GRAPH_WORKFLOW_HREF).toBe(
      '/docs/?source=server&sample=dogfood&slug=AGENT-GRAPH-WORKFLOW',
    );
  });

  /*
   * ⚠️ The "No Vault Notice" and "Open Folder Here" checks **moved to**
   * `AgentSetupSection.test.tsx` on 2026-08-21, because that screen left the sheet
   * (ledger 90). They were not deleted but followed — left here they would go on
   * measuring something this sheet does not draw.
   */

  /**
   * #80 — [AI Connection] is a subview of this sheet, not a new route. In a browser (no
   * bridge) it builds no key input field and explains why.
   */
  it('opens the in-app agent destination from its own LNB row', () => {
    openSheet(undefined, 'ai');
    expect(screen.getByTestId('app-settings-pane-ai')).toBeInTheDocument();
    expect(screen.getByTestId('ai-connection-view')).toBeInTheDocument();
    // It is a pane, not a subview — the list is still there.
    expect(screen.getByTestId('app-settings-body')).toBeInTheDocument();
  });

  /**
   * The path the settings window's "Register Key in Settings" takes — the request arrives
   * **while the sheet is closed** and it opens straight into the [AI Connection] subview.
   * It is the one wire that gives the user a door instead of telling them where the
   * gear is.
   *
   * Why `offsetParent` is stubbed: this widget mounts twice depending on width, so
   * **only the visible one** may respond, and jsdom has no layout so every element
   * computes as hidden.
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
    // If a hidden instance responded too, the same sheet would open twice over.
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
   * The Esc order became one rung — with no subview there is no intermediate layer
   * to back out of. (The contract that an expanded key input card collapses first
   * is owned by `AiConnectionPanel`.)
   */
  it('Escape closes the sheet — there is no subview left to back out of', () => {
    openSheet(undefined, 'ai');
    fireEvent.keyDown(screen.getByTestId('app-settings-popover'), {
      key: 'Escape',
      bubbles: true,
    });
    // The drawing survives one more frame during exit presence, so this measures **state**.
    expect(screen.getByTestId('app-settings-trigger')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  /**
   * ## This surface changed position and nature four times — the test pins **the current one**
   *
   * ① centre modal → ② right non-modal dock → ③ centre non-modal →
   * ④ **centre modal plus dim** (owner, 2026-07-30, referencing Claude desktop's
   * settings).
   *
   * The reason for ② was "The settings window covers the map" — the "Map Background" and "Footprint" sections promise "change it and the map
   * updates immediately" while covering that map.
   *
   * **In ④ that reason disappeared.** Both sections already carry a **live preview
   * inside the panel** (`FootprintPreview` uses the same renderer as the map, and
   * the background swatches use the real `--canvas-bg-*` tokens). Seeing the result
   * while changing a value was being solved by the preview, not the map, and the
   * dock was sacrificing position for a problem already solved.
   *
   * So what the check below holds is that **the dim actually exists and that fact
   * agrees with `aria-modal`**. That agreement is where this surface went wrong
   * repeatedly — setting `aria-modal` while non-modal is a lie, and not setting it
   * while modal leaves assistive technology unaware of the blocking.
   */
  it('딤이 있고, 그 사실과 aria-modal 이 일치한다', () => {
    openSheet();
    const overlay = screen.getByTestId('app-settings-overlay');
    const panel = screen.getByTestId('app-settings-popover');

    // What is behind really does darken — which is what makes the blocking claim true.
    expect(overlay.className).toContain('backdrop-medium');
    // The dim must receive pointer events for the outside to be genuinely blocked.
    // With `pointer-events-none` the screen is merely dark and clicks pass through,
    // so what is seen and what happens disagree.
    expect(overlay.className).not.toContain('pointer-events-none');
    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(panel).toHaveAttribute('role', 'dialog');
  });

  /** Modal means focus stays inside — Tab escaping behind the dim makes the blocking half-real. */
  it('모달이므로 Tab 이 창 안에 머문다', async () => {
    openSheet(undefined, 'ai');
    const panel = screen.getByTestId('app-settings-popover');
    // The last focusable differs per section, so **the end of DOM order** is picked
    // each time — pinning a named control would break this test falsely whenever a
    // section's composition changes.
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const last = focusables[focusables.length - 1];

    await waitFor(() => expect(panel).toHaveFocus());
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    // With the trap alive, focus does not stay on the last item but wraps forward.
    expect(last).not.toHaveFocus();
  });

  /**
   * The guide's autostart guard used `aria-modal` to decide "already in conversation
   * with another surface". The settings window lost that attribute, so without a
   * marker to carry it, a guide would appear over settings.
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
 * screenControls — the screen-state rows only the map (HomePage) injects (view mode,
 * INDEX default state). On pages that do not inject them the rows do not exist.
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
 * P3 defect ⑥ (full usability review, 2026-07-23) — the prescription for the search
 * palette (⌘K) stacking over this dialog. Passing `open`/`onOpenChange` makes it
 * controlled; omitting them keeps the previous self-managed behaviour (backwards
 * compatible).
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
   * Since A-3 this sheet's Esc order is **one rung**. There used to be a drill-in
   * subview, so the first Esc retreated to the root and the second closed — that
   * intermediate layer is gone, so the first Esc closes.
   */
  it('Escape from an agent section closes at once — no intermediate step remains', () => {
    const onOpenChange = vi.fn();
    render(<AppSettingsMenu mode="static" open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByTestId('app-settings-nav-ai'));
    expect(screen.getByTestId('app-settings-pane-ai')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('app-settings-popover'), {
      key: 'Escape',
      bubbles: true,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// Phase 5 #20/#21 — whether the personalisation pickers (3 canvas backgrounds, 2
// node icon sets) appear in the [screen] group, persist locally, and are reflected
// in aria-checked.
describe('AppSettingsMenu appearance pickers (#20/#21)', () => {
  beforeEach(() => {
    mocks.isDesktopRuntime = false;
    window.localStorage.clear();
  });

  /**
   * Settings became a **two-column LNB** on 2026-07-29 (owner re-instruction). With
   * five sections, drill-in did not suit comparing a handful of values before
   * choosing — it meant going back out and in every time. This helper clicks the
   * left list, so a broken wiring breaks the tests below first.
   */
  const openSection = (section: string) => {
    openSheet();
    fireEvent.click(screen.getByTestId(`app-settings-nav-${section}`));
  };

  /**
   * Owner call: *"It needs sensible
   * width and height and a fixed size."*
   *
   * The height used to follow the content, so the window grew and shrank with every
   * section change. jsdom does not compute layout, so this cannot be measured by
   * rect; it is pinned by **whether the size-deciding classes are the same
   * regardless of section** — the only way this property breaks is "a different class
   * appears in one section", which is exactly what this aims at.
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
    for (const item of ['background', 'expand', 'footprint', 'notify', 'workspace', 'ai']) {
      fireEvent.click(screen.getByTestId(`app-settings-nav-${item}`));
      expect(sizeClasses(), `${item} 절에서 창 크기가 바뀐다`).toBe(baseline);
    }
  });

  /**
   * The LNB has **groups**. A group's job is to say why five items are in that
   * order, and without it the list is just five rows.
   */
  it('LNB 는 세 묶음으로 나뉘고 5·2·1 로 갈린다 (이정표 행 별도)', () => {
    openSheet();
    const nav = screen.getByTestId('app-settings-nav');
    // Pinned by **structure**, not copy — it must not break every time a label is refined.
    const groups = [...nav.children];
    expect(groups.length, '묶음이 셋이 아니다').toBe(3);
    // 「Connected」 went from 3 to 4 on 2026-08-16 (the runners section was added), and
    // a third group 「App」 appeared on 2026-08-20 (the update-check section). What this
    // check holds is not the counts but the structure that **every group has a
    // title** — the counts are a by-product of that structure, updated when a section
    // is added. The 「Connection」 group is 2 items + **1 signpost row** = 3 buttons; the
    // signpost sends you to a destination rather than opening a pane, so the item
    // count and the button count differ.
    expect(groups.map((g) => g.querySelectorAll('button').length)).toEqual([5, 3, 1]);
    for (const g of groups) {
      expect(g.querySelector('p'), '묶음에 제목이 없다 — 그러면 그냥 열 줄이다').not.toBeNull();
    }
  });

  /**
   * Icons are a scanning channel. If even one is missing, that item alone has to be
   * found by reading, which makes the channel worthless — hence "all five" is the
   * contract.
   */
  it('LNB 항목마다 아이콘이 하나씩 있다', () => {
    openSheet();
    for (const item of ['screen', 'background', 'expand', 'footprint', 'notify', 'workspace', 'ai', 'update']) {
      const svgs = screen.getByTestId(`app-settings-nav-${item}`).querySelectorAll('svg');
      expect(svgs.length, `${item} 항목에 아이콘이 없다`).toBe(1);
    }
  });

  it('LNB 여덟 절을 모두 싣는다', () => {
    openSheet();
    for (const item of ['screen', 'background', 'expand', 'footprint', 'notify', 'workspace', 'ai']) {
      expect(screen.getByTestId(`app-settings-nav-${item}`)).toBeInTheDocument();
    }
  });

  /**
   * The three 「Notifications」 rows **do not go back to 「Screen」** (2026-08-02, owner report).
   *
   * They originally sat at the bottom of the 「Screen」 section, with a comment
   * justifying that position — meaning they were **deliberately there**. So the way
   * back is wide: the next person adding a notification row who attaches it to
   * 「Screen」 trips no check at all (both are legitimate component placements, so there
   * is no literal for lint to see).
   *
   * So **both directions** are pinned: the notification controls must be in the
   * 「Notifications」 section, and must not be in the 「Screen」 section. Pinning only one side lets
   * duplication (present in both) through.
   */
  it('알림 컨트롤은 「알림」 절에 있고 「화면」 절에는 없다', () => {
    const NOTIFY_CONTROLS = [
      'app-settings-agent-status',
      'app-settings-agent-notifications',
      'app-settings-agent-notification-kinds',
    ];
    openSheet();

    // There are none at all on the first screen (the 「Screen」 section).
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

  /** The icon set applies outside the map too, so it stays in the screen section — it must not follow the background section. */
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

  /* ── Expand section (2026-08-01, ported from the mockup `.qa-scratch/proto-expand.html`) ──── */

  it('확장 절은 어포던스 3안 · 구조 4안 · 슬라이더 3개를 싣는다', () => {
    openSection('expand');
    expect(screen.getByTestId('app-settings-expand')).toBeInTheDocument();
    for (const value of ['pill', 'bar', 'badge']) {
      expect(screen.getByTestId(`app-settings-expand-affordance-${value}`)).toBeInTheDocument();
    }
    for (const value of ['disc', 'fan', 'ring', 'column']) {
      expect(screen.getByTestId(`app-settings-expand-structure-${value}`)).toBeInTheDocument();
    }
    // The three numbers **start collapsed** (design audit, 2026-08-02) — six items
    // standing at equal weight make this section read as a list rather than «a place
    // to choose». It reuses the grammar the neighbouring 「Footprints」 already uses
    // (「Manual Adjustment」).
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
   * **The mockup's test load does not come across.** 「Scale」 (small/real/large)
   * was a handle the mockup built to measure itself, not a product setting — landing
   * it here would show users a control for «choosing» the size of their own data.
   */
  it('시안의 「볼트 규모」는 제품 설정에 없다', () => {
    openSection('expand');
    for (const value of ['small', 'real', 'huge']) {
      expect(screen.queryByTestId(`app-settings-expand-scale-${value}`)).toBeNull();
    }
  });

  /**
   * The sliders' bounds are **the mockup's values verbatim**. Narrowing them here
   * would ship screens outside the range the mockup actually measured across its 27
   * combinations.
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
   * **The default affordance is 「Top Bar」** (owner decision, 2026-08-01). This
   * is a value that deliberately changes today's screen, so the contract is whether
   * someone who never touched settings actually receives it — the screen-side
   * contract is measured by rendering in
   * `tests/contract/expand-affordance.contract.test.ts`.
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

  /** One line on what the chosen value does — the names alone do not separate the three. */
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
   * Border width affects the screen **only in outline mode**. Exposing it in the
   * filled state makes it "a control that does nothing when you touch it", and that
   * is a control telling a lie.
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


// #72 — seeing, copying and revealing the selected vault's absolute path. The B2
// merge deleted `VaultToolsMenu`, orphaning the `LocalVaultPicker` that owned this
// surface so that nothing mounted it, and desktop users lost any way to see where
// the vault sits on disk (review 2026-07-25). That component was rendering directly
// in its own test and passing — a false green.
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
 * 「Import nodes from another folder」 lives in
 * **settings → workspace** (moved from the bottom of INDEX, 2026-08-02).
 *
 * It is pinned in both directions — `TopologyIndexPanel.test.tsx` checks "it is not
 * in INDEX" and this case checks "it is in settings". Pinning only one side lets
 * **absent from everywhere** through (the module is self-contained, so deleting one
 * call line makes it vanish silently).
 */
describe('AppSettingsMenu — 가져오기 모듈의 자리', () => {
  it('작업 공간 절이 가져오기 모듈을 싣는다', () => {
    // The module is self-contained and renders itself **only with a loaded vault**,
    // so this test's idle vault mock leaves nothing in the DOM. So it inspects **the
    // wiring itself** rather than the render result — the way this repository handles
    // other self-contained modules.
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
