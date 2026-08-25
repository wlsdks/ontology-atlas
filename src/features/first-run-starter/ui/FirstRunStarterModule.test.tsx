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
  /** "Has a vault ever been connected?" — the input deciding who the sample notice targets (2026-08-02). */
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

vi.mock('@/features/docs-vault-local', async () => {
  const actual = await vi.importActual<typeof import('@/features/docs-vault-local')>(
    '@/features/docs-vault-local',
  );
  return { ...actual, useLocalVault: () => mocks.vault };
});

vi.mock('@/features/data-source-mode', () => ({
  useDataSourceMode: () => mocks.mode,
}));

vi.mock('@/shared/lib/desktop-shell', () => ({
  isDesktopShell: () => mocks.desktop,
}));

vi.mock('@/shared/lib/agent-chat-intent', () => ({
  requestAgentChat: (...args: unknown[]) => mocks.requestAgentChat(...args),
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
    open: vi.fn(async () => undefined),
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
    // Clearing storage clears the module cache too — otherwise a test leans on
    // whatever the previous one left behind, which is coincidence, not isolation.
    resetSampleSourceCacheForTests();
    window.localStorage.setItem('vault-open-guide:auto:v1', '1');
  });

  // PO council 2026-08-02 — the instrument block (19px mono) was demoted to a
  // single caption line under the tabs. **The numbers' source is unchanged**, so
  // this pins that the real census arriving as props is what gets drawn, keeping
  // the ban on hardcoded numbers (2026-08-01 ledger) satisfied.
  it('renders the real census as a caption line, not a meter block', () => {
    render(<FirstRunStarterModule concepts={102} relations={478} domains={6} />);

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    const scale = screen.getByTestId('first-run-starter-sample-scale');
    expect(scale).toHaveTextContent('sampleScale');
    // The 19px mono instrument cell is gone — no element may stand as a bare number.
    expect(screen.queryByText('102')).not.toBeInTheDocument();
    expect(screen.queryByText('478')).not.toBeInTheDocument();
  });

  // The first point of contact states in one sentence why this product differs
  // (a person and an agent read and write the same folder) — 「Agent」 appeared
  // zero times across its 33 strings.
  it('names the agent audience once in the lead paragraph', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    expect(screen.getByTestId('first-run-starter-agent-clause')).toHaveTextContent(
      'agentClause',
    );
  });

  // PO council 2026-08-02 — `⌘O` is bound to the meta key only in this app (the
  // HomePage shortcut table) with no matching Ctrl+O binding. Advertising a key
  // that does not exist to Windows/Linux users — the web gateway's core audience —
  // is a false glyph, not a hint. The platform is split for real and both
  // directions are pinned.
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

  // The tour's only entry point was an icon in the right rail and went
  // undiscovered. Pins that supplying `onStartTour` renders a secondary CTA whose
  // click reaches the callback, and that omitting it renders nothing.
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

  // The distant hint about the plain-mode toggle in the gear menu was promoted to
  // a one-click toggle. With the callback it is a button; when plain mode is
  // already on nothing shows; without the callback the old hint sentence remains.
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

  // A complete beginner could read the card's description of the screen but had
  // no way to learn the product's name. Pins that one brand wordmark line always
  // renders above the caption.
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

  // The folder CTA opens a guidance sheet first rather than going straight to the
  // OS picker. `vault.open()` is called only after "choose an existing folder" is confirmed.
  it('opens the guide sheet first, then wires "choose existing" to vault.open()', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    fireEvent.click(screen.getByTestId('first-run-starter-open'));
    expect(mocks.vault.open).not.toHaveBeenCalled();
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('vault-guide-pick-existing'));
    expect(mocks.vault.open).toHaveBeenCalledTimes(1);
  });

  it('scaffolds a starter structure after the sheet\'s "start fresh" opens an empty folder', async () => {
    mocks.vault.open = vi.fn(async () => {
      mocks.vault.status = 'loaded';
      mocks.vault.manifest = { docs: [] };
    });
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    fireEvent.click(screen.getByTestId('first-run-starter-create'));
    expect(screen.getByTestId('vault-guide-sheet')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('vault-guide-create-new'));

    await waitFor(() => {
      expect(mocks.vault.scaffoldOntology).toHaveBeenCalledTimes(1);
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

  // Back to the guide (owner report from real use, 2026-07-24) — a quiet "reopen
  // the starter guide" row stays where the closed card was, and clicking it
  // restores the card for the session.
  it('leaves a quiet reopen row after dismiss and restores the card on click', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    fireEvent.click(screen.getByTestId('first-run-starter-dismiss'));

    const reopen = screen.getByTestId('first-run-starter-reopen');
    fireEvent.click(reopen);

    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(FIRST_RUN_STARTER_DISMISSED_KEY)).toBeNull();
  });

  /*
   * PO council verdict ③ (2026-08-03) — the "Sample for now" signal must follow
   * **the lifetime of the connection state, not the lifetime of the card**.
   *
   * The real accident this gate prevents: pressing a sample source tab collapses
   * the card (`setCollapsed(true)`), and with the signal living **inside** the
   * card it disappeared too. At that moment the screen became structurally
   * indistinguishable from a real connected vault, and the owner read the
   * "Code for this app" tab **as evidence of a connection.**
   *
   * Both paths are locked — collapsed by dismiss, and collapsed by a tab switch.
   */
  it('keeps the sample signal alive after the card collapses — both ways', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();

    // ① collapse by dismiss
    fireEvent.click(screen.getByTestId('first-run-starter-dismiss'));
    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-sample-signal')).toBeInTheDocument();

    // ② reopen, then collapse by switching the sample source — the exact path the accident took
    fireEvent.click(screen.getByTestId('first-run-starter-reopen'));
    fireEvent.click(screen.getByTestId('first-run-starter-sample-source-dogfood'));
    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-sample-signal')).toBeInTheDocument();
  });

  // Folder-first first visit (owner instruction 2026-07-24) — the folder guidance
  // sheet auto-opens once on the very first screen and never again once the flag
  // is set. Since 2026-08-13 auto-display is off by default globally (opt-in), so
  // this assumes it has been turned on.
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

  // Measured regression 2026-07-24 — while the guidance sheet is open, Escape
  // must close only the sheet. Pins that the capture-phase dismiss handler yields
  // to the modal.
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

  // The web's first screen had no bridge at all to automatic codebase bootstrap
  // (CLI/agent only), so the "my repo to a map in five minutes" journey never
  // completed. One copyable command line in the card builds that bridge.
  //
  // That npx block stole a non-developer's first attention, so it moved behind a
  // disclosure that is collapsed by default: the command is invisible in the
  // default state and appears only when the developer toggle is expanded.
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

  // Owner report 2026-07-23 — the label, command, and copy button split one row
  // three ways and the command was truncated to "npx ontology-atlas i…". The code
  // line must be full width and wrap at word boundaries, not ellipsize, so the
  // full command can be verified by eye before copying.
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

  // Safari and Firefox have no File System Access API, so the most prominent
  // indigo CTA "failed only once pressed". When unsupported, degrade honestly up
  // front: one notice line plus a /download link instead of open-folder and
  // create-new-vault.
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
    // "Look around here" (dismiss) stays regardless of support.
    expect(screen.getByTestId('first-run-starter-dismiss')).toBeInTheDocument();
  });

  // A non-developer had no way to discover the "plain" view-mode toggle. One
  // quiet nudge line sits near the dismiss row.
  it('P2 결함③ — renders a quiet nudge toward the plain-mode gear toggle near the dismiss row', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    const hint = screen.getByTestId('first-run-starter-plain-mode-hint');
    expect(hint).toHaveTextContent('plainModeHint');
  });

  // The empathetic sample vault, mitigating the fact that the dogfood vault (this
  // tool describing itself) does not land with a non-developer. Pins that the
  // "look at this tool" / "see an example business" segment renders and that a
  // click updates the localStorage preference (`useSampleSource`'s source of truth).
  // Default flipped 2026-07-26 — a newcomer sees the example business first.
  // Leading with the dogfood vault meant meeting names like `Dev Route Smoke`
  // before being able to judge "is this relevant to me". The dogfood vault's
  // persuasiveness comes from existing, not from being the default — it stays one
  // click away under its honest name.
  it('renders the sample-source segment defaulting to "storefront" and persists a switch to "dogfood"', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    const dogfoodTab = screen.getByTestId('first-run-starter-sample-source-dogfood');
    const storefrontTab = screen.getByTestId('first-run-starter-sample-source-storefront');
    // 2026-08-15 — an exclusive single selection, hence radiogroup + aria-checked.
    expect(storefrontTab).toHaveAttribute('aria-checked', 'true');
    expect(dogfoodTab).toHaveAttribute('aria-checked', 'false');

    // Choosing a sample is the signal "I have chosen what to look at", so the card
    // collapses and hands the space to the INDEX (the single reopen row always remains).
    fireEvent.click(dogfoodTab);

    expect(window.localStorage.getItem('demo:sample-source:v1')).toBe('dogfood');
    expect(screen.queryByTestId('first-run-starter')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run-starter-reopen')).toBeInTheDocument();
  });

  // A changed default does not undo someone else's choice — an explicit selection stands.
  it('keeps an explicitly persisted "dogfood" choice after the default flipped', () => {
    window.localStorage.setItem('demo:sample-source:v1', 'dogfood');

    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);

    expect(screen.getByTestId('first-run-starter-sample-source-dogfood')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  // Measured defect (PO council 2026-08-02) — it was `role="tab"`, but clicking
  // collapsed the card rather than changing a tab panel, **and pressing the
  // already-selected tab collapsed it too**. A tab that removes its own screen is
  // not the tablist contract. Re-clicking the current selection now does nothing
  // (collapse-on-switch is kept, per the 2026-07-24 handoff design).
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
     * The 2026-08-02 PO council's decision to give back `role="tab"` still holds —
     * but the alternative considered then was tablist, not radiogroup. Putting
     * `aria-pressed` on siblings side by side never puts the exclusivity into the
     * accessibility tree.
     */
    expect(group).toHaveAttribute('role', 'radiogroup');
    expect(group.querySelectorAll('[role="tab"]')).toHaveLength(0);
    // There is one tab stop, the checked radio (roving) — both used to be tab stops.
    const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(radios).toHaveLength(2);
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });

    // People read left first — the order is "what we recommend first".
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

// Structure change 2026-07-24 (owner report: "Separate scrollbars for top and bottom",
// separate scrollbars top and bottom) — the guide card and the INDEX (children)
// render exclusively, so the panel always has exactly one scroller.
describe('FirstRunStarterModule — 가이드/INDEX 배타 렌더', () => {
  // This describe sits outside the block above and needs its own reset (a session
  // dismiss persists across the whole file).
  beforeEach(() => {
    mocks.vault = makeVault();
    mocks.mode = 'static';
    window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
    window.localStorage.removeItem('demo:sample-source:v1');
    window.localStorage.setItem('vault-open-guide:auto:v1', '1');
  });

  it('가이드가 펼쳐져 있으면 INDEX children 을 렌더하지 않는다', () => {
    render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.getByTestId('first-run-starter')).toBeInTheDocument();
    expect(screen.queryByTestId('index-body')).not.toBeInTheDocument();
  });

  it('닫으면 되돌아오기 1행 + INDEX children 이 열린다', () => {
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

  it('되돌아오기를 누르면 다시 가이드가 패널을 차지한다', () => {
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

  it('로컬 vault 모드에서는 가이드 없이 INDEX 만 그린다', () => {
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
 * Turning the lens on makes the card hand over its space (2026-08-02, owner
 * report: *"Error where the left panel doesn't change when pressing the recent-changes button while the starter panel is open"* — pressing the recent-changes button while the starter panel is
 * open leaves the left panel unchanged).
 *
 * The card and the INDEX are **two exclusive states** — while the card is
 * expanded, children (the INDEX) are not rendered at all, so turning on the lens
 * had nowhere to put the segment and period chips. Only the URL and the map
 * changed while the left side stayed put.
 *
 * A gate is needed because the way back is wide: this collapse is a **side
 * effect**, so the next person deleting the `lensActive` wiring gets no complaint
 * from either types or lint.
 */
describe('FirstRunStarterModule — 렌즈가 켜지면 INDEX 에 자리를 넘긴다', () => {
  beforeEach(() => {
    // Other describes in this file mutate the shared mocks (local mode, restore
    // incomplete, and so on). Lens collapse is meaningful only while the card is
    // actually visible, so it is stated explicitly.
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

  it('lensActive 가 켜지면 카드가 접히고 children 이 렌더된다', () => {
    const { rerender } = render(
      <FirstRunStarterModule concepts={1} relations={1} domains={1}>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('index-body'), '처음엔 카드가 자리를 차지한다').toBeNull();

    rerender(
      <FirstRunStarterModule concepts={1} relations={1} domains={1} lensActive>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.getByTestId('index-body'), '렌즈를 켰는데 INDEX 가 안 열렸다').toBeInTheDocument();
  });

  it('렌즈를 꺼도 다시 펼치지 않는다 — 보던 트리를 뺏지 않는다', () => {
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
    expect(screen.getByTestId('index-body'), '렌즈를 껐다고 트리가 사라졌다').toBeInTheDocument();
  });

  /*
   * ⚠️ The door for someone who already has code (decision, 2026-08-24). Measured on the shipped
   * card: of its four actions none makes an ontology from a repository that already exists.
   */
  it('코드를 이미 가진 사람에게 문을 준다 — 무엇을 할지와, 쓰기 전에 묻는다는 것까지', async () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    const door = screen.getByTestId('first-run-build-from-code');
    expect(door).toHaveTextContent('buildFromCodeLabel');
    // The hint states what will happen **before** it happens, including that it asks before writing.
    expect(screen.getByTestId('first-run-starter')).toHaveTextContent('buildFromCodeHint');

    await act(async () => {
      fireEvent.click(door);
    });

    /*
     * ⚠️ What the person must be able to read before agreeing (owner direction, 2026-08-24). The map
     * now lands inside their project, so this press ends in a folder written into their source tree.
     * The exact path is on screen, and nothing is created until the button beside it is pressed.
     */
    expect(screen.getByTestId('build-from-code-path')).toHaveTextContent(
      '/Users/dana/my-product/atlas',
    );
    expect(
      mocks.ensureChildDir,
      '경로를 보여 주기만 해야 하는 단계에서 이미 폴더를 만들었다',
    ).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('build-from-code-go'));
    });
    expect(mocks.ensureChildDir).toHaveBeenCalledWith('/Users/dana/my-product', 'atlas');
    // Finish the async open-and-handoff path before cleanup. Leaving the old
    // undefined `openRecent` mock to reject after the assertion leaked a pending
    // state update into the following cancellation test under suite load.
    await waitFor(() => expect(screen.queryByTestId('build-from-code-path')).toBeNull(), {
      timeout: 5_000,
    });
    expect(mocks.vault.openRecent).toHaveBeenCalledTimes(1);
    expect(mocks.requestAgentChat).toHaveBeenCalledTimes(1);
  });

  it('취소하면 만들지 않고 경로도 치운다', async () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-build-from-code'));
    });
    fireEvent.click(screen.getByTestId('build-from-code-cancel'));
    // The dialog closes, so the path it was showing is gone from the document.
    await waitFor(() => expect(screen.queryByTestId('build-from-code-path')).toBeNull(), {
      timeout: 5_000,
    });
    expect(mocks.ensureChildDir).not.toHaveBeenCalled();
  });

  /*
   * ⚠️ **The correction this door needed** (owner, 2026-08-24): *"shouldn't it be person B who has
   * opened folders many times and still hasn't made one?"* The card is gated on "this computer has
   * never opened a folder", so the door it contained was invisible to the person who opened folders
   * repeatedly, saw an empty map each time, and gave up — the exact person it was built for.
   */
  it('폴더를 여러 번 열어 봤어도 지도를 못 만든 사람에게 문이 보인다', () => {
    // The card itself is gone (a vault is open, so first-run guidance is finished), and the door
    // must not go with it.
    mocks.mode = 'local';
    render(
      <FirstRunStarterModule concepts={4} relations={2} domains={1} mapUnbuilt agentAvailable>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('first-run-starter'), '카드는 이미 할 일을 마쳤다').toBeNull();
    expect(
      screen.getByTestId('index-build-from-code'),
      '폴더를 여러 번 연 것은 끝냈다는 뜻이 아니라 더 헤맸다는 뜻이다',
    ).toBeInTheDocument();
    // It sits above their own tree, not instead of it.
    expect(screen.getByTestId('index-body')).toBeInTheDocument();
  });

  it('코드가 이미 붙어 있으면 그 문은 사라진다 — 끝난 일을 다시 권하지 않는다', () => {
    mocks.mode = 'local';
    render(
      <FirstRunStarterModule concepts={40} relations={30} domains={5} agentAvailable>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('index-build-from-code')).toBeNull();
  });

  /*
   * ⚠️ Found by walking the flow, 2026-08-25. The handoff ends at `if (!target) return;` when no ACP
   * runtime exists, so on a Mac with no agent installed this button created a folder, opened a
   * vault, and then silently did nothing — having promised a map. The card's own rule already said a
   * door that cannot open is worse than no door; it was being applied to the web and not to this.
   */
  /*
   * ⚠️ Found by walking the flow, 2026-08-25. A failure before a project is chosen has no confirm
   * box to live in, and the error was written into state that nothing rendered — so a picker that
   * threw left the person pressing a button that did nothing, twice.
   */
  it('프로젝트를 고르기도 전에 실패하면 그 사실을 말한다 — 눌러도 아무 일 없는 버튼이 되지 않는다', async () => {
    mocks.pickerThrows = true;
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('first-run-build-from-code'));
    });
    expect(screen.getByTestId('first-run-build-error')).toBeInTheDocument();
  });

  it('넘길 에이전트가 없으면 문을 그리지 않는다 — 폴더만 만들고 끝나면 약속을 어긴 것이다', () => {
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} />);
    expect(screen.queryByTestId('first-run-build-from-code')).toBeNull();
    // The rest of the card is untouched: this removes a dead end, it does not re-rank anything.
    expect(screen.getByTestId('first-run-starter-open')).toBeInTheDocument();
  });

  it('에이전트가 없으면 사람 B 의 줄도 그리지 않는다', () => {
    mocks.mode = 'local';
    render(
      <FirstRunStarterModule concepts={4} relations={2} domains={1} mapUnbuilt>
        <div data-testid="index-body" />
      </FirstRunStarterModule>,
    );
    expect(screen.queryByTestId('index-build-from-code')).toBeNull();
    expect(screen.getByTestId('index-body')).toBeInTheDocument();
  });

  it('웹에서는 그 문이 아예 없다 — 「곧 됩니다」도 비활성 버튼도 아니다', () => {
    mocks.desktop = false;
    render(<FirstRunStarterModule concepts={1} relations={1} domains={1} agentAvailable />);
    expect(
      screen.queryByTestId('first-run-build-from-code'),
      '넘길 에이전트가 없는데 문을 그렸다 — 열리지 않는 문은 없는 문보다 나쁘다',
    ).toBeNull();
    // The rest of the card is untouched: this is an addition, not a re-ranking.
    expect(screen.getByTestId('first-run-starter-open')).toBeInTheDocument();
  });
});
