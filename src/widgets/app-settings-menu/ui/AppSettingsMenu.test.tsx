import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MouseEventHandler, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestSettingsOpen } from '@/shared/lib/surface-requests';
import {
  AGENT_GRAPH_WORKFLOW_HREF,
  AppSettingsMenu,
} from './AppSettingsMenu';

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: false,
  vaultRootPath: null as string | null,
  vaultStatus: 'idle' as string,
  vaultErrorCode: null as string | null,
  vaultErrorMessage: null as string | null,
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

// Rendered without a LocalVaultProvider, so an idle vault is mocked; VaultAgentSetupPanel.test.tsx
// covers the loaded case.
vi.mock('@/entities/vault-session/model/use-agent-server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/use-agent-server')>()),
  useAgentServer: () => ({
    kind: 'unavailable',
    launch: null,
    binaryPath: null,
    reason: 'The bundled MCP server is only available in the installed app.',
  }),
}));
vi.mock('@/entities/vault-session/model/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/LocalVaultProvider')>()),
  useLocalVault: () => ({
    status: mocks.vaultStatus,
    handle: mocks.vaultHandleName ? { name: mocks.vaultHandleName } : null,
    manifest: null,
    agentConfigStatus: null,
    errorMessage: mocks.vaultErrorMessage,
    errorCode: mocks.vaultErrorCode,
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

/** Open the sheet on a section, by clicking the LNB; defaults to the Screen section. */
function openSheet(ui?: ReactNode, section?: string) {
  const view = render(ui ?? <AppSettingsMenu mode="static" />);
  fireEvent.click(screen.getByTestId('app-settings-trigger'));
  if (section && section !== 'screen') fireEvent.click(screen.getByTestId(`app-settings-nav-${section}`));
  return view;
}

/**
 * The workspace docs-vault link (`vaultHref`) routes desktop to `/docs/?intent=local` and the
 * web to `/download/`; `test:desktop:runtime` needs this direct guard.
 */
describe('AppSettingsMenu desktop acquisition boundary', () => {
  beforeEach(() => {
    mocks.isDesktopRuntime = false;
    mocks.rememberRouteFocusIntent.mockClear();
  });

  it('routes the hosted browser vault action to the app download page', () => {
    openSheet(undefined, 'workspace');
    expect(
      screen.getByTestId('app-settings-vault-docs-open'),
    ).toHaveAttribute('href', '/download/?focus=main');
  });

  it('keeps the installed desktop app vault action on the native local picker path', () => {
    mocks.isDesktopRuntime = true;
    openSheet(undefined, 'workspace');
    expect(
      screen.getByTestId('app-settings-vault-docs-open'),
    ).toHaveAttribute('href', '/docs/?intent=local&focus=main');
  });

  it('sends an already-loaded local vault straight back to /docs', () => {
    openSheet(<AppSettingsMenu mode="local" />, 'workspace');
    expect(
      screen.getByTestId('app-settings-vault-docs-open'),
    ).toHaveAttribute('href', '/docs/?focus=main');
  });

  it('records the destination reading-start intent before activating the vault link', () => {
    openSheet(<AppSettingsMenu mode="local" />, 'workspace');
    fireEvent.click(
      screen.getByTestId('app-settings-vault-docs-open'),
    );

    expect(mocks.rememberRouteFocusIntent).toHaveBeenCalledWith('/docs/');
  });
});

/** The default screen has no tabs, no empty panels and no long MCP proof text. */
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

  it('starts a different section at its first control without replacing the dialog or navigation', () => {
    openSheet();
    const dialog = screen.getByRole('dialog');
    const nav = screen.getByTestId('app-settings-nav');
    const screenPane = screen.getByTestId('app-settings-pane-screen');
    screenPane.scrollTop = 180;
    fireEvent.click(screen.getByTestId('app-settings-nav-screen'));
    expect(screenPane.scrollTop).toBe(180);

    const destination = screen.getByTestId('app-settings-nav-notify');
    destination.focus();
    fireEvent.click(destination);
    expect(screen.getByTestId('app-settings-pane-notify').scrollTop).toBe(0);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(screen.getByTestId('app-settings-nav')).toBe(nav);
    expect(destination).toHaveFocus();
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

  it('explains a folder failure by its code, never with the raw exception text', () => {
    const raw =
      'A requested file or directory could not be found at the time an operation was processed.';
    for (const [code, key] of [
      ['path-missing', 'settingsFolder.folderErrorPathMissing'],
      ['permission-denied', 'settingsFolder.folderErrorPermissionDenied'],
      ['root-rejected', 'settingsFolder.folderErrorRootRejected'],
      ['access-failed', 'settingsFolder.folderErrorFallback'],
    ] as const) {
      mocks.vaultStatus = 'error';
      mocks.vaultErrorCode = code;
      mocks.vaultErrorMessage = raw;
      const view = openSheet(undefined, 'workspace');
      const row = screen.getByTestId('app-settings-workspace-folder');
      expect(row, code).toHaveTextContent(key);
      expect(row.textContent, code).not.toContain(raw);
      view.unmount();
    }
    mocks.vaultStatus = 'idle';
    mocks.vaultErrorCode = null;
    mocks.vaultErrorMessage = null;
  });

  it('shows the workspace folder row with a direct open action when no vault is loaded', () => {
    openSheet(undefined, 'workspace');
    expect(screen.getByTestId('app-settings-workspace-folder')).toBeInTheDocument();
    expect(
      screen.getByText('settingsFolder.folderEmpty'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('app-settings-open-folder')).toHaveTextContent(
      'settingsFolder.folderOpen',
    );
  });

  it('keeps doors out of the left list and draws them in the Agents pane', () => {
    openSheet();
    expect(screen.queryByTestId('app-settings-door-mcp')).toBeNull();
    fireEvent.click(screen.getByTestId('app-settings-nav-agents'));
    routerPush.mockClear();
    fireEvent.click(screen.getByTestId('app-settings-door-mcp'));
    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(String(routerPush.mock.calls[0][0])).toContain('/agents/?tab=mcp');
    expect(screen.getByTestId('app-settings-trigger')).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not paint a door row indigo', () => {
    openSheet(undefined, 'agents');
    const row = screen.getByTestId('app-settings-door-mcp');
    expect(row.className).not.toMatch(/bg-\[color:var\(--color-indigo/);
    expect(row.className).not.toMatch(/text-\[color:var\(--color-indigo/);
  });

  it('targets the packaged Agent Graph Workflow instead of the active local README', () => {
    expect(AGENT_GRAPH_WORKFLOW_HREF).toBe(
      '/docs/?source=server&sample=dogfood&slug=AGENT-GRAPH-WORKFLOW',
    );
  });


  it('points at Agents → Models instead of drawing a key pane', () => {
    openSheet(undefined, 'agents');
    expect(screen.queryByTestId('ai-connection-view')).toBeNull();
    const row = screen.getByTestId('app-settings-door-models');
    expect(row).toHaveTextContent('settingsAgents.modelsLabel');
    routerPush.mockClear();
    fireEvent.click(row);
    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(String(routerPush.mock.calls[0][0])).toContain('/agents/?tab=models');
  });

  // An expanded key card collapsing first is `ModelConnectionsPanel`'s contract.
  it('Escape closes the sheet — there is no subview left to back out of', () => {
    openSheet(undefined, 'workspace');
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

  // A scrim and `aria-modal` must agree: either one without the other misleads assistive technology.
  it('has a scrim that agrees with aria-modal', () => {
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
  it('traps Tab inside the modal', async () => {
    openSheet(undefined, 'workspace');
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

  /*
   * WebKit does not focus the clicked `<summary>`, so the sheet must take focus itself or
   * Escape and the Tab trap start from `<body>`.
   */
  it('opened by the mouse, focus lands in the panel; Escape there closes and returns it to the gear', async () => {
    openSheet();
    const trigger = screen.getByTestId('app-settings-trigger');
    const panel = screen.getByTestId('app-settings-popover');
    await waitFor(() => expect(panel).toHaveFocus());

    fireEvent.keyDown(document.activeElement ?? panel, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  // A closed sheet owns no Escape, so the page's own dismissal order still hears it.
  it('with the sheet closed, Escape on the gear reaches the page', async () => {
    const pageEscape = vi.fn();
    render(
      <div onKeyDown={(event) => event.key === 'Escape' && !event.defaultPrevented && pageEscape()}>
        <AppSettingsMenu mode="static" />
      </div>,
    );
    const trigger = screen.getByTestId('app-settings-trigger');
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(pageEscape).toHaveBeenCalledTimes(1);

    // Open, the sheet still takes the key for itself: one Escape, one surface.
    fireEvent.click(trigger);
    const panel = screen.getByTestId('app-settings-popover');
    await waitFor(() => expect(panel).toHaveFocus());
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(pageEscape).toHaveBeenCalledTimes(1);
  });

  /* A click on the dim beside the panel closes the sheet, as it does for every `<Dialog>`. */
  it('a click on the dim outside the panel closes the sheet and returns focus to the gear', async () => {
    openSheet();
    const trigger = screen.getByTestId('app-settings-trigger');
    const overlay = screen.getByTestId('app-settings-overlay');

    // The press itself does not move focus out of the panel.
    expect(fireEvent.mouseDown(overlay)).toBe(false);
    fireEvent.mouseUp(overlay);
    fireEvent.click(overlay);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('a click inside the panel, or a drag from it released over the dim, keeps the sheet open', () => {
    openSheet();
    const trigger = screen.getByTestId('app-settings-trigger');
    const overlay = screen.getByTestId('app-settings-overlay');
    const panel = screen.getByTestId('app-settings-popover');

    fireEvent.mouseDown(panel);
    fireEvent.click(panel);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Down in the panel, up over the dim: the browser dispatches the click on their common
    // ancestor, the scrim.
    fireEvent.mouseDown(panel);
    fireEvent.mouseUp(overlay);
    fireEvent.click(overlay);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  // The guide's autostart guard reads this marker, or a guide would open over settings.
  it('marks the settings dialog for the guide guard', () => {
    openSheet();
    expect(screen.getByTestId('app-settings-popover')).toHaveAttribute(
      'data-surface-role',
      'settings-dock',
    );
  });

  /*
   * A language switch reopens the sheet on the same pane. jsdom lays nothing out, so every
   * element's offsetParent is null; these cases mark the triggers as rendered.
   */
  const renderedTriggers = () =>
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(() => document.body);

  it('reopens the sheet on the same pane after a locale navigation remount', async () => {
    const spy = renderedTriggers();
    const first = render(<AppSettingsMenu mode="static" />);
    fireEvent.click(screen.getByTestId('app-settings-trigger'));
    fireEvent.click(screen.getByTestId('app-settings-nav-map'));
    fireEvent.click(screen.getByTestId('app-settings-nav-screen'));
    fireEvent.click(screen.getByTestId('locale-switch'));
    first.unmount();

    mocks.locale = 'ko';
    render(<AppSettingsMenu mode="static" />);

    await waitFor(() => {
      expect(screen.getByTestId('app-settings-trigger')).toHaveAttribute('aria-expanded', 'true');
    });
    expect(screen.getByTestId('app-settings-pane-screen')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('restores the exact responsive trigger variant when two settings entries remount', async () => {
    const spy = renderedTriggers();
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

    await waitFor(() => expect(chromeTrigger).toHaveAttribute('aria-expanded', 'true'));
    expect(railTrigger).toHaveAttribute('aria-expanded', 'false');
    spy.mockRestore();
  });

  it('a hidden instance does not take the locale intent from the visible one', async () => {
    const first = render(<AppSettingsMenu mode="static" triggerVariant="chrome-tile" />);
    fireEvent.click(screen.getByTestId('app-settings-trigger'));
    fireEvent.click(screen.getByTestId('locale-switch'));
    first.unmount();

    mocks.locale = 'ko';
    // jsdom: offsetParent is null, so this instance counts as not on screen.
    // The reopen check runs on a timer after mount; run it rather than sleep past it.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      render(<AppSettingsMenu mode="static" triggerVariant="chrome-tile" />);
      act(() => {
        vi.runOnlyPendingTimers();
      });
    } finally {
      vi.useRealTimers();
    }
    expect(screen.getByTestId('app-settings-trigger')).toHaveAttribute('aria-expanded', 'false');
    expect(window.sessionStorage.getItem('ontology-atlas:settings-locale-focus')).not.toBeNull();
    window.sessionStorage.clear();
  });
});

describe('AppSettingsMenu screenControls injection', () => {
  it('draws view mode on every screen and INDEX default only where the map injects it', () => {
    openSheet();
    expect(screen.getByTestId('app-settings-view-mode')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('app-settings-nav-map'));
    expect(screen.queryByTestId('app-settings-index-default')).not.toBeInTheDocument();
  });

  it('reports the INDEX choice to the map', () => {
    const onIndexCollapsedChange = vi.fn();
    openSheet(
      <AppSettingsMenu mode="static" screenControls={{ indexCollapsed: false, onIndexCollapsedChange }} />,
      'map',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'nav.settingsMenu.indexDefaultCollapsed' }));
    expect(onIndexCollapsedChange).toHaveBeenCalledWith(true);
  });
});

/** `open`/`onOpenChange` make the sheet controlled, so ⌘K never stacks over it; omitted, it manages itself. */
describe('AppSettingsMenu controlled open', () => {
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

  it('Escape from an agent section closes at once — no intermediate step remains', () => {
    const onOpenChange = vi.fn();
    render(<AppSettingsMenu mode="static" open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByTestId('app-settings-nav-workspace'));
    expect(screen.getByTestId('app-settings-pane-workspace')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('app-settings-popover'), {
      key: 'Escape',
      bubbles: true,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  /** Every pane opens with one head — the section's name and the sentence saying what it decides. */
  it('opens each pane with its own head', () => {
    render(<AppSettingsMenu mode="static" open onOpenChange={vi.fn()} />);
    const screenHead = screen.getByTestId('app-settings-pane-head');
    expect(screenHead).toHaveTextContent('nav.settingsMenu.section.screen');
    expect(screenHead).toHaveTextContent('nav.settingsMenu.sectionPurpose.screen');
    fireEvent.click(screen.getByTestId('app-settings-nav-workspace'));
    const workspaceHead = screen.getByTestId('app-settings-pane-head');
    expect(workspaceHead.querySelector('h3')).toHaveTextContent('nav.settingsMenu.section.workspace');
    expect(workspaceHead).toHaveTextContent('nav.settingsMenu.sectionPurpose.workspace');
  });
});

describe('AppSettingsMenu appearance pickers', () => {
  beforeEach(() => {
    mocks.isDesktopRuntime = false;
    window.localStorage.clear();
  });

  /** Clicks the LNB item, so broken wiring fails the tests below first. */
  const openSection = (section: string) => {
    openSheet();
    fireEvent.click(screen.getByTestId(`app-settings-nav-${section}`));
  };

  /**
   * jsdom computes no layout, so the fixed size is pinned by the size classes being identical
   * in every section.
   */
  it('keeps the dialog size fixed across sections', () => {
    openSheet();
    const panel = screen.getByTestId('app-settings-popover');
    const sizeClasses = () =>
      panel.className
        .split(/\s+/)
        .filter((c) => /^h-\[|^w-\[|^max-h-\[|^max-w-\[/.test(c))
        .sort()
        .join(' ');
    const baseline = sizeClasses();
    expect(baseline, 'the dialog needs a fixed height so content does not size it').toMatch(/(?:^| )h-\[var\(--dialog-h-lg\)\]/);
    expect(baseline, 'the dialog needs a fixed width').toMatch(/(?:^| )w-\[var\(--dialog-w-lg\)\]/);
    for (const item of ['map', 'expand', 'footprint', 'notify', 'agents', 'privacy', 'workspace', 'about']) {
      fireEvent.click(screen.getByTestId(`app-settings-nav-${item}`));
      expect(sizeClasses(), `the dialog size changes in the ${item} section`).toBe(baseline);
    }
  });

  it('groups the left list by where each value lives', () => {
    openSheet();
    const groups = ['computer', 'folder', 'app'].map((scope) =>
      screen.getByTestId(`app-settings-nav-group-${scope}`),
    );
    expect(groups.map((group) => group.querySelectorAll('button').length)).toEqual([7, 1, 1]);
    for (const [index, scope] of ['computer', 'folder', 'app'].entries()) {
      expect(groups[index]!.querySelector('p')).toHaveTextContent(`nav.settingsMenu.scope.${scope}`);
    }
    for (const item of ['screen', 'map', 'expand', 'footprint', 'notify', 'agents', 'privacy', 'workspace', 'about']) {
      const svgs = screen.getByTestId(`app-settings-nav-${item}`).querySelectorAll('svg');
      expect(svgs.length, `the ${item} item needs one icon`).toBe(1);
    }
    expect(screen.getByTestId('app-settings-nav').querySelectorAll('[data-testid^="app-settings-door-"]')).toHaveLength(0);
  });

  // Pinned both ways, so a control in both sections fails too.
  it('places notification controls in Notifications, not Screen', () => {
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
        `${testId} must not stay in the Screen section`,
      ).toBeNull();
    }

    fireEvent.click(screen.getByTestId('app-settings-nav-notify'));
    expect(screen.getByTestId('app-settings-pane-notify')).toBeInTheDocument();
    for (const testId of NOTIFY_CONTROLS) {
      expect(screen.getByTestId(testId), `${testId} must be in the Notifications section`).toBeInTheDocument();
    }
  });

  it('opens on the Screen section without rendering other sections', () => {
    openSheet();
    expect(screen.getByTestId('app-settings-pane-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('app-settings-canvas-background')).toBeNull();
    expect(screen.queryByTestId('app-settings-expand')).toBeNull();
    expect(screen.queryByTestId('app-settings-footprint')).toBeNull();
  });

  it('offers three choices in the Map section', () => {
    openSection('map');
    expect(screen.getByTestId('app-settings-canvas-background')).toBeInTheDocument();
    for (const variant of ['dot', 'web', 'depth']) {
      expect(screen.getByTestId(`app-settings-canvas-bg-${variant}`)).toBeInTheDocument();
    }
  });

  /** The icon set applies outside the map too, so it stays in the screen section — it must not follow the background section. */
  it('places node icons in the Screen section', () => {
    openSheet();
    expect(screen.getByTestId('app-settings-glyph-set')).toBeInTheDocument();
  });

  it('defaults to dot / geometric selected', () => {
    openSection('map');
    expect(screen.getByTestId('app-settings-canvas-bg-dot')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('app-settings-nav-screen'));
    expect(screen.getByTestId('app-settings-glyph-set-geometric')).toHaveAttribute('aria-checked', 'true');
  });

  it('persists a canvas-background choice and reflects it in aria-checked', () => {
    openSection('map');
    fireEvent.click(screen.getByTestId('app-settings-canvas-bg-web'));
    expect(screen.getByTestId('app-settings-canvas-bg-web')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('app-settings-canvas-bg-dot')).toHaveAttribute('aria-checked', 'false');
    expect(window.localStorage.getItem('ontology-atlas:canvas-background:v1')).toBe('web');
  });

  it('shows footprint presets first with sliders collapsed', () => {
    openSection('footprint');
    expect(screen.getByTestId('app-settings-footprint')).toBeInTheDocument();
    expect(screen.getByTestId('app-settings-footprint-preset-default')).toBeInTheDocument();
    expect(screen.queryByTestId('app-settings-footprint-size')).toBeNull();
    fireEvent.click(screen.getByTestId('app-settings-footprint-detail-toggle'));
    expect(screen.getByTestId('app-settings-footprint-size')).toBeInTheDocument();
  });

  it.each([
    ['expand', 'app-settings-expand-batch'],
    ['footprint', 'app-settings-footprint-size'],
  ] as const)('keeps %s detail controls inert during exit and supports reopening', async (section, controlId) => {
    openSection(section);
    const toggle = screen.getByTestId(`app-settings-${section}-detail-toggle`);
    toggle.focus();
    fireEvent.click(toggle);
    const control = screen.getByTestId(controlId);
    const body = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(body).toContainElement(control);
    fireEvent.click(toggle);
    expect(body).toHaveAttribute('inert');
    expect(body).toHaveAttribute('aria-hidden', 'true');
    expect(control).toBeInTheDocument();
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);
    expect(body).not.toHaveAttribute('inert');
    expect(screen.getByTestId(controlId)).toBe(control);
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.queryByTestId(controlId)).not.toBeInTheDocument());
  });

  it('offers three affordances, four structures and three sliders in the Expand section', () => {
    openSection('expand');
    expect(screen.getByTestId('app-settings-expand')).toBeInTheDocument();
    for (const value of ['pill', 'bar', 'badge']) {
      expect(screen.getByTestId(`app-settings-expand-affordance-${value}`)).toBeInTheDocument();
    }
    for (const value of ['disc', 'fan', 'ring', 'column']) {
      expect(screen.getByTestId(`app-settings-expand-structure-${value}`)).toBeInTheDocument();
    }
    // The three numbers start collapsed behind the two decisions, as in Footprints.
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

  it("omits the mockup's vault size setting", () => {
    openSection('expand');
    for (const value of ['small', 'real', 'huge']) {
      expect(screen.queryByTestId(`app-settings-expand-scale-${value}`)).toBeNull();
    }
  });

  it("uses the mockup's slider ranges", () => {
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

  // The default value itself is pinned in tests/contract/expand-settings.contract.test.ts.
  it('defaults the affordance to the overhead bar', () => {
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

  it('saves a chosen affordance and updates aria-checked', () => {
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
  it('updates the description for the chosen affordance and structure', () => {
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

  it('offers no footprint control for a retired mark', () => {
    openSection('footprint');
    fireEvent.click(screen.getByTestId('app-settings-footprint-detail-toggle'));
    for (const retired of ['fill', 'stroke', 'bloom', 'on-edges', 'density', 'placement']) {
      expect(
        screen.queryByTestId(`app-settings-footprint-${retired}`),
        `app-settings-footprint-${retired} controls a mark that is no longer drawn`,
      ).toBeNull();
    }
    // The four that still reach the canvas stay reachable.
    for (const live of ['size', 'gap', 'opacity', 'tone']) {
      expect(screen.getByTestId(`app-settings-footprint-${live}`)).toBeInTheDocument();
    }
  });

  it('persists a node-icon set choice and reflects it in aria-checked', () => {
    openSheet();
    fireEvent.click(screen.getByTestId('app-settings-glyph-set-line'));
    expect(screen.getByTestId('app-settings-glyph-set-line')).toHaveAttribute('aria-checked', 'true');
    expect(window.localStorage.getItem('ontology-atlas:glyph-set:v1')).toBe('line');
  });
});


describe('AppSettingsMenu vault absolute path', () => {
  beforeEach(() => {
    mocks.vaultRootPath = null;
    mocks.vaultStatus = 'idle';
    mocks.vaultHandleName = null;
    mocks.revealInFinder.mockClear();
    mocks.copyPath.mockClear();
  });

  it('omits the path row on the web, where there is no path', () => {
    mocks.vaultStatus = 'loaded';
    mocks.vaultHandleName = 'my-vault';
    openSheet();

    expect(screen.queryByTestId('app-settings-vault-path')).not.toBeInTheDocument();
  });

  it('shows the absolute path with copy and reveal-in-Finder on desktop', () => {
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

  it('omits the path row when no vault is open', () => {
    mocks.vaultRootPath = '/Users/me/stale';
    openSheet();

    expect(screen.queryByTestId('app-settings-vault-path')).not.toBeInTheDocument();
  });
});

describe('AppSettingsMenu import module placement', () => {
  it('renders the import module in the Ontology folder pane', () => {
    const source = readFileSync(join(__dirname, 'panes', 'WorkspacePane.tsx'), 'utf-8');
    expect(source).toContain('<BlockImportModule');
  });
});

describe('AppSettingsMenu search and requests', () => {
  beforeEach(() => {
    mocks.isDesktopRuntime = false;
    mocks.locale = 'en';
    window.sessionStorage.clear();
    routerPush.mockClear();
  });

  const type = (value: string) =>
    fireEvent.change(screen.getByTestId('app-settings-search'), { target: { value } });

  it('replaces the pane with results and leaves for a door result in one press', () => {
    openSheet();
    type('settingsAgents.modelsLabel');
    expect(screen.getByTestId('app-settings-pane-search')).toBeInTheDocument();
    expect(screen.queryByTestId('app-settings-pane-head')).toBeNull();
    fireEvent.keyDown(screen.getByTestId('app-settings-search'), { key: 'Enter' });
    expect(String(routerPush.mock.calls[0][0])).toContain('/agents/?tab=models');
    expect(screen.getByTestId('app-settings-trigger')).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a setting result on its pane and focuses its control', async () => {
    openSheet();
    type('nav.settingsMenu.canvasBgLabel');
    fireEvent.keyDown(screen.getByTestId('app-settings-search'), { key: 'Enter' });
    expect(screen.getByTestId('app-settings-pane-map')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement?.closest('[data-setting-id="canvas-background"]')).not.toBeNull(),
    );
  });

  it('offers no app-only result on the web', () => {
    openSheet();
    type('settingsAbout.rows.logs');
    expect(screen.getByTestId('app-settings-search-empty')).toBeInTheDocument();
  });

  it('clears the query on Escape before the sheet closes', () => {
    openSheet();
    type('map');
    fireEvent.keyDown(screen.getByTestId('app-settings-search'), { key: 'Escape' });
    expect(screen.getByTestId('app-settings-trigger')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('app-settings-pane-screen')).toBeInTheDocument();
  });

  it('focuses search on ⌘, while the sheet is open', () => {
    openSheet();
    fireEvent.keyDown(screen.getByTestId('app-settings-popover'), { key: ',', metaKey: true });
    expect(screen.getByTestId('app-settings-search')).toHaveFocus();
  });

  it('opens only a visible instance on a settings request', () => {
    render(<AppSettingsMenu mode="static" />);
    act(() => {
      expect(requestSettingsOpen()).toBe(false);
    });
    expect(screen.getByTestId('app-settings-trigger')).toHaveAttribute('aria-expanded', 'false');
    const spy = vi
      .spyOn(HTMLElement.prototype, 'offsetParent', 'get')
      .mockImplementation(() => document.body);
    act(() => {
      expect(requestSettingsOpen()).toBe(true);
    });
    expect(screen.getByTestId('app-settings-trigger')).toHaveAttribute('aria-expanded', 'true');
    spy.mockRestore();
  });

  it('reopens a retired pane id on the pane that replaced it', async () => {
    window.sessionStorage.setItem(
      'ontology-atlas:settings-locale-focus',
      JSON.stringify({ locale: 'en', triggerVariant: 'header-pill', section: 'background', createdAt: Date.now() }),
    );
    const spy = vi
      .spyOn(HTMLElement.prototype, 'offsetParent', 'get')
      .mockImplementation(() => document.body);
    render(<AppSettingsMenu mode="static" />);
    await waitFor(() => expect(screen.getByTestId('app-settings-pane-map')).toBeInTheDocument());
    spy.mockRestore();
  });
});
