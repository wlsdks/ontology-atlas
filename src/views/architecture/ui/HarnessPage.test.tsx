import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import type { HarnessReport } from '@/entities/agent-files';

const state = {
  mode: 'local' as 'local' | 'static',
  report: null as null | { status: string; sourceRoot?: string; report?: HarnessReport },
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
  ArchitecturePage: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="architecture-page" data-embedded={String(embedded)} />
  ),
}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const { HarnessPage } = await import('./HarnessPage');

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
  window.history.replaceState(null, '', '/ko/architecture/');
});

describe('the destination identity', () => {
  it('is named 하네스 and says in one line what it is about', () => {
    mount();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('하네스');
    expect(
      screen.getByText('에이전트가 이 저장소에서 어떻게 일하도록 되어 있는지'),
    ).toBeInTheDocument();
  });

  it('opens on the blueprint, where every link written before the rename points', () => {
    mount();
    expect(screen.getByTestId('architecture-page')).toBeInTheDocument();
  });

  it('hands the blueprint the shell’s identity so the screen has exactly one h1', () => {
    mount();
    expect(screen.getByTestId('architecture-page')).toHaveAttribute('data-embedded', 'true');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('the segmented control', () => {
  it('moves between the three views and writes the view into the address', () => {
    mount();
    act(() => {
      fireEvent.click(screen.getByTestId('harness-view-sensors'));
    });
    expect(screen.getByTestId('harness-sensors-placeholder')).toBeInTheDocument();
    expect(window.location.search).toBe('?view=sensors');

    act(() => {
      fireEvent.click(screen.getByTestId('harness-view-structure'));
    });
    expect(screen.getByTestId('architecture-page')).toBeInTheDocument();
    // The default view leaves the plain address a person copies.
    expect(window.location.search).toBe('');
  });

  it('follows the address when history moves under it', () => {
    mount();
    expect(screen.getByTestId('architecture-page')).toBeInTheDocument();
    act(() => {
      window.history.replaceState(null, '', '/ko/architecture/?view=sensors');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    // The address saying one view while the screen draws another is exactly what putting the
    // view in the URL was for.
    expect(screen.getByTestId('harness-sensors-placeholder')).toBeInTheDocument();
  });

  it('opens the view the address names', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=sensors');
    mount();
    expect(screen.getByTestId('harness-sensors-placeholder')).toBeInTheDocument();
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
    // The number never stands bare: its three parts are printed beside it.
    expect(sentence).toHaveTextContent('훅 20개');
    expect(sentence).toHaveTextContent('Git 훅 3개');
    expect(sentence).toHaveTextContent('스크립트 57개');
  });

  it('keeps the unguarded-domain question out of the counted sentence', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=guides');
    state.report = { status: 'ready', sourceRoot: '/repo', report: fakeReport() };
    mount();
    /*
     * A deferral inside a sentence whose other slots are numbers asserts that unguarded domains
     * exist and are merely uncounted. No static read of a repository can claim that, so the
     * deferral stands on its own line, as a question.
     */
    const counted = within(screen.getByTestId('harness-sentence')).getByText(/문서 93개/);
    expect(counted.textContent).not.toMatch(/도메인/);
    expect(screen.getByTestId('harness-sentence-deferred')).toHaveTextContent(
      '아직 재지 않았습니다',
    );
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

describe('the sensors view', () => {
  it('says it is not built and shows no numbers at all', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=sensors');
    mount();
    const panel = screen.getByTestId('harness-sensors-placeholder');
    expect(panel).toHaveTextContent('아직 만들지 않았습니다');
    // No fabricated rows, counts or sample domains: a plausible table would read as coverage.
    expect(panel.querySelectorAll('table, li')).toHaveLength(0);
    expect(panel.textContent).not.toMatch(/\d/);
  });

  it('carries the ambiguity a finished sensors view would also have to carry', () => {
    window.history.replaceState(null, '', '/ko/architecture/?view=sensors');
    mount();
    expect(
      screen.getByText(/잡은 적이 없으면 안전한지 눈먼 건지는 알 수 없습니다/),
    ).toBeInTheDocument();
  });
});
