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

const order_all = ['routing', 'app', 'views', 'widgets', 'features', 'entities', 'shared'];

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
    expect(screen.getByTestId('architecture-role-routing')).toBeInTheDocument();
    expect(screen.getByTestId('architecture-role-shared')).toBeInTheDocument();
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
        screen.getAllByTestId(`architecture-role-${id}`),
        `${id} must be drawn once, not once per block`,
      ).toHaveLength(1);
    }
    // The glob is the part that was literally duplicated, so it is what the guard reads.
    expect(screen.getAllByText('src/shared/**')).toHaveLength(1);
  });

  /*
   * ⚠️ **The policy is still fully stated, without the dot matrix** (owner decision 2026-08-27:
   * under `lower-only` the matrix repeated what the sentence, the band order, and the connectors
   * already said, so it was removed as a second notation for one fact). What must survive its
   * removal, and what this test pins:
   *
   * - the bands appear in dependency order, deepest last, so the order itself is the rule;
   * - the assistive list still reads every layer's reach aloud, layer by layer;
   * - a `lower-only` profile writes no per-band reach caption (that would be the same seven-fold
   *   echo the dots were), while an `explicit` profile writes each role's reach in role names.
   */
  it('states the whole policy without a matrix', () => {
    renderWorkbench();
    const order = ['routing', 'app', 'views', 'widgets', 'features', 'entities', 'shared'];

    const flow = screen.getByTestId('architecture-flow');
    const bandOrder = [...flow.querySelectorAll('[data-testid^="architecture-rung-"]')].map(
      (band) => band.getAttribute('data-testid')!.replace('architecture-rung-', ''),
    );
    expect(bandOrder, 'bands must appear in dependency order').toEqual(order);

    // lower-only: the stage subtitle owns the sentence; no per-band caption repeats it.
    expect(screen.queryByTestId('architecture-reach-routing')).toBeNull();

    // The assistive list still states each layer's reach in words.
    expect(
      screen.getByText(
        'Routes: may depend on Application shell, Views, Widgets, Features, Entities, Shared foundation',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Shared foundation: depends on no other role')).toBeInTheDocument();

    // One connector meaning, one legend sentence for it.
    expect(screen.getByTestId('architecture-flow-inward')).toBeInTheDocument();
  });

  it('writes each role\'s reach in role names when the policy is an explicit graph', () => {
    const profile = parseArchitectureProfile(HEXAGONAL_PROFILE_FRONTMATTER);
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ArchitectureWorkbench profiles={[profile]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('architecture-reach-adapter')).toHaveTextContent(
      'may depend on Application · Ports · Domain',
    );
    expect(screen.getByTestId('architecture-reach-domain')).toHaveTextContent(
      'depends on no other role',
    );
  });

  /*
   * ⚠️ **The interaction is the part a static picture cannot do.** "Can you see a flow in this?"
   * was asked of a drawing with no way to ask it a question. Focusing a layer raises it and
   * everything it may reach and recedes the rest -- Shneiderman's focus-plus-context, and the same
   * ego-focus the map already uses. Keyboard focus drives it too, so the reach is not pointer-only.
   */
  it('raises a focused layer and its reach, and recedes the rest', () => {
    renderWorkbench();
    const stateOf = (id: string) =>
      screen.getByTestId(`architecture-role-${id}`).getAttribute('data-focus-state');

    expect(order_all.map(stateOf).every((state) => state === 'rest')).toBe(true);

    fireEvent.focus(screen.getByTestId('architecture-role-features'));
    expect(stateOf('features')).toBe('focused');
    // Everything beneath it is reachable...
    expect(stateOf('entities')).toBe('reached');
    expect(stateOf('shared')).toBe('reached');
    // ...and everything above it is not.
    expect(stateOf('widgets')).toBe('dimmed');
    expect(stateOf('routing')).toBe('dimmed');

    fireEvent.blur(screen.getByTestId('architecture-role-features'));
    expect(stateOf('features')).toBe('rest');
  });

  /*
   * The flow run is motion answering a question — "which way does this layer's reach flow" — and
   * it exists only between the focused layer and its deepest reach, one pulse per gap, never as an
   * ambient loop. The gap above the focused layer stays still: nothing flows into a layer from
   * below, and drawing motion there would be an invented fact.
   */
  it('sends the flow run down the gaps between a focused layer and its reach', () => {
    renderWorkbench();
    fireEvent.focus(screen.getByTestId('architecture-role-features'));
    // features sits on row 4 of 7; its reach ends at shared (row 6): gaps 4 and 5 run.
    expect(screen.getByTestId('architecture-flow-run-4')).toBeInTheDocument();
    expect(screen.getByTestId('architecture-flow-run-5')).toBeInTheDocument();
    expect(screen.queryByTestId('architecture-flow-run-3')).toBeNull();

    fireEvent.blur(screen.getByTestId('architecture-role-features'));
    expect(screen.queryByTestId('architecture-flow-run-4')).toBeNull();
  });

  /*
   * ⚠️ **A band carries source modules, not ontology concepts** (owner correction, 2026-08-27:
   * the ontology is the meaning map; architecture is about what the project source contains).
   * The modules come from a read-only directory walk of the bound project source — never an
   * import scan — so they exist only where a listing exists. Per-band counts appear only then,
   * and a count of 0 is information about *that* band, not a repeated apology.
   */
  it('fills a band with the source modules its globs contain, when a listing exists', () => {
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
    const views = screen.getByTestId('architecture-modules-views');
    expect(views).toHaveTextContent('home');
    expect(views).toHaveTextContent('docs-vault');
    expect(screen.getByTestId('architecture-module-count-views')).toHaveTextContent('2 modules');
    expect(screen.getByTestId('architecture-module-count-widgets')).toHaveTextContent('0 modules');
    expect(screen.queryByTestId('architecture-modules-widgets')).toBeNull();
    // A listing exists here, so the browser impossibility sentence must not show.
    expect(screen.queryByTestId('architecture-source-unavailable')).toBeNull();
  });

  /*
   * A browser cannot read a source folder — `.claude/rules/surfaces.md` says to state an
   * impossibility rather than render a gap that looks like emptiness.
   */
  it('says a browser cannot list source instead of pretending empty bands', () => {
    renderWorkbench();
    expect(screen.getByTestId('architecture-source-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('architecture-module-count-views')).toBeNull();
    expect(screen.queryByTestId('architecture-modules-views')).toBeNull();
  });

  /*
   * The click answers with detail, in place (owner ask, 2026-08-27, and the second record's fired
   * falsifier): pressing a layer opens its reviewed-concepts section inside the band — the
   * labeled meaning layer, distinct from the source-module row — and pressing again closes it.
   */
  it('opens a layer\'s reviewed concepts in place on click, labeled as concepts', () => {
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
    /* The resting state is the full diagram: sections open by default. */
    const detail = screen.getByTestId('architecture-concepts-views');
    expect(detail).toHaveTextContent('Reviewed concepts in this layer');
    expect(detail).toHaveTextContent('1 concept');
    expect(detail).toHaveTextContent('Home');
    expect(screen.getByTestId('architecture-role-views')).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByTestId('architecture-role-views'));
    expect(screen.queryByTestId('architecture-concepts-views')).toBeNull();
    expect(screen.getByTestId('architecture-role-views')).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByTestId('architecture-role-views'));
    expect(screen.getByTestId('architecture-concepts-views')).toBeInTheDocument();
  });

  it('keeps the same blueprint while switching from understand to plan and verify', () => {
    renderWorkbench();
    const role = screen.getByTestId('architecture-role-features');
    const roleBox = role.getBoundingClientRect();
    const roleClassName = role.className;

    fireEvent.click(screen.getByRole('radio', { name: 'Plan' }));
    expect(screen.getByText('Architecture-first agent plan')).toBeInTheDocument();
    expect(screen.getByText(/inspect_architecture/)).toBeInTheDocument();
    expect(screen.getByTestId('architecture-role-features')).toBe(role);
    expect(role.getBoundingClientRect()).toEqual(roleBox);
    expect(role.className).toBe(roleClassName);

    fireEvent.click(screen.getByRole('radio', { name: 'Verify' }));
    expect(screen.getByText('Verify the actual change')).toBeInTheDocument();
    expect(screen.getByText(/unknown is not compliant/i)).toBeInTheDocument();
    expect(screen.getByTestId('architecture-role-features')).toBe(role);
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
});
