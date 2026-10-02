import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import type { HarnessReport } from '@/entities/agent-files';

const state = {
  mode: 'local' as 'local' | 'static',
  /* Only a desktop bridge can read the dot directories the structure view is about. */
  bridge: true,
  report: null as null | {
    status: string;
    sourceRoot?: string;
    report?: HarnessReport;
    progress?: { stage: string; done: number; total: number | null } | null;
  },
};

vi.mock('@/entities/vault-session', () => ({
  useDataSourceMode: () => state.mode,
  useLocalVault: () => ({ status: 'loaded', handle: {}, manifest: { docs: [] } }),
  useStaticVaultSource: () => ({ manifest: { docs: [] } }),
  VaultSourceHydrationBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
// The report sits behind its feature's public API, so this mock names the slice, not the file.
vi.mock('@/shared/lib/tauri-vault-fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tauri-vault-fs')>()),
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
      total: 0, guides: 0, mirroredGuides: 0, named: 0, namedDirect: 0, hops: 0, unnamed: 0,
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

  it('opens on the harness structure, which is what the destination is named after', () => {
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    expect(screen.getByTestId('harness-anatomy')).toBeInTheDocument();
    expect(screen.queryByTestId('architecture-page')).toBeNull();
  });

  it('arrives on the blueprint in a browser, which is the view a browser can answer', () => {
    /* The File System Access API cannot see dot directories, so the structure view is empty on the web. */
    state.bridge = false;
    mount();
    expect(screen.getByTestId('architecture-page')).toBeInTheDocument();
    expect(screen.queryByTestId('harness-anatomy')).toBeNull();
  });

  it('arrives on the blueprint when a bridge exists but no harness can be read', () => {
    /* A Tauri-shaped stub has a bridge but no project source: the question is whether a reading exists, not a bridge. */
    state.bridge = true;
    state.report = { status: 'no-source' };
    mount();
    expect(screen.getByTestId('architecture-page')).toBeInTheDocument();
    expect(screen.queryByTestId('harness-anatomy')).toBeNull();
  });

  it('still opens the structure view when an address names it, source or not', () => {
    /* A shared link opens what it says; the fallback moves the arrival, never the address. */
    state.bridge = true;
    state.report = { status: 'no-source' };
    window.history.replaceState(null, '', '/ko/architecture/?view=structure');
    mount();
    expect(screen.queryByTestId('architecture-page')).toBeNull();
  });

  it('lets the rail through, which carries ?focus=main on every link', () => {
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    window.history.replaceState(null, '', '/ko/architecture/?focus=main');
    mount();
    expect(screen.getByTestId('harness-anatomy')).toBeInTheDocument();
  });

  it('keeps one tab set above the panel, never inside it', () => {
    /* One tab set in the shell above every panel: a stacked header cost the canvas a role, and tabs inside the workbench vanish when it returns early. */
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    window.history.replaceState(null, '', '/ko/architecture/?view=architecture');
    mount();
    expect(screen.getByTestId('architecture-page')).toHaveAttribute('data-embedded', 'true');
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
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
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'harness-tabpanel-structure');
  });
});

describe('the segmented control', () => {
  it('moves between the four views and writes the view into the address', () => {
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    act(() => {
      fireEvent.click(document.querySelector('#harness-tab-coverage')!);
    });
    expect(screen.getByTestId('harness-coverage')).toBeInTheDocument();
    expect(window.location.search).toBe('?view=coverage');

    act(() => {
      fireEvent.click(document.querySelector('#harness-tab-architecture')!);
    });
    expect(screen.getByTestId('architecture-page')).toBeInTheDocument();
    expect(window.location.search).toBe('?view=architecture');

    act(() => {
      fireEvent.click(document.querySelector('#harness-tab-structure')!);
    });
    expect(screen.getByTestId('harness-anatomy')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('writes the structure view into a browser address, where the plain one means the blueprint', () => {
    /* On the web the plain address means the blueprint, so the structure tab must write `?view=` or a refresh reopens the ladder. */
    state.bridge = false;
    const view = mount();
    act(() => {
      fireEvent.click(document.querySelector('#harness-tab-structure')!);
    });
    expect(window.location.search).toBe('?view=structure');

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
    expect(screen.getByTestId('harness-anatomy')).toBeInTheDocument();
    act(() => {
      window.history.replaceState(null, '', '/ko/architecture/?view=coverage');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    // The address and the screen must name the same view; that is what putting it in the URL is for.
    expect(screen.getByTestId('harness-coverage')).toBeInTheDocument();
  });

  it('opens the view the address names', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=coverage');
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    expect(screen.getByTestId('harness-coverage')).toBeInTheDocument();
  });

  it('keeps the census off the structure view, where the bands count differently', () => {
    /* The sentence and the bands count mirrored guards differently, so printing both argued with itself. */
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    expect(screen.queryByTestId('harness-sentence')).toBeNull();

    act(() => {
      fireEvent.click(document.querySelector('#harness-tab-coverage')!);
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

  it('sends the retired sensors address to the view that answers it', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=sensors');
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    expect(screen.getByTestId('harness-coverage')).toBeInTheDocument();
  });

  it('shows the passes it is actually running rather than a word on a black screen', () => {
    /* The wait names each pass and fills a bar only with a known denominator; the checkout walk sweeps. */
    window.history.replaceState(null, '', '/ko/architecture/?view=coverage');
    state.report = {
      status: 'loading',
      sourceRoot: '/repo',
      progress: { stage: 'citations', done: 40, total: 401 },
    };
    vi.useFakeTimers();
    mount();
    waitPastProgressThreshold();
    const panel = screen.getByTestId('harness-scan-progress');
    expect(panel).toHaveTextContent('문서 사이의 인용');
    /* `done` is what finished, not what started. */
    expect(panel).toHaveTextContent('401개 중 40개');
    expect(panel.querySelector('[data-harness-stage="citations"]')).toHaveAttribute(
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
    window.history.replaceState(null, '', '/ko/architecture/?view=coverage');
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
    window.history.replaceState(null, '', '/ko/architecture/?view=coverage');
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
    expect(screen.getByTestId('harness-coverage')).toBeInTheDocument();
  });

  it('never invents a denominator for a pass whose length it cannot know', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=coverage');
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
});

describe('the coverage matrix', () => {
  it('says what it cannot show when the ontology records no domain, and still answers the half that needs none', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=coverage');
    /* With agent files and no ontology the grid would print headers over nothing; the document census still runs. */
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    expect(screen.getByText('이 저장소에는 에이전트 파일은 있고 온톨로지는 아직 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByTestId('harness-reach')).toBeInTheDocument();
  });

  it('never renders a score, a grade or a percentage', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=coverage');
    /* No score: files cannot support a judgement of a repository. */
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    const text = screen.getByTestId('harness-coverage').textContent ?? '';
    expect(text).not.toMatch(/%|\bA\+|\b[0-9]+\s*\/\s*10\b|점수|등급|성숙도/);
  });
});
