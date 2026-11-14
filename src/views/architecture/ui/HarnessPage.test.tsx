import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import type { HarnessReport } from '@/entities/agent-files';

const state = {
  mode: 'local' as 'local' | 'static',
  /* Only a desktop bridge can read the dot directories the overview is about. */
  bridge: true,
  docs: [] as Array<{
    slug: string;
    title: string;
    excerpt: string;
    description?: string;
    frontmatter: Record<string, unknown>;
  }>,
  report: null as null | {
    status: string;
    sourceRoot?: string;
    report?: HarnessReport;
    progress?: { stage: string; done: number; total: number | null } | null;
    code?: string | null;
    message?: string;
  },
};

vi.mock('@/entities/vault-session', () => ({
  useDataSourceMode: () => state.mode,
  useLocalVault: () => ({ status: 'loaded', handle: {}, manifest: { docs: state.docs } }),
  useStaticVaultSource: () => ({ manifest: { docs: [] } }),
  VaultSourceHydrationBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
// The report sits behind its feature's public API, so this mock names the slice, not the file.
vi.mock('@/shared/lib/vault-folder/tauri-vault-fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/vault-folder/tauri-vault-fs')>()),
  isTauriVaultRuntime: () => state.bridge,
}));
vi.mock('@/features/harness-report', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/harness-report')>()),
  useHarnessReport: () => state.report ?? { status: 'unsupported' },
}));
/* The blueprint is a whole workbench with its own bridge reads; this file is about the shell. */
vi.mock('./ArchitecturePage', () => ({
  ArchitecturePage: ({
    embedded,
    harnessIdentity,
    harnessSwitcher,
  }: {
    embedded?: boolean;
    harnessIdentity?: React.ReactNode;
    harnessSwitcher?: React.ReactNode;
  }) => (
    <div
      data-testid="architecture-page"
      data-embedded={String(embedded)}
      data-has-identity={String(harnessIdentity != null)}
      data-has-switcher={String(harnessSwitcher != null)}
    >
      {harnessIdentity}
      {harnessSwitcher}
    </div>
  ),
}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const { HarnessPage } = await import('./HarnessPage');

/** Walks past the threshold that holds the wait screen back, so the read is genuinely slow. */
function waitPastProgressThreshold() {
  act(() => {
    vi.advanceTimersByTime(1000);
  });
}

function mount() {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <HarnessPage />
    </NextIntlClientProvider>,
  );
}

function fakeReport(overrides: Partial<HarnessReport> = {}): HarnessReport {
  return {
    analysis: {
      records: [],
      checks: {
        claudeAgentsBridge: { status: 'ok' },
        skillCopy: { status: 'ok', comparedFiles: 2, divergedFiles: 0, oneSidedFiles: 0, sharedSkills: [], claudeOnlySkills: [], agentsOnlySkills: [] },
        agentCopy: { status: 'ok', comparedFiles: 1, divergedFiles: 0, oneSidedFiles: 0 },
        atRefs: { status: 'ok', refsChecked: 0, missingRefs: 0, unverifiedRefs: 0 },
        agentLanguage: { status: 'ok', scannedFiles: 0, flaggedFiles: 0, codePoints: 0 },
        mcpGrants: { status: 'ok', briefsChecked: 0, grantsChecked: 0, undeclaredServers: [], unparseableConfigs: [] },
        codexSizeCap: { status: 'ok', agentsMdBytes: 12132, nestedFiles: 9, worstNestedPath: 'src/AGENTS.md', worstCaseBytes: 13080, capBytes: 32768 },
      },
      drift: [],
      summary: { files: 0, byTool: {}, byKind: {}, driftCount: 0, checkStatuses: {} },
    } as unknown as HarnessReport['analysis'],
    hookGroups: [],
    coverage: [],
    documentReach: {
      total: 0, guides: 0, named: 0, namedDirect: 0, unnamed: 0,
      unnamedByFolder: [], excluded: [], truncated: false,
    },
    testFiles: [],
    gitHookFiles: [],
    workflowFiles: [],
    times: [],
    contents: new Map(),
    checks: { wiredHooks: 20, gitHooks: 3, scripts: new Array(57).fill('x'), total: 80 },
    guideDocumentCount: 93,
    topLevelFolders: [],
    timesAreFileMtime: true,
    ...overrides,
  };
}

beforeEach(() => {
  state.mode = 'local';
  state.bridge = true;
  state.docs = [];
  state.report = null;
  /* Only the wait-screen tests fake timers; they must not leak into the arrival's count-up. */
  vi.useRealTimers();
  window.history.replaceState(null, '', '/ko/architecture/');
});

describe('the destination identity', () => {
  it('names the destination with the harness heading on every view', () => {
    mount();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('하네스');
  });

  it('opens on Setup, which lists what the agent reads, what stops it and what checks it', () => {
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    expect(screen.getByTestId('harness-setup')).toBeInTheDocument();
    expect(screen.queryByTestId('architecture-page')).toBeNull();
  });

  it('arrives on the blueprint in a browser, which is the view a browser can answer', () => {
    /* The File System Access API cannot see dot directories, so the overview is empty on the web. */
    state.bridge = false;
    mount();
    expect(screen.getByTestId('architecture-page')).toBeInTheDocument();
    expect(screen.queryByTestId('harness-setup')).toBeNull();
  });

  it('arrives on the blueprint when a bridge exists but no harness can be read', () => {
    /* A Tauri-shaped stub has a bridge but no project source: the question is whether a reading exists, not a bridge. */
    state.bridge = true;
    state.report = { status: 'no-source' };
    mount();
    expect(screen.getByTestId('architecture-page')).toBeInTheDocument();
    expect(screen.queryByTestId('harness-setup')).toBeNull();
  });

  it('still opens the overview when an address names it, source or not', () => {
    /* A shared link opens what it says; the fallback moves the arrival, never the address. */
    state.bridge = true;
    state.report = { status: 'no-source' };
    window.history.replaceState(null, '', '/ko/architecture/?view=overview');
    mount();
    expect(screen.queryByTestId('architecture-page')).toBeNull();
  });

  it('lets the rail through, which carries ?focus=main on every link', () => {
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    window.history.replaceState(null, '', '/ko/architecture/?focus=main');
    mount();
    expect(screen.getByTestId('harness-setup')).toBeInTheDocument();
  });

  it('keeps one tab set above the panel, never inside it', () => {
    /* One tab set in the shell above every panel: a stacked header cost the canvas a role, and tabs inside the workbench vanish when it returns early. */
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    window.history.replaceState(null, '', '/ko/architecture/?view=architecture');
    mount();
    expect(screen.getByTestId('architecture-page')).toHaveAttribute('data-embedded', 'true');
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByTestId('architecture-page')).toHaveAttribute('data-has-identity', 'false');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('offers one harness tab beside the blueprint when no reading can exist', () => {
    // Before a source is connected the three harness views draw the same example, so they share one tab.
    state.report = { status: 'no-source' };
    window.history.replaceState(null, '', '/ko/architecture/?view=coverage');
    mount();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'harness-tabpanel-overview');
  });

  it('offers Setup and Architecture with a reading, and arrives on the first', () => {
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.id)).toEqual(['harness-tab-overview', 'harness-tab-architecture']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it.each(['structure', 'coverage', 'sensors', 'guides'])(
    'rewrites the retired ?view=%s address to the overview and opens it',
    (retired) => {
      state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
      window.history.replaceState(null, '', `/ko/architecture/?view=${retired}&guides=off`);
      mount();
      expect(window.location.search).toBe('?view=overview&guides=off');
      expect(screen.getByTestId('harness-setup')).toBeInTheDocument();
    },
  );
});

describe('the segmented control', () => {
  it('moves between the two views and writes the view into the address', () => {
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    act(() => {
      fireEvent.click(document.querySelector('#harness-tab-architecture')!);
    });
    expect(screen.getByTestId('architecture-page')).toBeInTheDocument();
    expect(window.location.search).toBe('?view=architecture');

    act(() => {
      fireEvent.click(document.querySelector('#harness-tab-overview')!);
    });
    expect(screen.getByTestId('harness-setup')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('writes the overview into a browser address, where the plain one means the blueprint', () => {
    /* On the web the plain address means the blueprint, so the overview tab must write `?view=` or a refresh reopens the ladder. */
    state.bridge = false;
    const view = mount();
    act(() => {
      fireEvent.click(document.querySelector('#harness-tab-overview')!);
    });
    expect(window.location.search).toBe('?view=overview');

    view.unmount();
    mount();
    expect(screen.queryByTestId('architecture-page')).toBeNull();

    act(() => {
      fireEvent.click(document.querySelector('#harness-tab-architecture')!);
    });
    expect(window.location.search).toBe('');
  });

  it('follows the address when history moves under it', () => {
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    expect(screen.getByTestId('harness-setup')).toBeInTheDocument();
    act(() => {
      window.history.replaceState(null, '', '/ko/architecture/?view=architecture');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    // The address and the screen must name the same view; that is what putting it in the URL is for.
    expect(screen.getByTestId('architecture-page')).toBeInTheDocument();
  });

  it('opens the blueprint for an address that carries a role but names no view', () => {
    /* `?role=` exists only on the blueprint, so old deep links without `?view=` still open it. */
    window.history.replaceState(null, '', '/ko/architecture/?role=views');
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    expect(screen.getByTestId('architecture-page')).toBeInTheDocument();
  });

  it('shows the passes it is actually running rather than a word on a black screen', () => {
    /* The wait names each pass and fills a bar only with a known denominator; the checkout walk sweeps. */
    window.history.replaceState(null, '', '/ko/architecture/?view=overview');
    state.report = {
      status: 'loading',
      sourceRoot: '/repo',
      progress: { stage: 'citation-hops', done: 3, total: null },
    };
    vi.useFakeTimers();
    mount();
    waitPastProgressThreshold();
    const panel = screen.getByTestId('harness-scan-progress');
    expect(panel).toHaveTextContent('인용을 따라가는 중');
    expect(panel.querySelector('[data-harness-stage="citation-hops"]')).toHaveAttribute(
      'data-harness-stage-state',
      'running',
    );
    expect(panel.querySelector('[data-harness-stage="roots"]')).toHaveAttribute(
      'data-harness-stage-state',
      'done',
    );
  });

  it('shows no wait screen at all for a read that finishes inside the threshold', () => {
    /* A fast read flashes nothing: the panel is held back for a second. This assertion is the gate on that threshold. */
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/ko/architecture/?view=overview');
    state.report = {
      status: 'loading',
      sourceRoot: '/repo',
      progress: { stage: 'roots', done: 2, total: 7 },
    };
    mount();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByTestId('harness-scan-progress')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByTestId('harness-scan-progress')).toBeInTheDocument();
  });

  it('swaps the panel for the result in one commit when a read lands just past the threshold', () => {
    /* A read finishing near the threshold shows an unfinished entrance and is removed: deliberate, since holding the panel would delay the answer. */
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/ko/architecture/?view=overview');
    state.report = {
      status: 'loading',
      sourceRoot: '/repo',
      progress: { stage: 'documents', done: 0, total: null },
    };
    const view = mount();
    waitPastProgressThreshold();
    expect(screen.getByTestId('harness-scan-progress')).toBeInTheDocument();

    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    act(() => {
      view.rerender(
        <NextIntlClientProvider locale="ko" messages={koMessages}>
          <HarnessPage />
        </NextIntlClientProvider>,
      );
    });
    expect(screen.queryByTestId('harness-scan-progress')).toBeNull();
    expect(screen.getByTestId('harness-setup')).toBeInTheDocument();
  });

  it('never invents a denominator for a pass whose length it cannot know', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=overview');
    state.report = {
      status: 'loading',
      sourceRoot: '/repo',
      progress: { stage: 'documents', done: 0, total: null },
    };
    vi.useFakeTimers();
    mount();
    waitPastProgressThreshold();
    const panel = screen.getByTestId('harness-scan-progress');
    expect(panel).toHaveTextContent('세는 중');
    expect(panel.querySelector('.motion-work-sweep')).not.toBeNull();
    expect(panel.textContent).not.toMatch(/%/);
  });
});

describe('honest degradation', () => {
  it('names what a browser cannot reach instead of drawing a shorter list', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=overview');
    state.report = { status: 'unsupported' };
    mount();
    expect(screen.getByTestId('harness-unread-stage')).toHaveAttribute('data-harness-unread', 'browser');
  });

  it('says no repository is connected rather than guessing which one was meant', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=overview');
    state.report = { status: 'no-source' };
    mount();
    expect(screen.getByTestId('harness-unread-stage')).toHaveAttribute('data-harness-unread', 'no-source');
  });

  it('says the source could not be read, in words, instead of counting an empty harness', () => {
    state.report = { status: 'failed', sourceRoot: '/repo', code: 'source-root-not-granted', message: '.: source-root-not-granted' };
    mount();
    const reason = screen.getByTestId('harness-failed-reason');
    expect(reason).toHaveTextContent('/repo');
    expect(reason.textContent).not.toMatch(/source-root-not-granted/);
    expect(reason).toHaveAttribute('data-failure-code', 'source-root-not-granted');
        expect(screen.getByTestId('harness-retry')).toBeInTheDocument();
  });

  it('names the platform when the app cannot read a connected folder on it', () => {
    state.report = { status: 'failed', sourceRoot: '/repo', code: 'harness-unsupported-platform', message: '.: harness-unsupported-platform' };
    mount();
    expect(screen.getByTestId('harness-failed-reason')).toHaveTextContent('macOS');
  });
});
