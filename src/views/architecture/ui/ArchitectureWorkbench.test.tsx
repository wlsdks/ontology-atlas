import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The desktop bridge is a Tauri capability; jsdom has none. Both branches are driven from here so
 * the zero-agent path and the ready-agent path are each measured, rather than only whichever one
 * the test environment happens to produce.
 */
let bridgeAvailable = false;
let detectedRuntimes: Array<{ id: string; state: string }> = [];
vi.mock('@/shared/lib/tauri-acp', () => ({
  isAcpBridgeAvailable: () => bridgeAvailable,
  detectAcpRuntimes: async () => (bridgeAvailable ? detectedRuntimes : null),
}));

import en from '../../../../messages/en.json';
import {
  parseArchitectureProfile,
  type ArchitectureHandoffContext,
} from '@/entities/architecture-profile';
import { parseArchitectureRecord, type ArchitectureRecordSource } from '@/entities/architecture-record';
import {
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import { ArchitectureWorkbench } from './ArchitectureWorkbench';
import { consumeQueuedAgentChatIntent } from '@/shared/lib/agent-chat-intent';

function renderWorkbench(handoffContext?: ArchitectureHandoffContext) {
  const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ArchitectureWorkbench
        profiles={[profile]}
        handoffContexts={handoffContext ? { [profile.slug]: handoffContext } : undefined}
      />
    </NextIntlClientProvider>,
  );
}


/*
 * A persisted conformance receipt, parsed the way the page reads the sidecar — through
 * `parseArchitectureRecord`, so these tests also fail if the surface and the parser drift apart.
 */
function buildRecord({
  source = { kind: 'git', revision: 'a8df66d', dirty: false },
  status = 'violated',
  violationCount = 3,
  typeOnlyEdgeCount = 18 as number | undefined,
}: {
  source?: ArchitectureRecordSource;
  status?: 'conforms' | 'violated' | 'unknown';
  violationCount?: number;
  typeOnlyEdgeCount?: number | undefined;
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
        ...(typeOnlyEdgeCount === undefined ? {} : { typeOnlyEdgeCount }),
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

/*
 * ⚠️ **The empty state is what a real user actually sees, and it is not reachable from a browser.**
 * Both bundled samples carry a profile by contract, and `useDataSourceMode` needs a real folder
 * handle — so this jsdom render is the only place the zero-profile screen can be measured at all.
 * It was inert on the installed rc.15: the button navigated to the map and carried nothing, while
 * the sentence above it promised an agent would read the folder and the imports and draft this.
 */
describe('ArchitectureWorkbench — nothing recorded yet', () => {
  function renderEmpty() {
    return render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ArchitectureWorkbench profiles={[]} />
      </NextIntlClientProvider>,
    );
  }

  beforeEach(() => {
    window.sessionStorage.clear();
    bridgeAvailable = false;
    detectedRuntimes = [];
  });

  /*
   * ⚠️ **The agent door was silently a dead end without an agent, and that hole was shipped.**
   *
   * The button queues the sentence and moves to the map, but the map resolves the runner as
   * `runtimeId ?? acpRuntime?.id` and with neither it returns early — the queued sentence is
   * consumed and discarded. So the person pressed a button, changed screens, and nothing happened:
   * the very defect the button was built to fix, one route to the right.
   */
  it('offers only the clipboard where a process cannot be spawned, and says why', async () => {
    renderEmpty();
    await waitFor(() =>
      expect(screen.getByTestId('architecture-copy-draft-handoff')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('architecture-draft-from-code')).toBeNull();
    expect(screen.getByText(/No agent is connected/)).toBeInTheDocument();
  });

  it('hands the drafting task to the agent when one can actually be started', async () => {
    bridgeAvailable = true;
    detectedRuntimes = [{ id: 'claude-acp', state: 'ready' }];
    renderEmpty();

    const button = await screen.findByTestId('architecture-draft-from-code');
    fireEvent.click(button);

    const queued = consumeQueuedAgentChatIntent();
    expect(queued, 'the click must leave a task behind, not just a destination').toBeDefined();
    /*
     * ⚠️ The runner must be named. Queuing null navigated and opened nothing in the installed app:
     * a runner that is startable on this machine is not one the map has selected, and on a fresh
     * mount there is no selection to fall back to, so the sentence was consumed and discarded.
     */
    expect(queued?.runtimeId).toBe('claude-acp');
    expect(queued?.prompt).toContain('Draft a first architecture profile');
  });

  /*
   * `login-needed` is present but will die with an authentication error once a conversation opens —
   * the exact failure that state exists to stop. It must not read as a reachable agent.
   */
  it('does not offer the agent door to a runner that is only installed, not usable', async () => {
    bridgeAvailable = true;
    detectedRuntimes = [{ id: 'claude-acp', state: 'login-needed' }];
    renderEmpty();
    await waitFor(() =>
      expect(screen.getByTestId('architecture-copy-draft-handoff')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('architecture-draft-from-code')).toBeNull();
  });

  /*
   * The copy stated as present fact something the product did not do. It may promise only what the
   * click can keep — a proposal the person reviews, from an agent that has to be connected.
   */
  it('promises a proposal from a connected agent, not a finished file', async () => {
    renderEmpty();
    await waitFor(() => expect(screen.getByText(/A connected agent/)).toBeInTheDocument());
    expect(screen.getByText(/proposes a draft/)).toBeInTheDocument();
  });
});

describe('ArchitectureWorkbench', () => {
  it('opens with a scoped living blueprint instead of an ontology graph', () => {
    renderWorkbench();
    expect(screen.getByRole('heading', { name: 'Architecture' })).toBeInTheDocument();
    expect(screen.getAllByText('Atlas Web Workbench')).toHaveLength(2);
    // Twice on purpose: the stage's pattern chip, and the scope rail's profile caption.
    expect(screen.getAllByText(/Feature-Sliced Design/)).toHaveLength(2);
    expect(screen.getByTestId('architecture-graph-box-routing')).toBeInTheDocument();
    expect(screen.getByTestId('architecture-graph-box-shared')).toBeInTheDocument();
    expect(screen.getByText('Source check required')).toBeInTheDocument();
    expect(screen.getByTestId('architecture-bottom-tab-reserve')).toHaveClass(
      'h-[var(--topology-mobile-bottom-tab-reserve)]',
      'lg:hidden',
    );
  });

  /*
   * ⚠️ **The screen used to say everything twice.** A diagram of the roles sat above a list of the
   * same roles, so `adapter` and its globs appeared in two places at once. The owner's reaction to
   * the installed build was that it neither looked good nor read as a flow -- and the redundancy is
   * why: with the information split across two blocks neither half could use the width, leaving a
   * screen that was simultaneously repetitive and empty. One band per role now carries the name,
   * the globs and the allowances together.
   */
  it('draws each role exactly once', () => {
    renderWorkbench();
    for (const id of ['routing', 'app', 'views', 'widgets', 'features', 'entities', 'shared']) {
      expect(
        screen.getAllByTestId(`architecture-graph-box-${id}`),
        `${id} must be drawn once, not once per block`,
      ).toHaveLength(1);
    }
    /* The glob lives in the detail panel now, and only for the selected role, so it appears
       nowhere at all until a box is chosen. That is the strongest form of "not duplicated". */
    expect(screen.queryByText('src/shared/**')).toBeNull();
  });

  /*
   * ⚠️ **The policy is still fully stated, and the columns are how.** Under `lower-only` the
   * permitted set is "everything to my right", which the column order already says: this profile
   * has 21 permitted edges among 7 roles and drawing them would restate the order twenty-one
   * times (`docs/DECISIONS.md`, 2026-08-28 (3)). What must survive that decision, and what this
   * test pins: the boxes appear in dependency order left to right; no permitted stroke is drawn;
   * and the assistive list still reads every layer's reach aloud, layer by layer.
   */
  it('states the whole policy through the columns, drawing no derivable edge', () => {
    renderWorkbench();
    const order = ['routing', 'app', 'views', 'widgets', 'features', 'entities', 'shared'];

    const graph = screen.getByTestId('architecture-graph');
    const boxOrder = [...graph.querySelectorAll('[data-graph-box]')].map(
      (box) => box.getAttribute('data-graph-box')!,
    );
    expect(boxOrder, 'boxes must appear in dependency order').toEqual(order);
    expect(graph).toHaveAttribute('data-edge-source', 'none');
    expect(screen.queryByTestId('architecture-graph-edges')).toBeNull();

    // The assistive list keeps stating the same reach in its own words.
    expect(
      screen.getByText(
        'Routes: may depend on Application shell, Views, Widgets, Features, Entities, Shared foundation',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Shared foundation: depends on no other role')).toBeInTheDocument();
  });

  it("draws every permitted edge when the policy is an explicit graph", () => {
    /*
     * The mirror of the test above. Under `explicit` the permitted set cannot be read off the
     * order at all: adapter reaches three roles directly, and a reader who assumed a chain would
     * be wrong. So here the strokes are the information and every one of them is drawn.
     */
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

  /*
   * ⚠️ **Two interactions were removed with the band shape, and this test replaces both**
   * (`docs/DECISIONS.md`, 2026-08-28 (3)). Hover focus used to raise a layer and everything it
   * could reach while receding the rest, and a staggered pulse used to run down the gaps between
   * a focused layer and its deepest reach. Neither survives a graph whose boxes are 64px tall and
   * whose edges are drawn between them rather than implied by adjacency. What replaces them is
   * selection: a box is chosen, it says so, and the panel answers with that role.
   */
  it('selects a role, says so, and answers with that role in the panel', () => {
    renderWorkbench();
    const views = screen.getByTestId('architecture-graph-box-views');
    expect(views).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('architecture-role-detail-empty')).toBeInTheDocument();

    fireEvent.click(views);
    expect(views).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('architecture-role-detail')).toHaveAttribute('data-role', 'views');
    expect(screen.queryByTestId('architecture-role-detail-empty')).toBeNull();

    fireEvent.click(screen.getByTestId('architecture-graph-box-shared'));
    expect(views).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('architecture-role-detail')).toHaveAttribute('data-role', 'shared');

    /* Clicking the chosen box again lets go of it, so a reader can get back to the whole map. */
    fireEvent.click(screen.getByTestId('architecture-graph-box-shared'));
    expect(screen.getByTestId('architecture-role-detail-empty')).toBeInTheDocument();
  });

  /*
   * ⚠️ **A role's source modules come from a read-only directory walk of the bound project
   * source** (owner correction, 2026-08-27: the ontology is the meaning map, architecture is what
   * the source contains). Never an import scan, so they exist only where a listing exists. They
   * live in the detail panel now rather than inside a band; the box carries only the count.
   */
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

    /* The count is on the box, so a reader sees where the weight is without choosing anything. */
    expect(screen.getByTestId('architecture-graph-box-views')).toHaveTextContent('2 modules');
    expect(screen.getByTestId('architecture-graph-box-widgets')).toHaveTextContent('0 modules');

    fireEvent.click(screen.getByTestId('architecture-graph-box-views'));
    const listed = screen.getByTestId('architecture-modules-views');
    expect(listed).toHaveTextContent('home');
    expect(listed).toHaveTextContent('src/views/docs-vault');
  });

  /*
   * The reviewed concepts are the meaning layer, kept named and separate from the source layer
   * above them, and they answer the selection the same way the modules do.
   */
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
    expect(screen.getByTestId('architecture-graph-box-views')).toHaveTextContent('1 concept');

    fireEvent.click(screen.getByTestId('architecture-graph-box-views'));
    const detail = screen.getByTestId('architecture-concepts-views');
    expect(detail).toHaveTextContent('Reviewed concepts in this layer');
    expect(detail).toHaveTextContent('Home');
  });

  it('keeps the same blueprint while switching from understand to plan and verify', () => {
    renderWorkbench();
    const box = screen.getByTestId('architecture-graph-box-features');
    const boxClassName = box.className;

    fireEvent.click(screen.getByRole('radio', { name: 'Plan' }));
    expect(screen.getByText('Architecture-first agent plan')).toBeInTheDocument();
    expect(screen.getByText(/inspect_architecture/)).toBeInTheDocument();
    expect(screen.getByTestId('architecture-graph-box-features')).toBe(box);
    expect(box.className).toBe(boxClassName);

    fireEvent.click(screen.getByRole('radio', { name: 'Verify' }));
    expect(screen.getByText('Verify the actual change')).toBeInTheDocument();
    expect(screen.getByText(/unknown is not compliant/i)).toBeInTheDocument();
    expect(screen.getByTestId('architecture-graph-box-features')).toBe(box);
  });

  it('reanchors a prior scroll end after a taller workflow stage mounts', async () => {
    renderWorkbench();
    const scroller = screen.getByTestId('architecture-layout-scroll');
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 });
    Object.defineProperty(scroller, 'scrollHeight', {
      configurable: true,
      get: () => screen.getByTestId('architecture-blueprint').parentElement
        ?.querySelector('[data-architecture-mode="plan"]')
        ? 600
        : 500,
    });
    scroller.scrollTop = 300;

    fireEvent.click(screen.getByRole('radio', { name: 'Plan' }));

    expect(scroller).toHaveAttribute('data-architecture-scroll-reanchor', 'mode-end');
    await waitFor(() => expect(scroller.scrollTop).toBe(400));
  });

  it('copies an executable architecture handoff instead of a generic prompt', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderWorkbench({
      sourceRoot: '/Users/dana/Atlas Source',
      vaultRoot: '/Users/dana/Atlas Source/docs/ontology',
      cliEntry: '/Users/dana/Atlas Source/cli/src/index.mjs',
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy the sentence for your agent' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('architectureChangePlan:v1'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("--profile 'atlas-web' --json"));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("--vault '/Users/dana/Atlas Source/docs/ontology'"),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied. Paste it into your agent' }))
      .toHaveAttribute('data-architecture-copy-state', 'copied'));
  });

  it('keeps a retryable clipboard error on screen', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    renderWorkbench();
    fireEvent.click(screen.getByRole('radio', { name: 'Plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy the sentence for your agent' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Could not copy. Try again' }))
      .toHaveAttribute('data-architecture-copy-state', 'error'));
  });
});

/*
 * ⚠️ **A conformance receipt is a dated machine measurement, not a live claim** (2026-08-27
 * council, point 5). What these tests pin: the stamp renders the receipt's own vocabulary (date,
 * commit short sha for git, the fingerprint sentence — never a sha — for folders, the dirty
 * suffix); the verdict never appears as a bare status word (the counts always ride beside it);
 * the tones reuse the existing signal families; and the surface admits it cannot re-verify the
 * source rather than presenting the stamp as current.
 */
describe('ArchitectureWorkbench — persisted conformance receipt', () => {
  it('renders a git receipt as a dated stamp with counts beside the verdict, never a bare status', () => {
    renderWithRecord(buildRecord());
    const pill = screen.getByTestId('architecture-record-pill');
    // The verdict and its accounting are one line: N violations · M edges unmapped · type-only labelled.
    expect(pill).toHaveTextContent('Violated · 3 violations · 2 edges unmapped · 18 type-only edges');
    expect(screen.getByTestId('architecture-record-stamp')).toHaveTextContent(
      'Checked 2026-08-27 at commit a8df66d',
    );
    // The receipt replaces the amber "not measured" pill; both at once would be two claims.
    expect(screen.queryByText('Source check required')).toBeNull();
    // This surface cannot re-probe the source, and must say so instead of claiming currency.
    expect(screen.getByTestId('architecture-record-cannot-confirm')).toHaveTextContent(
      'This browser cannot confirm the source still matches this record.',
    );
  });

  it('marks a dirty git measurement as taken with uncommitted edits', () => {
    renderWithRecord(buildRecord({ source: { kind: 'git', revision: 'a8df66d', dirty: true } }));
    expect(screen.getByTestId('architecture-record-stamp')).toHaveTextContent(
      'Checked 2026-08-27 at commit a8df66d with uncommitted edits',
    );
  });

  /* A fingerprint is not a revision: the folder stamp must never show a sha-looking token. */
  it('renders a folder receipt with the fingerprint sentence and no sha-looking token', () => {
    renderWithRecord(
      buildRecord({
        source: { kind: 'folder', fingerprint: `sha256:${'cd'.repeat(32)}` },
        status: 'conforms',
        violationCount: 0,
        typeOnlyEdgeCount: undefined,
      }),
    );
    const stamp = screen.getByTestId('architecture-record-stamp');
    expect(stamp).toHaveTextContent('Checked 2026-08-27 against a content fingerprint of the source folder');
    expect(stamp.textContent).not.toMatch(/\b[0-9a-f]{7,}\b/);
    // Counts still ride beside the verdict even when everything is zero.
    expect(screen.getByTestId('architecture-record-pill')).toHaveTextContent(
      'Conforms · 0 violations · 2 edges unmapped',
    );
  });

  it('wears the existing signal tone families: error for violated, success for conforms, amber for unknown', () => {
    const { unmount } = renderWithRecord(buildRecord());
    expect(screen.getByTestId('architecture-record-pill').className).toContain('--color-danger');
    unmount();

    const conforming = renderWithRecord(buildRecord({ status: 'conforms', violationCount: 0 }));
    expect(screen.getByTestId('architecture-record-pill').className).toContain('--color-success');
    conforming.unmount();

    renderWithRecord(buildRecord({ status: 'unknown', violationCount: 0 }));
    expect(screen.getByTestId('architecture-record-pill').className).toContain('--color-amber-source');
  });

  it('keeps the unchanged amber "Source check required" state when no record exists', () => {
    renderWorkbench();
    expect(screen.getByText('Source check required')).toBeInTheDocument();
    expect(screen.queryByTestId('architecture-record-pill')).toBeNull();
    // No record means no date anywhere: an absent measurement must not look dated.
    expect(screen.queryByTestId('architecture-record-stamp')).toBeNull();
    expect(screen.queryByTestId('architecture-record-cannot-confirm')).toBeNull();
  });

  /*
   * ⚠️ The pill used to end the sentence: a warning naming an absence with nowhere to go
   * (fresh-eyes walkthrough, 2026-08-28). It must name the command that writes the record —
   * and it must not grow a control claiming this screen can measure the source, which it cannot.
   */
  it('tells the reader what produces the missing measurement, without offering to run it', () => {
    renderWorkbench();
    expect(screen.getByTestId('architecture-source-check-next')).toHaveTextContent(
      'atlas architecture --record',
    );
    expect(
      screen.getByTestId('architecture-source-check').querySelector('button, a'),
    ).toBeNull();
  });
});
