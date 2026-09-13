import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import type { HarnessReport } from '@/entities/agent-files';

const state = {
  mode: 'local' as 'local' | 'static',
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
vi.mock('../model/use-harness-report', () => ({
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

/**
 * Walk past the threshold that holds the wait screen back. The panel exists for a read that is
 * genuinely slow; every test that wants to see it has to make the read genuinely slow.
 */
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
    times: [],
    contents: new Map(),
    checks: { wiredHooks: 20, gitHooks: 3, scripts: new Array(57).fill('x'), total: 80 },
    guideDocumentCount: 93,
    timesAreFileMtime: true,
    ...overrides,
  };
}

beforeEach(() => {
  state.mode = 'local';
  state.report = null;
  /* Real timers by default; only the wait-screen tests fake them, and they must not leak into the
     count-up animation the arrival runs. */
  vi.useRealTimers();
  window.history.replaceState(null, '', '/ko/architecture/');
});

describe('the destination identity', () => {
  it('is named 하네스 on every view', () => {
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
    window.history.replaceState(null, '', '/ko/architecture/?view=structure');
    mount();
    expect(
      screen.queryByText('에이전트가 이 저장소에서 어떻게 일하도록 되어 있는지'),
    ).toBeNull();
  });

  it('opens on the blueprint, where every link written before this slice points', () => {
    /* The matrix is the tab's spine and one press away; the view a person walks into is the ladder
       (owner, 2026-09-13), which also keeps the plain address meaning what it always meant. */
    mount();
    expect(screen.getByTestId('architecture-page')).toBeInTheDocument();
  });

  it('lets the rail through, which carries ?focus=main on every link', () => {
    window.history.replaceState(null, '', '/ko/architecture/?focus=main');
    mount();
    expect(screen.getByTestId('architecture-page')).toBeInTheDocument();
  });

  it('keeps one tab set above the panel, never inside it', () => {
    /*
     * Two measurements pinned this shape. A stacked header over the blueprint cost 168px at
     * 1280x800 and took the canvas column from 612 to 444, below even the tight ladder's 573, so
     * the seventh role went behind a fold. Pushing the tab set *into* the workbench recovered the
     * canvas and then lost the tabs entirely on a repository with no architecture profile, where
     * that view returns its empty state early. One instance, in the shell, above every panel.
     */
    window.history.replaceState(null, '', '/ko/architecture/?view=structure');
    mount();
    expect(screen.getByTestId('architecture-page')).toHaveAttribute('data-embedded', 'true');
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    // The identity is the shell's, so the blueprint is handed none of it.
    expect(screen.getByTestId('architecture-page')).toHaveAttribute('data-has-identity', 'false');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('the segmented control', () => {
  it('moves between the three views and writes the view into the address', () => {
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    act(() => {
      fireEvent.click(document.querySelector('#harness-tab-coverage')!);
    });
    expect(screen.getByTestId('harness-coverage')).toBeInTheDocument();
    expect(window.location.search).toBe('?view=coverage');

    act(() => {
      fireEvent.click(document.querySelector('#harness-tab-structure')!);
    });
    expect(screen.getByTestId('architecture-page')).toBeInTheDocument();
    // The default view leaves the plain address a person copies.
    expect(window.location.search).toBe('');
  });

  it('follows the address when history moves under it', () => {
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    expect(screen.getByTestId('architecture-page')).toBeInTheDocument();
    act(() => {
      window.history.replaceState(null, '', '/ko/architecture/?view=coverage');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    // The address saying one view while the screen draws another is exactly what putting the
    // view in the URL was for.
    expect(screen.getByTestId('harness-coverage')).toBeInTheDocument();
  });

  it('opens the view the address names', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=coverage');
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    expect(screen.getByTestId('harness-coverage')).toBeInTheDocument();
  });

  it('sends the retired sensors address to the view that answers it', () => {
    /* The sensors view named this exact question and said it was not built. It is built now, so the
       old link lands on the answer rather than on the default by accident. */
    window.history.replaceState(null, '', '/ko/architecture/?view=sensors');
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    expect(screen.getByTestId('harness-coverage')).toBeInTheDocument();
  });

  it('shows the passes it is actually running rather than a word on a black screen', () => {
    /*
     * The wait is a screen. It names each pass `scanHarness` runs and fills a bar only where the
     * denominator was known before the pass started; the walk across the checkout, whose length
     * nobody knows in advance, moves instead of claiming a number.
     */
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
    /* `done` is what finished, not what started: counting the running unit put the last pass at its
       own total while it was still working. */
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
    /*
     * ⚠️ **The fix for "the loading screen is too fast to see" is not to slow the read down.** The
     * read is 0.6s on this repository because the previous slice made it fast, and animating a wait
     * that is not happening would be dishonest. So the panel is held back for a second: a fast read
     * flashes nothing, and the result simply arrives.
     *
     * This assertion is the whole gate. Without it the threshold could be set to zero and every
     * other test on this panel would still pass.
     */
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
    /* …and it is held back, not suppressed: the same read past the threshold still gets it. */
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByTestId('harness-scan-progress')).toBeInTheDocument();
  });

  it('swaps the panel for the result in one commit when a read lands just past the threshold', () => {
    /*
     * The accepted residue of a threshold with no minimum display: a read finishing at ~1.05s shows
     * a panel that never completes its 180ms entrance and is then removed. That trade is deliberate
     * — holding the panel after the answer exists would delay the answer to display an animation —
     * and it is written down here so a future reader cannot mistake the flash for a regression, or
     * a regression for the flash (design-interaction, 2026-09-13).
     */
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
    /* One commit: the wait is gone and the answer is there. No frame shows both. */
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
    expect(panel.querySelector('.harness-scan-sweep')).not.toBeNull();
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
    /* The number never stands bare: its three parts are printed beside it, and each part now names
       what it counts rather than what it implies — a hook mirrored for two tools is two scripts for
       one guard, and `.githooks/` holds helper modules beside its hooks (Evidence seat). */
    expect(sentence).toHaveTextContent('훅 스크립트 20개');
    expect(sentence).toHaveTextContent('.githooks/ 파일 3개');
    expect(sentence).toHaveTextContent('스크립트 57개');
  });

  it('keeps the coverage claim out of the counted sentence', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=guides');
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    /*
     * The two numbers in this sentence are file counts. The coverage claim is a different kind of
     * statement with its own denominator, and folding it into a sentence whose other slots are
     * counts would read as a third count of the same kind.
     */
    const counted = within(screen.getByTestId('harness-sentence')).getByText(/문서 93개/);
    expect(counted.textContent).not.toMatch(/영역/);
  });
});

describe('honest degradation', () => {
  it('names what a browser cannot reach instead of drawing a shorter list', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=guides');
    state.report = { status: 'unsupported' };
    mount();
    expect(screen.getByText('브라우저에서는 읽을 수 없습니다')).toBeInTheDocument();
    expect(screen.getByText(/점으로 시작하는 폴더/)).toBeInTheDocument();
  });

  it('says no repository is connected rather than guessing which one was meant', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=guides');
    state.report = { status: 'no-source' };
    mount();
    expect(screen.getByText('연결된 저장소가 없습니다')).toBeInTheDocument();
  });
});

describe('the coverage matrix', () => {
  it('says what it cannot show when the ontology records no domain, and still answers the half that needs none', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=coverage');
    /*
     * A repository with agent files and no ontology. The grid would otherwise print three column
     * headers over nothing, which reads as a broken screen rather than as the true statement — and
     * the document census needs no ontology at all, so it still runs.
     */
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    expect(screen.getByText('이 저장소에는 에이전트 파일은 있고 온톨로지는 아직 없습니다')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByTestId('harness-reach')).toBeInTheDocument();
  });

  it('never renders a score, a grade or a percentage', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=coverage');
    /*
     * The thing every competitor ships and this screen may not. A number here would assert a
     * judgement the files cannot support, which is exactly how a scanner rated an official
     * reference repository the same as an abandoned toy.
     */
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    const text = screen.getByTestId('harness-coverage').textContent ?? '';
    expect(text).not.toMatch(/%|\bA\+|\b[0-9]+\s*\/\s*10\b|점수|등급|성숙도/);
  });
});
