import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

  it('says in one line what it is about, except where the line below already does', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=guides');
    mount();
    expect(
      screen.getByText('에이전트가 이 저장소에서 어떻게 일하도록 되어 있는지'),
    ).toBeInTheDocument();
  });

  it('drops the explainer in the blueprint, where 20px is a third of a layer row', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=architecture');
    mount();
    expect(
      screen.queryByText('에이전트가 이 저장소에서 어떻게 일하도록 되어 있는지'),
    ).toBeNull();
  });

  it('opens on At a glance, which is what the destination is named after', () => {
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    expect(screen.getByTestId('harness-overview')).toBeInTheDocument();
    expect(screen.queryByTestId('architecture-page')).toBeNull();
  });

  it('arrives on the blueprint in a browser, which is the view a browser can answer', () => {
    /* The File System Access API cannot see dot directories, so the overview is empty on the web. */
    state.bridge = false;
    mount();
    expect(screen.getByTestId('architecture-page')).toBeInTheDocument();
    expect(screen.queryByTestId('harness-overview')).toBeNull();
  });

  it('arrives on the blueprint when a bridge exists but no harness can be read', () => {
    /* A Tauri-shaped stub has a bridge but no project source: the question is whether a reading exists, not a bridge. */
    state.bridge = true;
    state.report = { status: 'no-source' };
    mount();
    expect(screen.getByTestId('architecture-page')).toBeInTheDocument();
    expect(screen.queryByTestId('harness-overview')).toBeNull();
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
    expect(screen.getByTestId('harness-overview')).toBeInTheDocument();
  });

  it('keeps one tab set above the panel, never inside it', () => {
    /* One tab set in the shell above every panel: a stacked header cost the canvas a role, and tabs inside the workbench vanish when it returns early. */
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    window.history.replaceState(null, '', '/ko/architecture/?view=architecture');
    mount();
    expect(screen.getByTestId('architecture-page')).toHaveAttribute('data-embedded', 'true');
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
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

  it('offers At a glance, Guides and Architecture with a reading, and arrives on the first', () => {
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      koMessages.harness.views.overview,
      koMessages.harness.views.guides,
      koMessages.harness.views.architecture,
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it.each(['structure', 'coverage', 'sensors'])(
    'rewrites the retired ?view=%s address to the overview and opens it',
    (retired) => {
      state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
      window.history.replaceState(null, '', `/ko/architecture/?view=${retired}&guides=off`);
      mount();
      expect(window.location.search).toBe('?view=overview&guides=off');
      expect(screen.getByTestId('harness-overview')).toBeInTheDocument();
    },
  );
});

describe('the segmented control', () => {
  it('moves between the three views and writes the view into the address', () => {
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    act(() => {
      fireEvent.click(document.querySelector('#harness-tab-guides')!);
    });
    expect(screen.getByTestId('harness-sentence')).toBeInTheDocument();
    expect(window.location.search).toBe('?view=guides');

    act(() => {
      fireEvent.click(document.querySelector('#harness-tab-architecture')!);
    });
    expect(screen.getByTestId('architecture-page')).toBeInTheDocument();
    expect(window.location.search).toBe('?view=architecture');

    act(() => {
      fireEvent.click(document.querySelector('#harness-tab-overview')!);
    });
    expect(screen.getByTestId('harness-overview')).toBeInTheDocument();
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
    expect(screen.getByTestId('harness-overview')).toBeInTheDocument();
    act(() => {
      window.history.replaceState(null, '', '/ko/architecture/?view=guides');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    // The address and the screen must name the same view; that is what putting it in the URL is for.
    expect(screen.getByTestId('harness-sentence')).toBeInTheDocument();
  });

  it('opens the view the address names', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=guides');
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    expect(screen.getByTestId('harness-sentence')).toBeInTheDocument();
  });

  it('keeps the census on Guides only', () => {
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    expect(screen.queryByTestId('harness-sentence')).toBeNull();

    act(() => {
      fireEvent.click(document.querySelector('#harness-tab-guides')!);
    });
    expect(screen.getByTestId('harness-sentence')).toBeInTheDocument();
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
    expect(screen.getByTestId('harness-overview')).toBeInTheDocument();
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

describe('the sentence', () => {
  it('prints two measured numbers and shows the parts the check number is made of', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=guides');
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    const sentence = screen.getByTestId('harness-sentence');
    expect(sentence).toHaveTextContent('문서 93개');
    expect(sentence).toHaveTextContent('검사 80개');
    /* The number never stands bare: each part names what it counts (a mirrored hook is two scripts for one guard). */
    expect(sentence).toHaveTextContent('훅 스크립트 20개');
    expect(sentence).toHaveTextContent('.githooks/ 파일 3개');
    expect(sentence).toHaveTextContent('스크립트 57개');
  });

  it('keeps the coverage claim out of the counted sentence', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=guides');
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    /* Both numbers are file counts; the coverage claim has its own denominator and stays out. */
    const counted = within(screen.getByTestId('harness-sentence')).getByText(/문서 93개/);
    expect(counted.textContent).not.toMatch(/영역/);
  });
});

describe('honest degradation', () => {
  it('names what a browser cannot reach instead of drawing a shorter list', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=guides');
    state.report = { status: 'unsupported' };
    mount();
    expect(screen.getByText('브라우저에서는 읽을 수 없어요')).toBeInTheDocument();
    expect(screen.getByText(/점으로 시작하는 폴더/)).toBeInTheDocument();
  });

  it('says no repository is connected rather than guessing which one was meant', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=guides');
    state.report = { status: 'no-source' };
    mount();
    expect(screen.getByText('연결된 저장소가 없어요')).toBeInTheDocument();
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

describe('the at-a-glance table', () => {
  const shopDocs = () => [
    {
      slug: 'shop',
      title: 'Shop',
      excerpt: 'Sells things.',
      frontmatter: { kind: 'domain', slug: 'shop', display_ko: '가게 영역' },
    },
    {
      slug: 'cart',
      title: 'Cart',
      excerpt: 'Holds items.',
      frontmatter: { kind: 'capability', slug: 'cart', domain: 'shop', path: 'src/shop/cart.ts' },
    },
    {
      slug: 'notes',
      title: 'Notes',
      excerpt: 'Keeps notes.',
      frontmatter: { kind: 'domain', slug: 'notes' },
    },
  ];

  const ready = () => {
    state.docs = shopDocs();
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
  };

  it('shows an amber gap in every column of a domain no file names, and counts only those', () => {
    ready();
    mount();
    const row = document.querySelector('[data-harness-area="shop"]')!;
    const gaps = row.querySelectorAll('[data-harness-cell-state="gap"]');
    expect(gaps).toHaveLength(3);
    for (const cell of gaps) expect(cell).toHaveTextContent(koMessages.harness.coverageNone);

    const pathless = document.querySelector('[data-harness-area="notes"]')!;
    expect(pathless.querySelector('[data-harness-cell="path"]')).toHaveTextContent(
      koMessages.harness.overviewNoPath,
    );
    expect(pathless.querySelectorAll('[data-harness-cell-state="gap"]')).toHaveLength(0);
    expect(screen.getByTestId('harness-overview-gaps')).toHaveAttribute('data-gap-count', '3');
  });

  it('opens a cell in a panel and closes it with Escape, returning focus to the cell', () => {
    ready();
    mount();
    const cell = document.querySelector<HTMLButtonElement>(
      '[data-harness-area="shop"] [data-harness-cell="told"]',
    )!;
    act(() => {
      fireEvent.click(cell);
    });
    expect(cell).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('harness-overview-panel')).toHaveAttribute('data-panel-cell', 'shop|told');
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(cell).toHaveAttribute('aria-expanded', 'false');
    expect(cell).toHaveFocus();
  });

  it('copies a request that carries slugs and paths, never a display name, and sends nothing', async () => {
    ready();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId('harness-overview-handoff'));
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0]![0] as string;
    expect(text).toContain('shop');
    expect(text).toContain('src/shop/cart.ts');
    expect(text).toContain('/repo');
    expect(text).toContain('.claude/settings.json');
    expect(text).toContain('`permissions`');
    expect(text).not.toContain('가게 영역');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('harness-overview-handoff-status')).toHaveTextContent(
      koMessages.harness.overviewHandoffCopied,
    );
    fetchSpy.mockRestore();
  });

  it('says the clipboard refused and shows the same text to copy by hand', async () => {
    ready();
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    Object.defineProperty(document, 'execCommand', { value: vi.fn(() => false), configurable: true });
    mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId('harness-overview-handoff'));
    });
    expect(screen.getByTestId('harness-overview-handoff-status')).toHaveTextContent(
      koMessages.harness.overviewHandoffCopyFailed,
    );
    act(() => {
      fireEvent.click(screen.getByTestId('harness-overview-request-toggle'));
    });
    const shown = screen.getByTestId('harness-overview-request').textContent;

    writeText.mockResolvedValue(undefined);
    await act(async () => {
      fireEvent.click(screen.getByTestId('harness-overview-handoff'));
    });
    expect(writeText).toHaveBeenLastCalledWith(shown);
  });

  it('closes the panel and puts focus on the tab panel when the reading is asked for again', () => {
    ready();
    mount();
    const cell = document.querySelector<HTMLButtonElement>(
      '[data-harness-area="shop"] [data-harness-cell="gated"]',
    )!;
    act(() => {
      fireEvent.click(cell);
    });
    expect(cell).toHaveAttribute('aria-expanded', 'true');
    act(() => {
      fireEvent.click(screen.getByTestId('harness-overview-retry'));
    });
    expect(cell).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('tabpanel')).toHaveFocus();
  });

  it('says no gaps and offers no copy action when every column has a file', () => {
    state.docs = shopDocs().slice(0, 2);
    state.report = {
      status: 'ready',
      sourceRoot: '/repo',
      report: fakeReport({
        coverage: (['told', 'gated', 'watched'] as const).map((column) => ({
          column,
          id: `src/${column}.sh`,
          label: `src/${column}.sh`,
          origin: 'script' as const,
          declaration: 'src/shop',
          declaresPath: true,
          scopes: ['src/shop'],
          tools: [],
        })),
      }),
    };
    mount();
    expect(screen.getByTestId('harness-overview-gaps')).toHaveAttribute('data-gap-count', '0');
    expect(screen.queryByTestId('harness-overview-handoff')).toBeNull();
  });
});

