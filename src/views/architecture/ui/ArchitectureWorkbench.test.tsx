import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../messages/en.json';
import ko from '../../../../messages/ko.json';
import {
  parseArchitectureProfile,
  type ArchitectureHandoffContext,
} from '@/entities/architecture-profile';
import {
  parseArchitectureRecord,
  type ArchitectureRecordSource,
  type ArchitectureRoleEdge,
} from '@/entities/architecture-record';
import {
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import { ArchitectureWorkbench } from './ArchitectureWorkbench';

function renderWorkbench(handoffContext?: ArchitectureHandoffContext) {
  const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ArchitectureWorkbench
        profiles={[profile]}
        handoffContexts={handoffContext ? { [profile.slug]: handoffContext } : undefined}
        copyFeedbackMs={300}
      />
    </NextIntlClientProvider>,
  );
}


/* A receipt parsed through `parseArchitectureRecord`, so a surface/parser drift fails here too. */
function buildRecord({
  source = { kind: 'git', revision: 'a8df66d', dirty: false },
  status = 'violated',
  violationCount = 3,
  excludedByUsage = 18 as number | undefined,
  observedRoleEdges = [] as ArchitectureRoleEdge[],
}: {
  source?: ArchitectureRecordSource;
  status?: 'conforms' | 'violated' | 'unknown';
  violationCount?: number;
  excludedByUsage?: number | undefined;
  observedRoleEdges?: ArchitectureRoleEdge[];
} = {}) {
  return parseArchitectureRecord({
    contract: 'architectureRecord:v1',
    profile: {
      uid: 'e9f5fe88-3711-4b3c-9f77-3b6f809db82c',
      slug: 'atlas-web',
      contentHash: `sha256:${'ab'.repeat(32)}`,
    },
    brief: {
      contract: 'architectureBrief:v1',
      sideEffect: 0,
      measured: {
        at: '2026-08-27T09:30:00.000Z',
        tool: { name: 'ontology-atlas', version: '1.0.0-rc.16' },
        source,
      },
      conformance: {
        status,
        violationCount,
        violations: [],
        observedRoleEdges,
        ...(excludedByUsage === undefined ? {} : { excludedByUsage }),
        unknown: { coverageIncomplete: false, unmappedEdges: 2, unruledEdges: 0, emptyRoles: [] },
      },
    },
  });
}

function renderWithRecord(record: ReturnType<typeof buildRecord>) {
  const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ArchitectureWorkbench profiles={[profile]} recordsByProfile={{ [profile.slug]: record }} />
    </NextIntlClientProvider>,
  );
}

function openEvidence() {
  fireEvent.click(screen.getByTestId('architecture-evidence-rail'));
  return screen.getByTestId('architecture-evidence-dock');
}

/* The zero-profile screen is unreachable in a browser (both samples carry a profile), so jsdom is the only place to measure it. */
/* The chosen role lives in the address and jsdom shares one window per file, so reset it. */
beforeEach(() => {
  window.history.replaceState({}, '', '/ko/architecture/');
});

describe('ArchitectureWorkbench — nothing recorded yet', () => {
  function renderEmpty(
    agent: Pick<
      React.ComponentProps<typeof ArchitectureWorkbench>,
      'agentRoute' | 'agentLabel' | 'onAgentRequest' | 'draftHandoffContext'
    > = {},
  ) {
    return render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ArchitectureWorkbench profiles={[]} {...agent} />
      </NextIntlClientProvider>,
    );
  }

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  /* Without an agent the map discards the queued sentence, so the door must offer only the clipboard. */
  it('offers only the clipboard where a process cannot be spawned, and says why', async () => {
    renderEmpty();
    await waitFor(() =>
      expect(screen.getByTestId('architecture-copy-draft-handoff')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('architecture-draft-with-agent')).toBeNull();
    expect(screen.getByText(/No agent is connected/)).toBeInTheDocument();
  });

  it('starts the drafting task inside Architecture when a guarded agent is available', () => {
    const onAgentRequest = vi.fn();
    renderEmpty({
      agentRoute: 'agent',
      agentLabel: 'Claude Code',
      onAgentRequest,
      draftHandoffContext: {
        sourceRoot: '/Users/dana/product',
        vaultRoot: '/Users/dana/vault',
        cliEntry: null,
      },
    });

    const button = screen.getByTestId('architecture-draft-with-agent');
    fireEvent.click(button);

    expect(onAgentRequest).toHaveBeenCalledWith({
      kind: 'draft',
      prompt: expect.stringContaining('Draft a first architecture profile'),
    });
    expect(onAgentRequest.mock.calls[0]?.[0].prompt).toContain(
      '"sourceRoot":"/Users/dana/product"',
    );
    expect(button).toHaveClass('atlas-touch-floor');
    expect(window.location.pathname).toBe('/ko/architecture/');
  });

  /* `login-needed` would fail with an authentication error once a conversation opens. */
  it('keeps the guarded agent action inert while runtime verification is still pending', () => {
    renderEmpty({ agentRoute: 'checking' });
    expect(screen.getByTestId('architecture-agent-checking')).toBeDisabled();
    expect(screen.queryByTestId('architecture-draft-with-agent')).toBeNull();
    expect(screen.getByTestId('architecture-copy-draft-handoff')).toBeInTheDocument();
  });

  /* The copy may promise only what the click keeps: a proposal to review, from a connected agent. */
  it('promises a proposal from a connected agent, not a finished file', async () => {
    renderEmpty();
    await waitFor(() => expect(screen.getByText(/A connected agent/)).toBeInTheDocument());
    expect(screen.getByText(/proposes a draft/)).toBeInTheDocument();
  });
});

describe('ArchitectureWorkbench', () => {
  it('projects live ACP inspection into the observation lane without calling it a receipt', () => {
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ArchitectureWorkbench
          profiles={[profile]}
          agentActivity={{
            state: 'verifying',
            summary: 'Inspect the current source',
            ontologySlug: null,
            toolName: 'inspect_architecture',
          }}
        />
      </NextIntlClientProvider>,
    );

    openEvidence();
    const observation = screen.getByTestId('architecture-source-check');
    expect(observation).toHaveTextContent('Agent is inspecting source');
    expect(observation).toHaveTextContent('inspect_architecture');
    expect(observation).toHaveTextContent('not an inspection receipt yet');
    expect(screen.getAllByTestId('architecture-observation-motion')).toHaveLength(2);
  });

  it('starts an in-tab inspection from the evidence plane instead of navigating to Map', () => {
    const onAgentRequest = vi.fn();
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ArchitectureWorkbench
          profiles={[profile]}
          agentRoute="agent"
          agentLabel="Claude Code"
          onAgentRequest={onAgentRequest}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByTestId('architecture-agent-action'));
    expect(onAgentRequest).toHaveBeenCalledWith({
      kind: 'verify',
      prompt: expect.stringContaining('Call inspect_architecture'),
      profileSlug: 'atlas-web',
      roleId: null,
    });
    expect(onAgentRequest.mock.calls[0]?.[0].prompt).toContain('"kind":"verify"');
    expect(screen.getByTestId('architecture-agent-action')).toHaveClass('atlas-touch-floor');
    expect(window.location.pathname).toBe('/ko/architecture/');
  });

  it('opens the evidence dock without erasing unrelated route state', () => {
    window.history.replaceState({}, '', '/ko/architecture/?guides=off&fixture=storefront');
    renderWorkbench();

    openEvidence();

    expect(window.location.search).toBe('?guides=off&fixture=storefront');
    expect(screen.getByTestId('architecture-evidence-rail')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('opens with a scoped living blueprint instead of an ontology graph', () => {
    renderWorkbench();
    expect(screen.getByRole('heading', { name: 'Architecture' })).toBeInTheDocument();
    expect(screen.getAllByText('Atlas Web Workbench')).toHaveLength(2);
    expect(screen.getByTestId('architecture-evidence-rail')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    openEvidence();
    expect(screen.getAllByText(/Feature-Sliced Design/)).toHaveLength(3);
    const evidencePlane = screen.getByTestId('architecture-evidence-plane');
    expect(evidencePlane).toHaveTextContent('Human contract');
    expect(evidencePlane).toHaveTextContent('Reviewed structure');
    expect(evidencePlane).toHaveTextContent('Source observation');
    expect(evidencePlane).toHaveTextContent('Delta');
    expect(evidencePlane).toHaveTextContent('Unknown until inspection');
    expect(screen.getByTestId('architecture-graph-box-routing')).toBeInTheDocument();
    expect(screen.getByTestId('architecture-graph-box-shared')).toBeInTheDocument();
    expect(screen.getAllByText('Source check required').length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText(
        'Rules apply to connections that pull in running code. Connections that pull in only type definitions are shown but never counted as violations.',
      ),
    ).toBeInTheDocument();
    const currentProfile = screen.getByTestId('architecture-profile-current');
    expect(currentProfile).toHaveAttribute('aria-current', 'true');
    expect(currentProfile).toHaveTextContent('Current');
    expect(currentProfile.tagName).toBe('DIV');
    expect(screen.queryByTestId('architecture-profile-option')).toBeNull();
  });

  it('keeps only another profile actionable and turns the new current profile into a fact', () => {
    const fsd = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    const hexagonal = parseArchitectureProfile(HEXAGONAL_PROFILE_FRONTMATTER);
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ArchitectureWorkbench profiles={[fsd, hexagonal]} />
      </NextIntlClientProvider>,
    );

    expect(screen.getAllByTestId('architecture-profile-current')).toHaveLength(1);
    const option = screen.getByTestId('architecture-profile-option');
    expect(option).toHaveTextContent(hexagonal.title);
    fireEvent.click(option);
    expect(screen.getByTestId('architecture-profile-current')).toHaveTextContent(hexagonal.title);
    expect(screen.getByTestId('architecture-graph-box-adapter')).toBeInTheDocument();
  });

  /* One band per role carries name, globs and allowances; a separate list repeated them. */
  it('draws each role exactly once', () => {
    renderWorkbench();
    for (const id of ['routing', 'app', 'views', 'widgets', 'features', 'entities', 'shared']) {
      expect(
        screen.getAllByTestId(`architecture-graph-box-${id}`),
        `${id} must be drawn once, not once per block`,
      ).toHaveLength(1);
    }
    /* The glob appears only in the detail panel of a selected role. */
    expect(screen.queryByText('src/shared/**')).toBeNull();
  });

  /*
   * Under `lower-only` drawing all 21 permitted edges restates the order (`docs/DECISIONS.md`,
   * 2026-08-28 (3)); the six adjacent pairs make it a chain. Boxes follow dependency order and the
   * assistive list reads every layer's full reach.
   */
  it('states the whole policy through the columns and the spine, drawing no skip', () => {
    renderWorkbench();
    const order = ['routing', 'app', 'views', 'widgets', 'features', 'entities', 'shared'];

    const graph = screen.getByTestId('architecture-graph');
    const boxOrder = [...graph.querySelectorAll('[data-graph-box]')].map(
      (box) => box.getAttribute('data-graph-box')!,
    );
    expect(boxOrder, 'boxes must appear in dependency order').toEqual(order);
    expect(graph).toHaveAttribute('data-edge-source', 'permitted');
    const drawn = [...graph.querySelectorAll('path[data-edge-drawn="true"]')].map(
      (path) => `${path.getAttribute('data-edge-from')}>${path.getAttribute('data-edge-to')}`,
    );
    expect(drawn.sort()).toEqual([
      'app>views',
      'entities>shared',
      'features>entities',
      'routing>app',
      'views>widgets',
      'widgets>features',
    ]);

    expect(
      screen.getByText(
        'Routes: may depend on Application shell, Views, Widgets, Features, Entities, Shared foundation',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Shared foundation: depends on no other role')).toBeInTheDocument();
  });

  it("draws every permitted edge when the policy is an explicit graph", () => {
    /* Under `explicit` the strokes are the information: adapter reaches three roles directly. */
    const profile = parseArchitectureProfile(HEXAGONAL_PROFILE_FRONTMATTER);
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ArchitectureWorkbench profiles={[profile]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('architecture-graph')).toHaveAttribute(
      'data-edge-source',
      'permitted',
    );
    expect(screen.getByText('Adapters may depend on Domain')).toBeInTheDocument();
    expect(screen.getByText('Adapters may depend on Ports')).toBeInTheDocument();
    expect(screen.getByText('Ports may depend on Domain')).toBeInTheDocument();
  });

  it("writes a role's reach in role names in its detail panel", () => {
    const profile = parseArchitectureProfile(HEXAGONAL_PROFILE_FRONTMATTER);
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ArchitectureWorkbench profiles={[profile]} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId('architecture-graph-box-adapter'));
    expect(screen.getByTestId('architecture-reach-adapter')).toHaveTextContent(
      'may depend on Application · Ports · Domain',
    );

    fireEvent.click(screen.getByTestId('architecture-graph-box-domain'));
    expect(screen.getByTestId('architecture-reach-domain')).toHaveTextContent(
      'depends on no other role',
    );
  });

  /* Selection replaced hover focus and the reach pulse (`docs/DECISIONS.md`, 2026-08-28 (3)). */
  it('selects a role, says so, and answers with that role in the panel', () => {
    renderWorkbench();
    const views = screen.getByTestId('architecture-graph-box-views');
    expect(views).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('architecture-role-detail-empty')).toBeInTheDocument();

    fireEvent.click(views);
    expect(views).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('architecture-role-detail')).toHaveAttribute('data-role', 'views');
    expect(screen.getByTestId('architecture-role-detail-motion')).toHaveClass('topology-chrome-in');
    expect(screen.queryByTestId('architecture-role-detail-empty')).toBeNull();

    fireEvent.click(screen.getByTestId('architecture-graph-box-shared'));
    expect(views).toHaveAttribute('aria-pressed', 'false');
    const shared = screen.getByTestId('architecture-graph-box-shared');
    expect(screen.getByTestId('architecture-role-detail')).toHaveAttribute('data-role', 'shared');

    /* Closing the panel lets go of the role, so no pressed face sits without an answer. */
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(shared).toHaveAttribute('aria-pressed', 'false');
    expect(shared).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(shared);
    expect(shared).toHaveAttribute('aria-pressed', 'true');
    expect(shared).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(shared);
    expect(screen.getByTestId('architecture-role-detail-empty')).toBeInTheDocument();
  });

  /* Modules come from a read-only directory walk, never an import scan, so they exist only with a listing. */
  it('fills the panel with the source modules a role\'s globs contain, when a listing exists', () => {
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ArchitectureWorkbench
          profiles={[profile]}
          sourceListingCapable
          sourceModulesByProfile={{
            [profile.slug]: {
              views: [
                { name: 'home', path: 'src/views/home', kind: 'dir' },
                { name: 'docs-vault', path: 'src/views/docs-vault', kind: 'dir' },
              ],
              shared: [{ name: 'cn.ts', path: 'src/shared/lib/cn.ts', kind: 'file' }],
            },
          }}
        />
      </NextIntlClientProvider>,
    );

    /* A role that declares a summary prints it instead of counts; `widgets` declares none and keeps them. */
    /* The break is the box's, so the whole sentence is asserted on the accessible name. */
    expect(screen.getByTestId('architecture-graph-box-views').getAttribute('aria-label')).toContain(
      'One module per route-level screen',
    );
    expect(screen.getByTestId('architecture-box-line-views')).toHaveTextContent(/^One module per/);
    expect(screen.getByTestId('architecture-graph-box-widgets')).toHaveTextContent('0 modules');

    fireEvent.click(screen.getByTestId('architecture-graph-box-views'));
    const listed = screen.getByTestId('architecture-modules-views');
    expect(listed).toHaveTextContent('home');
    expect(listed).toHaveTextContent('src/views/docs-vault');
  });

  /* Reviewed concepts are the meaning layer, separate from source modules, answering the selection alike. */
  it("answers a selection with the role's reviewed concepts, labeled as concepts", () => {
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ArchitectureWorkbench
          profiles={[profile]}
          conceptsByProfile={{
            [profile.slug]: {
              views: [
                {
                  slug: 'elements/home',
                  title: 'Home',
                  kind: 'element',
                  path: 'src/views/home',
                  dependsOn: [],
                  relatesTo: [],
                },
              ],
            },
          }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('architecture-graph-box-views').getAttribute('aria-label')).toContain(
      'One module per route-level screen',
    );
    expect(screen.getByTestId('architecture-box-line-views')).toHaveTextContent(/^One module per/);

    fireEvent.click(screen.getByTestId('architecture-graph-box-views'));
    const detail = screen.getByTestId('architecture-concepts-views');
    expect(detail).toHaveTextContent('Reviewed concepts in this role');
    expect(detail).toHaveTextContent('Home');
  });

  it('keeps the workbench focused on architecture facts instead of demo playback or prose stages', () => {
    renderWorkbench();
    expect(screen.queryByTestId('architecture-graph-run')).not.toBeInTheDocument();
    expect(screen.queryByTestId('architecture-walk')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByText('Architecture-first agent plan')).not.toBeInTheDocument();
    expect(screen.queryByText('Verify the actual change')).not.toBeInTheDocument();
  });

  it('copies an executable architecture handoff instead of a generic prompt', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderWorkbench({
      sourceRoot: '/Users/dana/Atlas Source',
      vaultRoot: '/Users/dana/Atlas Source/docs/ontology',
      cliEntry: '/Users/dana/Atlas Source/cli/src/index.mjs',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copy the “Inspect source” task' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('This is a verification task'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("--profile 'atlas-web' --json"));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("--vault '/Users/dana/Atlas Source/docs/ontology'"),
    );
    await waitFor(() => {
      /* The button keeps its width; the polite status region announces the task sentence. */
      const buttons = screen.getAllByRole('button', { name: 'Copied' });
      expect(buttons).toHaveLength(1);
      for (const button of buttons) {
        expect(button).toHaveAttribute('data-architecture-copy-state', 'copied');
      }
      expect(
        screen.getAllByRole('status').some((node) => node.textContent === 'Copied “Inspect source”. Paste it into your agent'),
      ).toBe(true);
    });
  });

  /* The chooser offers the other two tasks; choosing one hands or copies that task, not the default. */
  it('offers the other agent tasks beside the derived one and copies the chosen sentence', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderWorkbench();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose another agent task' }));
    const menu = screen.getByRole('menu');
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.getAttribute('data-architecture-agent-task'))).toEqual([
      'verify',
      'change',
      'improve',
    ]);
    expect(items[0]).toHaveTextContent('Inspect source');
    expect(items[0]).toHaveAttribute('aria-current', 'true');
    expect(menu).toHaveTextContent("Choosing copies that task's sentence.");
    fireEvent.click(screen.getByTestId('architecture-agent-task-improve'));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('This is an improvement-finding task'),
    );
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"kind":"improve"'));
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    /* The confirmation names the task, then leaves so the copy action returns. */
    await waitFor(() =>
      expect(
        screen.getAllByRole('status').some((node) => node.textContent === 'Copied “Find improvements”. Paste it into your agent'),
      ).toBe(true),
    );
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copy the “Find improvements” task' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Choose another agent task' })).toHaveFocus();
  });

  it('keeps a retryable clipboard error on screen', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    renderWorkbench();
    fireEvent.click(screen.getByRole('button', { name: 'Copy the “Inspect source” task' }));
    await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: 'Could not copy. Try again' });
      expect(buttons).toHaveLength(1);
      for (const button of buttons) {
        expect(button).toHaveAttribute('data-architecture-copy-state', 'error');
      }
    });
  });
});

/*
 * A receipt is a dated measurement, not a live claim: the stamp uses the receipt's vocabulary
 * (a short sha for git, the fingerprint sentence for folders, the dirty suffix), the verdict always
 * rides with its counts, and the surface admits it cannot re-verify the source.
 */
describe('ArchitectureWorkbench — persisted conformance receipt', () => {
  it('renders a git receipt as a dated stamp with counts beside the verdict, never a bare status', () => {
    renderWithRecord(buildRecord());
    expect(screen.getByTestId('architecture-role-ledger-routing')).toHaveTextContent(
      'none recorded',
    );
    openEvidence();
    const pill = screen.getByTestId('architecture-record-summary');
    expect(pill).toHaveTextContent('Violated · 3 rule violations · 2 dependencies with no assigned role · 18 type-only edges');
    expect(screen.getByTestId('architecture-record-stamp')).toHaveTextContent(
      'Checked 2026-08-27 at commit a8df66d',
    );
    // The receipt replaces the amber "not measured" pill; both at once would be two claims.
    expect(screen.queryByText('Source check required')).toBeNull();
    expect(screen.getByTestId('architecture-record-cannot-confirm')).toHaveTextContent(
      'This screen does not re-check now. The record below is the result of the last check.',
    );
  });

  it('marks a dirty git measurement as taken with uncommitted edits', () => {
    renderWithRecord(buildRecord({ source: { kind: 'git', revision: 'a8df66d', dirty: true } }));
    openEvidence();
    expect(screen.getByTestId('architecture-record-stamp')).toHaveTextContent(
      'Checked 2026-08-27 at commit a8df66d with uncommitted edits',
    );
  });

  it('renders a folder receipt with the fingerprint sentence and no sha-looking token', () => {
    renderWithRecord(
      buildRecord({
        source: { kind: 'folder', fingerprint: `sha256:${'cd'.repeat(32)}` },
        status: 'conforms',
        violationCount: 0,
        excludedByUsage: undefined,
      }),
    );
    openEvidence();
    const stamp = screen.getByTestId('architecture-record-stamp');
    expect(stamp).toHaveTextContent('Checked 2026-08-27 against a content fingerprint of the source folder');
    expect(stamp.textContent).not.toMatch(/\b[0-9a-f]{7,}\b/);
    expect(screen.getByTestId('architecture-record-summary')).toHaveTextContent(
      'Conforms · 0 rule violations · 2 dependencies with no assigned role',
    );
  });

  it('wears the existing signal tone families: error for violated, success for conforms, amber for unknown', () => {
    const { unmount } = renderWithRecord(buildRecord());
    openEvidence();
    expect(screen.getByTestId('architecture-record-marker').className).toContain('--color-danger');
    unmount();

    const conforming = renderWithRecord(buildRecord({ status: 'conforms', violationCount: 0 }));
    openEvidence();
    expect(screen.getByTestId('architecture-record-marker').className).toContain('--color-success');
    conforming.unmount();

    renderWithRecord(buildRecord({ status: 'unknown', violationCount: 0 }));
    openEvidence();
    expect(screen.getByTestId('architecture-record-marker').className).toContain('--color-amber-source');
  });

  it('keeps the unchanged amber "Source check required" state when no record exists', () => {
    renderWorkbench();
    expect(screen.getByText('Source check required')).toBeInTheDocument();
    expect(screen.queryByTestId('architecture-record-summary')).toBeNull();
    expect(screen.queryByTestId('architecture-record-stamp')).toBeNull();
    expect(screen.queryByTestId('architecture-record-cannot-confirm')).toBeNull();
  });

  /* It names the command that writes the record, and offers no control to measure source itself. */
  it('tells the reader what produces the missing measurement, without offering to run it', () => {
    renderWorkbench();
    openEvidence();
    expect(screen.getByTestId('architecture-source-check-next')).toHaveTextContent(
      'atlas architecture --record',
    );
    expect(screen.getByTestId('architecture-source-check-next')).toHaveTextContent(
      '.ontology-atlas/architecture/profile-slug.json',
    );
    expect(screen.getByTestId('architecture-source-check-next')).toHaveTextContent(
      'never changes the reviewed structure',
    );
    expect(
      screen.getByTestId('architecture-source-check').querySelector('button, a'),
    ).toBeNull();
  });
});

/* Only the installed app reads a source folder, and it must never offer its own download (`AGENTS.md`). */
describe('the source-listing note', () => {
  it('offers the installed app only when the runtime is not the app itself', () => {
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    const browser = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ArchitectureWorkbench profiles={[profile]} offersInstalledApp />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('architecture-source-unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('architecture-get-installed-app')).toHaveAttribute(
      'href',
      expect.stringContaining('/download'),
    );
    browser.unmount();

    renderWorkbench();
    expect(screen.getByTestId('architecture-source-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('architecture-get-installed-app')).toBeNull();
  });
});



/*
 * `summary_<role>_<locale>` restates the canonical sentence for the screen; `summary_<role>` stays
 * the fact that briefs, prompts and CLI lines print.
 */
describe('the role sentence in the reader\'s language', () => {
  const KOREAN_VIEWS = '라우트가 열 수 있는 화면 하나마다 모듈 하나입니다.';

  function renderIn(locale: 'en' | 'ko') {
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    return render(
      <NextIntlClientProvider locale={locale} messages={locale === 'ko' ? ko : en}>
        <ArchitectureWorkbench profiles={[profile]} />
      </NextIntlClientProvider>,
    );
  }

  it('prints the Korean sentence on the views card and in the role dock at ko', () => {
    renderIn('ko');
    expect(screen.getByTestId('architecture-graph-box-views').getAttribute('aria-label')).toContain(
      KOREAN_VIEWS,
    );
    expect(screen.getByTestId('architecture-box-line-views')).toHaveTextContent(/^라우트가/);

    fireEvent.click(screen.getByTestId('architecture-graph-box-views'));
    expect(screen.getByTestId('architecture-role-summary-views')).toHaveTextContent(KOREAN_VIEWS);
  });

  it('prints the canonical English sentence at en', () => {
    renderIn('en');
    expect(screen.getByTestId('architecture-graph-box-views').getAttribute('aria-label')).toContain(
      'One module per route-level screen',
    );
    expect(screen.getByTestId('architecture-box-line-views')).toHaveTextContent(/^One module per/);
  });

  /* A profile translated one role at a time shows reviewed English for the rest, never a blank. */
  it('falls back to the canonical sentence for a role nobody translated', () => {
    renderIn('ko');
    fireEvent.click(screen.getByTestId('architecture-graph-box-routing'));
    expect(screen.getByTestId('architecture-role-summary-routing')).toHaveTextContent(
      'Locale-prefixed Next entry wrappers.',
    );
  });
});

/* An unreadable profile is named on the screen instead of failing the whole route. */
describe('an unreadable architecture document', () => {
  it('names the document and the parser sentence beside the profiles that did load', () => {
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ArchitectureWorkbench
          profiles={[profile]}
          profileProblems={[
            {
              documentSlug: 'architecture/broken',
              message: 'summary_ghost_ko describes a role that does not exist.',
            },
          ]}
        />
      </NextIntlClientProvider>,
    );
    const notice = screen.getByTestId('architecture-profile-problem');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveTextContent('architecture/broken');
    expect(notice).toHaveTextContent('summary_ghost_ko describes a role that does not exist.');
    expect(screen.getByTestId('architecture-graph-box-views')).toBeInTheDocument();
  });
});
