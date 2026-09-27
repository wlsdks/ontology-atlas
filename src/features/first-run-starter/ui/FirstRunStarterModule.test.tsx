import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSampleSourceCacheForTests } from '@/shared/lib/sample-source';
import { FIRST_RUN_STARTER_DISMISSED_KEY } from '../model/first-run-starter-dismiss';
import { FirstRunStarterModule } from './FirstRunStarterModule';

interface MockVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  errorMessage: string | null;
  restoreAttempted: boolean;
  /** Decides who the sample notice targets. */
  recentVaults: unknown[];
  open: ReturnType<typeof vi.fn>;
  openRecent: ReturnType<typeof vi.fn>;
  scaffoldOntology: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  vault: null as unknown as MockVault,
  mode: 'static' as 'static' | 'local',
  desktop: true,
  requestAgentChat: vi.fn(),
  pickedProject: '/Users/dana/my-product' as string | null,
  pickerThrows: false,
  ensureChildDir: vi.fn(async (_root: string, _name: string) => undefined),
}));

vi.mock('@/shared/lib/tauri-vault-fs', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/tauri-vault-fs')>(
    '@/shared/lib/tauri-vault-fs',
  );
  return {
    ...actual,
    isTauriVaultRuntime: () => true,
    getTauriVaultRootPath: () => mocks.pickedProject,
    createTauriVaultHandle: (rootPath: string) => ({ name: rootPath }),
    pickTauriVaultDirectory: async () => {
      if (mocks.pickerThrows) throw new Error('picker exploded');
      return mocks.pickedProject === null ? null : { name: 'picked' };
    },
    listTauriDirectoryNames: async () => ['src', 'package.json'],
    ensureTauriChildDirectory: (root: string, name: string) => mocks.ensureChildDir(root, name),
  };
});

vi.mock('@/entities/vault-session/model/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/LocalVaultProvider')>()),
  useLocalVault: () => mocks.vault,
}));
vi.mock('@/entities/vault-session/model/use-data-source-mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/use-data-source-mode')>()),
  useDataSourceMode: () => mocks.mode,
}));

vi.mock('@/shared/lib/desktop-shell', () => ({
  isDesktopShell: () => mocks.desktop,
}));

vi.mock('@/shared/lib/agent-chat-intent', () => ({
  requestAgentChat: (...args: unknown[]) => mocks.requestAgentChat(...args),
}));

// Exit-frame scheduling is owned by dialog.test.tsx and the real-browser transient-surface
// contract, so presence follows React state here instead of retaining exiting children.
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'ko',
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function makeVault(): MockVault {
  return {
    status: 'idle',
    manifest: null,
    errorMessage: null,
    restoreAttempted: true,
    recentVaults: [],
    open: vi.fn(async () => ({ opened: false, starterWritten: 0, starterError: null })),
    openRecent: vi.fn(async () => undefined),
    scaffoldOntology: vi.fn(async () => ({ created: 8, skipped: 0 })),
  };
}

describe('FirstRunStarterModule', () => {
  beforeEach(() => {
    mocks.vault = makeVault();
    mocks.mode = 'static';
    mocks.desktop = true;
    mocks.requestAgentChat.mockClear();
    mocks.ensureChildDir.mockClear();
    mocks.pickedProject = '/Users/dana/my-product';
    mocks.pickerThrows = false;
    window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
    window.localStorage.removeItem('demo:sample-source:v1');
    // Clearing storage clears the module cache too, so no test leans on the previous one.
    resetSampleSourceCacheForTests();
    window.localStorage.setItem('vault-open-guide:auto:v1', '1');
  });

  // The census arrives as props, so no hardcoded number is drawn.
  it('renders the real census as a caption line, not a meter block', () => {
    render(<FirstRunStarterModule concepts={102} relations={478} domains={6} />);

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    const scale = screen.getByTestId('first-run-starter-sample-scale');
    expect(scale).toHaveTextContent('sampleScale');
    expect(screen.queryByText('102')).not.toBeInTheDocument();
    expect(screen.queryByText('478')).not.toBeInTheDocument();
  });

  it('names the agent audience once in the lead paragraph', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    expect(screen.getByTestId('first-run-starter-agent-clause')).toHaveTextContent(
      'agentClause',
    );
  });

  // `⌘O` is bound to the meta key only, so non-Apple platforms must not advertise it.
  it('hides the ⌘O badge on non-Apple platforms', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    expect(screen.getByTestId('first-run-starter-open')).not.toHaveTextContent('⌘O');
  });

  it('shows the ⌘O badge on Apple platforms', () => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, 'platform');
    Object.defineProperty(window.navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
    });
    try {
      render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
      expect(screen.getByTestId('first-run-starter-open')).toHaveTextContent('⌘O');
    } finally {
      if (original) Object.defineProperty(window.navigator, 'platform', original);
    }
  });

  it('renders the tour CTA when onStartTour is provided and routes the click', () => {
    const onStartTour = vi.fn();
    render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1} onStartTour={onStartTour} />,
    );
    const cta = screen.getByTestId('first-run-tour-cta');
    fireEvent.click(cta);
    expect(onStartTour).toHaveBeenCalledTimes(1);
  });

  it('renders no tour CTA when onStartTour is omitted', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    expect(screen.queryByTestId('first-run-tour-cta')).not.toBeInTheDocument();
  });

  // With the callback the plain-mode hint is a toggle; with plain mode on nothing shows; without
  // the callback the hint sentence remains.
  it('promotes the plain-mode hint to a one-click toggle when the callback is provided', () => {
    const onEnablePlainMode = vi.fn();
    render(
      <FirstRunStarterModule
        concepts={1}
        relations={1}
        domains={1}
        onEnablePlainMode={onEnablePlainMode}
      />,
    );
    expect(screen.queryByTestId('first-run-starter-plain-mode-hint')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('first-run-plain-toggle'));
    expect(onEnablePlainMode).toHaveBeenCalledTimes(1);
  });

  it('hides the plain-mode toggle entirely once plain mode is already on', () => {
    render(
      <FirstRunStarterModule
        concepts={1}
        relations={1}
        domains={1}
        onEnablePlainMode={vi.fn()}
        audiencePlain
      />,
    );
    expect(screen.queryByTestId('first-run-plain-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-run-starter-plain-mode-hint')).not.toBeInTheDocument();
  });

  it('renders a brand wordmark line above the first-run caption', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    expect(screen.getByTestId('first-run-starter-brand')).toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-brand')).toHaveTextContent('brand');
  });

  it('does not render once a vault is active (local mode)', () => {
    mocks.mode = 'local';
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  it('does not render before the vault restore attempt has settled', () => {
    mocks.vault.restoreAttempted = false;
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  // `vault.open()` runs only after "choose an existing folder" is confirmed in the sheet.
  it('opens the guide sheet first, then wires "choose existing" to vault.open()', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    fireEvent.click(screen.getByTestId('first-run-starter-open'));
    expect(mocks.vault.open).not.toHaveBeenCalled();
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('vault-guide-pick-existing'));
    expect(mocks.vault.open).toHaveBeenCalledTimes(1);
  });

  it('the sheet\'s "start fresh" opens a folder that is seeded with the starter when empty', async () => {
    mocks.vault.open = vi.fn(async () => ({ opened: true, starterWritten: 12, starterError: null }));
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    fireEvent.click(screen.getByTestId('first-run-starter-create'));
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('vault-guide-create-new'));

    await waitFor(() => {
      expect(mocks.vault.open).toHaveBeenCalledWith({ starter: { locale: 'ko', shape: undefined } });
    });
  });

  it('dismissing hides the module and persists for the session', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    fireEvent.click(screen.getByTestId('first-run-starter-dismiss'));

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(FIRST_RUN_STARTER_DISMISSED_KEY)).toBe('1');
  });

  it('does not render at all on a later mount within the same session', () => {
    window.sessionStorage.setItem(FIRST_RUN_STARTER_DISMISSED_KEY, '1');

    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  it('leaves a quiet reopen row after dismiss and restores the card on click', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    fireEvent.click(screen.getByTestId('first-run-starter-dismiss'));

    const reopen = screen.getByTestId('first-run-starter-reopen');
    fireEvent.click(reopen);

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(FIRST_RUN_STARTER_DISMISSED_KEY)).toBeNull();
  });

  /*
   * The sample signal follows the connection state, not the card: without it a collapsed card
   * leaves a sample screen indistinguishable from a connected vault.
   */
  it('keeps the sample signal alive after the card collapses — both ways', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();

    // Collapse by dismiss.
    fireEvent.click(screen.getByTestId('first-run-starter-dismiss'));
    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-sample-signal')).toBeInTheDocument();

    // Reopen, then collapse by switching the sample source.
    fireEvent.click(screen.getByTestId('first-run-starter-reopen'));
    fireEvent.click(screen.getByTestId('first-run-starter-sample-source-dogfood'));
    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-sample-signal')).toBeInTheDocument();
  });

  // Auto-display is off by default (opt-in), so this turns it on.
  it('auto-opens the folder guide sheet once on the very first visit', () => {
    vi.useFakeTimers();
    window.localStorage.setItem('ontology-atlas:guide-auto-start:v1', '1');
    window.localStorage.removeItem('vault-open-guide:auto:v1');
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    expect(screen.queryByTestId('vault-guide-sheet')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();
    expect(window.localStorage.getItem('vault-open-guide:auto:v1')).toBe('1');
    vi.useRealTimers();
  });

  it('does not auto-open the folder guide sheet on later visits', () => {
    vi.useFakeTimers();
    window.localStorage.setItem('vault-open-guide:auto:v1', '1');
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByTestId('vault-guide-sheet')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  // The capture-phase dismiss handler yields to the modal.
  it('Escape while the guide sheet is open closes the sheet, not the card', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    fireEvent.click(screen.getByTestId('first-run-starter-open'));
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(FIRST_RUN_STARTER_DISMISSED_KEY)).toBeNull();
  });

  it('Escape dismisses the module', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
  });

  // A non-developer's first attention goes elsewhere, so the command is collapsed by default.
  it('keeps the CLI bootstrap command collapsed behind a developer disclosure by default', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    expect(screen.getByTestId('first-run-starter-cli-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run-starter-cli-bridge')).not.toBeInTheDocument();
    expect(
      screen.queryByText('node cli/src/index.mjs init && node cli/src/index.mjs bootstrap'),
    ).not.toBeInTheDocument();
  });

  it('reveals the source-checkout command and says it is source-only when expanded', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    fireEvent.click(screen.getByTestId('first-run-starter-cli-toggle'));

    expect(screen.getByTestId('first-run-starter-cli-bridge')).toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-cli-source-only')).toHaveTextContent(
      'cliBridgeSourceOnly',
    );
    expect(
      screen.getByText('node cli/src/index.mjs init && node cli/src/index.mjs bootstrap'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('npx node $ATLAS/cli/src/index.mjs init && npx node $ATLAS/cli/src/index.mjs bootstrap'),
    ).not.toBeInTheDocument();
  });

  // Full width and wrapped at word boundaries, so the command can be checked before copying.
  it('renders the command as a full-width wrapping code line — never mid-word ellipsis', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    fireEvent.click(screen.getByTestId('first-run-starter-cli-toggle'));

    const code = screen.getByText(
      'node cli/src/index.mjs init && node cli/src/index.mjs bootstrap',
    );
    expect(code.tagName).toBe('CODE');
    expect(code.className).not.toContain('truncate');
    expect(code.className).toContain('whitespace-pre-wrap');
    expect(code.className).toContain('break-words');
  });

  it('demotes both FSA CTAs to an honest notice + download link when the browser is unsupported', () => {
    mocks.vault.status = 'unsupported';
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    expect(screen.queryByTestId('first-run-starter-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-run-starter-create')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-unsupported')).toHaveTextContent('unsupportedNotice');
    expect(screen.getByTestId('first-run-starter-unsupported-cta')).toHaveAttribute(
      'href',
      '/download/',
    );
    expect(screen.getByTestId('first-run-starter-dismiss')).toBeInTheDocument();
  });

  it('renders a quiet nudge toward the plain-mode gear toggle near the dismiss row', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    const hint = screen.getByTestId('first-run-starter-plain-mode-hint');
    expect(hint).toHaveTextContent('plainModeHint');
  });

  // A newcomer sees the example business first; the dogfood vault stays one click away. A click
  // updates the localStorage preference (`useSampleSource`'s source of truth).
  it('renders the sample-source segment defaulting to "storefront" and persists a switch to "dogfood"', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    const dogfoodTab = screen.getByTestId('first-run-starter-sample-source-dogfood');
    const storefrontTab = screen.getByTestId('first-run-starter-sample-source-storefront');
    // An exclusive single selection, hence radiogroup and aria-checked.
    expect(storefrontTab).toHaveAttribute('aria-checked', 'true');
    expect(dogfoodTab).toHaveAttribute('aria-checked', 'false');

    // Choosing a sample collapses the card and hands the space to the INDEX.
    fireEvent.click(dogfoodTab);

    expect(window.localStorage.getItem('demo:sample-source:v1')).toBe('dogfood');
    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-reopen')).toBeInTheDocument();
  });

  it('keeps an explicitly persisted "dogfood" choice after the default flipped', () => {
    window.localStorage.setItem('demo:sample-source:v1', 'dogfood');

    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    expect(screen.getByTestId('first-run-starter-sample-source-dogfood')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  // Re-clicking the current selection does nothing; collapse happens only on a switch.
  it('does not collapse the card when the already-selected source is clicked again', () => {
    render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );

    fireEvent.click(screen.getByTestId('first-run-starter-sample-source-storefront'));

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run-starter-reopen')).not.toBeInTheDocument();
  });

  it('exposes the sample source as an exclusive selection, not a tablist', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    const group = screen.getByTestId('first-run-starter-sample-source');
    /*
     * Side-by-side `aria-pressed` never exposes the exclusivity, so it is a radiogroup.
     */
    expect(group).toHaveAttribute('role', 'radiogroup');
    expect(group.querySelectorAll('[role="tab"]')).toHaveLength(0);
    // One tab stop, the checked radio (roving).
    const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(radios).toHaveLength(2);
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });

  it('renders the storefront tab before the dogfood tab', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    const tabs = screen
      .getByTestId('first-run-starter-sample-source')
      .querySelectorAll('[role="radio"]');
    expect(tabs[0]).toHaveAttribute(
      'data-testid',
      'first-run-starter-sample-source-storefront',
    );
    expect(tabs[1]).toHaveAttribute(
      'data-testid',
      'first-run-starter-sample-source-dogfood',
    );
  });

  it('restores a previously persisted "storefront" sample-source choice on mount', () => {
    window.localStorage.setItem('demo:sample-source:v1', 'storefront');

    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    expect(screen.getByTestId('first-run-starter-sample-source-storefront')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByTestId('first-run-starter-context')).toHaveTextContent(
      'contextStorefront',
    );
    expect(screen.getByTestId('first-run-starter-context')).not.toHaveTextContent(
      'contextRest',
    );
  });

  it('copies the CLI bootstrap command to the clipboard once the disclosure is open', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    fireEvent.click(screen.getByTestId('first-run-starter-cli-toggle'));
    fireEvent.click(screen.getByTestId('first-run-starter-cli-bridge-copy'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        'node cli/src/index.mjs init && node cli/src/index.mjs bootstrap',
      );
    });
  });
});

// The guide card and the INDEX render exclusively, so the panel has one scroller.
describe('FirstRunStarterModule renders the guide or INDEX exclusively', () => {
  // A session dismiss persists across the file, so this describe resets it.
  beforeEach(() => {
    mocks.vault = makeVault();
    mocks.mode = 'static';
    window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
    window.localStorage.removeItem('demo:sample-source:v1');
    window.localStorage.setItem('vault-open-guide:auto:v1', '1');
  });

  it('does not render INDEX children while the guide is expanded', () => {
    render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(screen.queryByTestId('index-body')).not.toBeInTheDocument();
  });

  it('shows a one-row return and INDEX children after closing', () => {
    render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    fireEvent.click(screen.getByTestId('first-run-starter-dismiss'));

    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-reopen')).toBeInTheDocument();
    expect(screen.getByTestId('index-body')).toBeInTheDocument();
  });

  it('restores the guide to the panel when return is pressed', () => {
    render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    fireEvent.click(screen.getByTestId('first-run-starter-dismiss'));
    fireEvent.click(screen.getByTestId('first-run-starter-reopen'));

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(screen.queryByTestId('index-body')).not.toBeInTheDocument();
  });

  it('draws only INDEX in local vault mode', () => {
    mocks.mode = 'local';
    render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-run-starter-reopen')).not.toBeInTheDocument();
    expect(screen.getByTestId('index-body')).toBeInTheDocument();
  });
});

/**
 * While the card is expanded the INDEX is not rendered, so a lens must collapse it. The collapse
 * is a side effect that neither types nor lint would defend.
 */
describe('FirstRunStarterModule yields to INDEX when a lens is active', () => {
  beforeEach(() => {
    // Other describes mutate the shared mocks, and lens collapse matters only while the card is
    // visible, so it is stated explicitly.
    mocks.vault = makeVault();
    mocks.mode = 'static';
    mocks.desktop = true;
    mocks.requestAgentChat.mockClear();
    mocks.ensureChildDir.mockClear();
    mocks.pickedProject = '/Users/dana/my-product';
    mocks.pickerThrows = false;
    window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
    resetSampleSourceCacheForTests();
  });

  it('collapses the card and renders children when lensActive turns on', () => {
    const { rerender } = render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('index-body'), 'the card must fill the panel first').toBeNull();

    rerender(
      <FirstRunStarterModule concepts={1} relations={1} domains={1} lensActive>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.getByTestId('index-body'), 'INDEX did not open when the lens turned on').toBeInTheDocument();
  });

  it('the tour pointing at the INDEX folds the card for that step, and gives it back after', () => {
    const { rerender } = render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('index-body')).toBeNull();

    rerender(
      <FirstRunStarterModule concepts={1} relations={1} domains={1} indexSpotlit>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.getByTestId('index-body'), 'the tour lit the INDEX and the list did not open').toBeInTheDocument();

    rerender(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('index-body'), 'the step was left and the card did not come back').toBeNull();
  });

  it("the tour pointing at the command opens the disclosure for that step, and the person's toggle rules after", () => {
    const { rerender } = render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);
    expect(screen.getByTestId('first-run-starter-cli-toggle')).toHaveAttribute('aria-expanded', 'false');

    rerender(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentSpotlit />);
    expect(screen.getByTestId('first-run-starter-cli-toggle'), 'the tour lit the command and the disclosure stayed shut').toHaveAttribute('aria-expanded', 'true');

    rerender(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);
    expect(screen.getByTestId('first-run-starter-cli-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('stays collapsed when the lens turns off', () => {
    const { rerender } = render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1} lensActive>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.getByTestId('index-body')).toBeInTheDocument();

    rerender(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.getByTestId('index-body'), 'the tree disappeared when the lens turned off').toBeInTheDocument();
  });

  it('offers the build-from-code door and says it asks before writing', async () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    const door = screen.getByTestId('first-run-build-from-code');
    expect(door).toHaveTextContent('buildFromCodeLabel');
    expect(screen.getByTestId('first-run-starter')).toHaveTextContent('buildFromCodeHint');

    await act(async () => {
      fireEvent.click(door);
    });

    /*
     * The map lands inside the person's project, so the exact path is on screen and nothing is
     * created until the button beside it is pressed.
     */
    expect(screen.getByTestId('build-from-code-path')).toHaveTextContent(
      '/Users/dana/my-product/atlas',
    );
    expect(
      mocks.ensureChildDir,
      'created a folder at the path preview step',
    ).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('build-from-code-go'));
    });
    expect(mocks.ensureChildDir).toHaveBeenCalledWith('/Users/dana/my-product', 'atlas');
    // Finish the async open-and-handoff before cleanup, or a rejecting `openRecent` mock leaks a
    // pending state update into the next test.
    await waitFor(() => expect(screen.queryByTestId('build-from-code-path')).toBeNull());
    expect(mocks.vault.openRecent).toHaveBeenCalledTimes(1);
    expect(mocks.requestAgentChat).toHaveBeenCalledTimes(1);
  });

  it('creates nothing and clears the path on cancel', async () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-build-from-code'));
    });
    // The project picker is asynchronous; cancel only after its result is shown.
    await screen.findByTestId('build-from-code-path');
    fireEvent.click(screen.getByTestId('build-from-code-cancel'));
    await waitFor(() => expect(screen.queryByTestId('build-from-code-path')).toBeNull());
    expect(mocks.ensureChildDir).not.toHaveBeenCalled();
  });

  /*
   * The door follows unfinished work, not the first-run card's never-opened rule.
   */
  it('shows the door to someone who opened folders many times without building a map', () => {
    // A vault is open, so the card is gone; the door must not go with it.
    mocks.mode = 'local';
    render(
      <FirstRunStarterModule concepts={4} relations={2} domains={1} mapUnbuilt agentAvailable>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('first-run-starter'), 'the card was already done').toBeNull();
    expect(
      screen.getByTestId('index-build-from-code'),
      'opening folders many times must not count as done',
    ).toBeInTheDocument();
    expect(screen.getByTestId('index-body')).toBeInTheDocument();
  });

  it('hides the door once code is connected', () => {
    mocks.mode = 'local';
    render(
      <FirstRunStarterModule concepts={40} relations={30} domains={5} agentAvailable>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('index-build-from-code')).toBeNull();
  });

  /*
   * Without an ACP runtime the handoff returns early, so the door would create a folder and then
   * do nothing.
   */
  /*
   * A failure before a project is chosen has no confirm box, so it must render elsewhere.
   */
  it('reports a failure that happens before the project pick', async () => {
    mocks.pickerThrows = true;
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-build-from-code'));
    });
    expect(screen.getByTestId('first-run-build-error')).toBeInTheDocument();
  });

  it('does not draw the door without an agent to hand off to', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);
    expect(screen.queryByTestId('first-run-build-from-code')).toBeNull();
    expect(screen.getByTestId('first-run-starter-open')).toBeInTheDocument();
  });

  it('does not draw the code-owner row without an agent', () => {
    mocks.mode = 'local';
    render(
      <FirstRunStarterModule concepts={4} relations={2} domains={1} mapUnbuilt>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('index-build-from-code')).toBeNull();
    expect(screen.getByTestId('index-body')).toBeInTheDocument();
  });

  it('has no door at all on the web', () => {
    mocks.desktop = false;
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    expect(
      screen.queryByTestId('first-run-build-from-code'),
      'drew the door without an agent to hand off to',
    ).toBeNull();
    expect(screen.getByTestId('first-run-starter-open')).toBeInTheDocument();
  });
});
