import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'use-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../messages/en.json';
import ko from '../../../../messages/ko.json';
import {
  parseArchitectureProfile,
  type ArchitectureHandoffContext,
} from '@/entities/architecture-profile';
import {
  parseArchitectureRecord,
  type ArchitectureRecord,
  type ArchitectureRoleEdge,
} from '@/entities/architecture-record';
import {
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import { parseSearch } from '@/shared/lib/navigation/atlas-search';
import { ArchitectureWorkbench } from './ArchitectureWorkbench';

vi.mock('@/entities/vault-session', () => ({ useVaultSessionIdentityScope: () => 'sample:test' }));
// No router mounts around the screen here; the query handed down is whatever the test wrote to the window.
const addressSearch = () => parseSearch(window.location.search);

function renderWorkbench(handoffContext?: ArchitectureHandoffContext) {
  const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
  return render(
    <IntlProvider locale="en" messages={en}>
      <ArchitectureWorkbench
        search={addressSearch()}
        profiles={[profile]}
        handoffContexts={handoffContext ? { [profile.slug]: handoffContext } : undefined}
        copyFeedbackMs={300}
      />
    </IntlProvider>,
  );
}


/* A receipt parsed through `parseArchitectureRecord`, so a surface/parser drift fails here too. */
function buildRecord({
  source = { kind: 'git', revision: 'a8df66d', dirty: false },
  status = 'violated',
  violationCount = 3,
  excludedByUsage = 18 as number | undefined,
  observedRoleEdges = [] as ArchitectureRoleEdge[],
  violations = [] as unknown[],
}: {
  source?: ArchitectureRecord['brief']['measured']['source'];
  status?: 'conforms' | 'violated' | 'unknown';
  violationCount?: number;
  excludedByUsage?: number | undefined;
  observedRoleEdges?: ArchitectureRoleEdge[];
  violations?: unknown[];
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
        violations,
        observedRoleEdges,
        ...(excludedByUsage === undefined ? {} : { excludedByUsage }),
        unknown: { coverageIncomplete: false, unmappedEdges: 2, unruledEdges: 0, emptyRoles: [] },
      },
    },
  });
}

function renderWithRecord(record: ReturnType<typeof buildRecord>, frontmatter: unknown = FSD_PROFILE_FRONTMATTER) {
  const profile = parseArchitectureProfile(frontmatter as never);
  return render(
    <IntlProvider locale="en" messages={en}>
      <ArchitectureWorkbench search={addressSearch()} profiles={[profile]} recordsByProfile={{ [profile.slug]: record }} />
    </IntlProvider>,
  );
}

const FSD_TRAFFIC: ArchitectureRoleEdge[] = [
  { fromRole: 'views', toRole: 'widgets', count: 56 },
  { fromRole: 'views', toRole: 'shared', count: 61 },
  { fromRole: 'widgets', toRole: 'shared', count: 88 },
  { fromRole: 'features', toRole: 'shared', count: 97 },
  { fromRole: 'views', toRole: 'views', count: 300 },
  { fromRole: 'shared', toRole: 'features', count: 1 },
];

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
      <IntlProvider locale="en" messages={en}>
        <ArchitectureWorkbench search={addressSearch()} profiles={[]} {...agent} />
      </IntlProvider>,
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

const VIOLATION = {
  fromRole: 'shared',
  toRole: 'features',
  from: 'src/shared/lib/x.ts',
  to: 'src/features/cart/index.ts',
};

describe('ArchitectureWorkbench', () => {
  it('names a live agent turn in the header', () => {
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    render(
      <IntlProvider locale="en" messages={en}>
        <ArchitectureWorkbench
        search={addressSearch()}
          profiles={[profile]}
          agentActivity={{
            state: 'verifying',
            summary: 'Inspect the current source',
            ontologySlug: null,
            toolName: 'inspect_architecture',
          }}
        />
      </IntlProvider>,
    );
    expect(screen.getByTestId('architecture-agent-activity')).toHaveTextContent('Agent is inspecting source');
  });

  it('starts an in-tab inspection from the header action instead of navigating to Map', () => {
    const onAgentRequest = vi.fn();
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    render(
      <IntlProvider locale="en" messages={en}>
        <ArchitectureWorkbench
        search={addressSearch()}
          profiles={[profile]}
          agentRoute="agent"
          agentLabel="Claude Code"
          onAgentRequest={onAgentRequest}
        />
      </IntlProvider>,
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

  it('writes the chosen role into the address without erasing unrelated route state', () => {
    window.history.replaceState({}, '', '/ko/architecture/?guides=off&fixture=storefront');
    renderWorkbench();
    fireEvent.click(screen.getByTestId('architecture-role-views'));
    expect(window.location.search).toBe('?guides=off&fixture=storefront&role=views');
  });

  it('draws the rule alone before a record: a dot where an import is allowed, nothing where it is not', () => {
    renderWorkbench();
    expect(screen.getByTestId('architecture-status')).toHaveTextContent('Not checked yet');
    expect(screen.getByTestId('architecture-cell-views-shared')).toHaveAttribute('data-cell-kind', 'allowed');
    expect(screen.getByTestId('architecture-cell-views-shared')).toHaveAccessibleName(
      'Views → Shared foundation · allowed by the rules',
    );
    expect(screen.getByTestId('architecture-cell-shared-views')).toHaveAttribute('data-cell-kind', 'forbidden');
    expect(screen.getByTestId('architecture-cell-views-views')).toHaveAttribute('data-cell-kind', 'self');
    expect(screen.queryByTestId('architecture-violation-count')).toBeNull();
    expect(screen.getByTestId('architecture-imports-routing')).toHaveTextContent('Fills in after a source check');
    expect(document.querySelector('[aria-expanded]')).toBeNull();
  });

  it('keeps only another profile actionable and turns the new current profile into a fact', () => {
    const fsd = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    const hexagonal = parseArchitectureProfile(HEXAGONAL_PROFILE_FRONTMATTER);
    render(
      <IntlProvider locale="en" messages={en}>
        <ArchitectureWorkbench search={addressSearch()} profiles={[fsd, hexagonal]} />
      </IntlProvider>,
    );

    expect(screen.getAllByTestId('architecture-profile-current')).toHaveLength(1);
    const option = screen.getByTestId('architecture-profile-option');
    expect(option).toHaveTextContent(hexagonal.title);
    fireEvent.click(option);
    expect(screen.getByTestId('architecture-profile-current')).toHaveTextContent(hexagonal.title);
    expect(screen.getByTestId('architecture-role-adapter')).toBeInTheDocument();
  });

  it('names the violation as its pair and count, and leads with the violation count', () => {
    renderWithRecord(buildRecord({ violationCount: 1, observedRoleEdges: FSD_TRAFFIC, violations: [VIOLATION] }));
    expect(screen.getByTestId('architecture-violation-count')).toHaveTextContent('1');
    expect(screen.getByTestId('architecture-violation-count').className).toContain('--color-danger-text');
    const violation = screen.getByTestId('architecture-cell-shared-features');
    expect(violation).toHaveAttribute('data-cell-kind', 'violation');
    expect(violation).toHaveAccessibleName('Shared foundation → Features · 1 import against the rules');
    expect(screen.getByTestId('architecture-cell-features-shared')).toHaveAccessibleName(
      'Features → Shared foundation · 97 imports · allowed by the rules',
    );
    expect(screen.getByTestId('architecture-figure-imports')).toHaveTextContent('303');
    expect(screen.getAllByRole('button').filter((button) => button.className.includes('--color-danger'))).toEqual([
      violation,
    ]);
  });

  it('arrives on the role that broke the rules and shows its evidence in the pane', () => {
    renderWithRecord(buildRecord({ violationCount: 1, observedRoleEdges: FSD_TRAFFIC, violations: [VIOLATION] }));
    expect(screen.getByTestId('architecture-role-detail')).toHaveAttribute('data-role', 'shared');
    expect(screen.getByTestId('architecture-role-shared')).toHaveAttribute('aria-pressed', 'true');
    const imports = screen.getByTestId('architecture-imports-shared');
    expect(imports.querySelector('[data-violated="true"]')).toHaveTextContent(
      'src/shared/lib/x.ts → src/features/cart/index.ts',
    );
    expect(screen.getByTestId('architecture-imported-by-shared')).toHaveTextContent('Features');
    /* Arrival is not a choice, so the address stays bare. */
    expect(window.location.search).toBe('');
  });

  it('states a clean record as zero with the success dot and nothing red', () => {
    renderWithRecord(buildRecord({ status: 'conforms', violationCount: 0, observedRoleEdges: FSD_TRAFFIC.slice(0, 4) }));
    expect(screen.getByTestId('architecture-violation-count')).toHaveTextContent('0');
    expect(screen.getByTestId('architecture-violation-count').className).not.toContain('--color-danger');
    expect(screen.getByTestId('architecture-status').querySelector('[class*="--color-status-success"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-cell-kind="violation"]')).toHaveLength(0);
    /* Arrival falls to the first role that imports another. */
    expect(screen.getByTestId('architecture-role-detail')).toHaveAttribute('data-role', 'views');
  });

  it('says why an unknown result is unknown instead of a bare status', () => {
    renderWithRecord(buildRecord({ status: 'unknown', violationCount: 0 }));
    expect(screen.getByTestId('architecture-unknown-reasons')).toHaveTextContent(
      'Not conclusive: 2 imports from files in no layer',
    );
  });

  it('moves the pane to a chosen row and marks the other end of a chosen cell', () => {
    renderWithRecord(buildRecord({ violationCount: 1, observedRoleEdges: FSD_TRAFFIC, violations: [VIOLATION] }));
    fireEvent.click(screen.getByTestId('architecture-role-views'));
    expect(screen.getByTestId('architecture-role-detail')).toHaveAttribute('data-role', 'views');
    expect(window.location.search).toBe('?role=views');

    fireEvent.click(screen.getByTestId('architecture-cell-features-shared'));
    expect(screen.getByTestId('architecture-role-detail')).toHaveAttribute('data-role', 'features');
    expect(screen.getByTestId('architecture-imports-features').querySelector('[data-marked="true"]')).toHaveAttribute(
      'data-other-role',
      'shared',
    );
    expect(screen.getByTestId('architecture-readout')).toHaveTextContent('Features → Shared foundation · 97 imports');
  });

  it('moves between cells with the arrow keys, one tab stop for the whole table', () => {
    renderWithRecord(buildRecord({ violationCount: 1, observedRoleEdges: FSD_TRAFFIC, violations: [VIOLATION] }));
    const tabbable = [...document.querySelectorAll('[data-cell-kind]')].filter(
      (cell) => cell.getAttribute('tabindex') === '0',
    );
    expect(tabbable).toHaveLength(1);
    const start = screen.getByTestId('architecture-cell-views-widgets');
    start.focus();
    fireEvent.keyDown(start, { key: 'ArrowRight' });
    expect(screen.getByTestId('architecture-cell-views-features')).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(screen.getByTestId('architecture-cell-widgets-features')).toHaveFocus();
    expect(screen.getByTestId('architecture-readout')).toHaveTextContent('Widgets → Features');
  });

  it("follows each role's declared reach under an explicit rule, and writes it in role names", () => {
    renderWithRecord(
      buildRecord({ violationCount: 0, status: 'conforms', observedRoleEdges: [{ fromRole: 'adapter', toRole: 'application', count: 4 }] }),
      HEXAGONAL_PROFILE_FRONTMATTER,
    );
    expect(screen.getByTestId('architecture-cell-adapter-application')).toHaveAttribute('data-cell-kind', 'observed');
    expect(screen.getByTestId('architecture-cell-adapter-domain')).toHaveAttribute('data-cell-kind', 'allowed');
    expect(screen.getByTestId('architecture-cell-application-adapter')).toHaveAttribute('data-cell-kind', 'forbidden');
    expect(screen.getByTestId('architecture-reach-adapter')).toHaveTextContent('Application · Domain · Ports');

    fireEvent.click(screen.getByTestId('architecture-role-domain'));
    expect(screen.getByTestId('architecture-reach-domain')).toHaveTextContent('None');
  });

  /* Modules come from a read-only directory walk, never an import scan, so they exist only with a listing. */
  it("lists every source module a role's globs contain, with the concepts recorded in each", () => {
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    render(
      <IntlProvider locale="en" messages={en}>
        <ArchitectureWorkbench
        search={addressSearch()}
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
          conceptsByProfile={{
            [profile.slug]: {
              views: [
                { slug: 'elements/home', title: 'Home', kind: 'element', path: 'src/views/home/ui/Home.tsx', dependsOn: [], relatesTo: [] },
              ],
            },
          }}
        />
      </IntlProvider>,
    );
    expect(screen.getByTestId('architecture-role-views')).toHaveTextContent('2 modules');
    expect(screen.getByTestId('architecture-figure-modules')).toHaveTextContent('3');
    fireEvent.click(screen.getByTestId('architecture-role-views'));
    const listed = screen.getByTestId('architecture-modules-views');
    expect(listed).toHaveTextContent('home');
    expect(listed).toHaveTextContent('docs-vault');
    expect(listed).toHaveTextContent('1 concept');
    expect(screen.getByTestId('architecture-concepts-views')).toHaveTextContent('Home');
    expect(screen.queryByTestId('architecture-source-unavailable')).toBeNull();
  });

  it('falls back to the modules recorded concepts sit in where source cannot be listed', () => {
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    render(
      <IntlProvider locale="en" messages={en}>
        <ArchitectureWorkbench
        search={addressSearch()}
          profiles={[profile]}
          conceptsByProfile={{
            [profile.slug]: {
              views: [
                { slug: 'elements/home', title: 'Home', kind: 'element', path: 'src/views/home/ui/Home.tsx', dependsOn: [], relatesTo: [] },
              ],
            },
          }}
        />
      </IntlProvider>,
    );
    fireEvent.click(screen.getByTestId('architecture-role-views'));
    expect(screen.getByTestId('architecture-modules-views')).toHaveTextContent('home');
    expect(screen.getByTestId('architecture-source-unavailable')).toBeInTheDocument();
  });

  it('declines a linked role the profile lacks, and still answers with a role', () => {
    window.history.replaceState({}, '', '/ko/architecture/?role=not-a-real-role');
    renderWorkbench();
    expect(screen.getByTestId('architecture-role-not-in-profile')).toHaveTextContent('not-a-real-role');
    expect(screen.getByTestId('architecture-role-detail')).toHaveAttribute('data-role', 'routing');
  });

  it('honours a linked role on arrival', () => {
    window.history.replaceState({}, '', '/ko/architecture/?role=entities');
    renderWithRecord(buildRecord({ violationCount: 1, observedRoleEdges: FSD_TRAFFIC, violations: [VIOLATION] }));
    expect(screen.getByTestId('architecture-role-detail')).toHaveAttribute('data-role', 'entities');
    expect(screen.queryByTestId('architecture-role-not-in-profile')).toBeNull();
  });

  it('keeps the workbench focused on architecture facts instead of demo playback or prose stages', () => {
    renderWorkbench();
    expect(screen.queryByTestId('architecture-graph-run')).not.toBeInTheDocument();
    expect(screen.queryByTestId('architecture-walk')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('copies an executable architecture handoff instead of a generic prompt', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderWorkbench({
      sourceRoot: '/Users/dana/Atlas Source',
      vaultRoot: '/Users/dana/Atlas Source/docs/ontology',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copy the “Inspect source” task' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('This is a verification task'));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('"vaultRoot":"/Users/dana/Atlas Source/docs/ontology"'),
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

/* A receipt is a snapshot, not a live claim: the stamp says when and from what it was taken. */
describe('ArchitectureWorkbench — persisted conformance receipt', () => {
  it('stamps a git receipt with its date, commit and the dependency rule', () => {
    renderWithRecord(buildRecord());
    expect(screen.getByTestId('architecture-record-stamp')).toHaveTextContent(
      'Checked 2026-08-27 at commit a8df66d · Each layer may import only the layers below it.',
    );
  });

  it('marks a dirty git measurement as taken with uncommitted edits', () => {
    renderWithRecord(buildRecord({ source: { kind: 'git', revision: 'a8df66d', dirty: true } }));
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
    const stamp = screen.getByTestId('architecture-record-stamp');
    expect(stamp).toHaveTextContent('Checked 2026-08-27 against a content fingerprint of the source folder');
    expect(stamp.textContent).not.toMatch(/\b[0-9a-f]{7,}\b/);
  });

  it('says what fills the table when no record exists yet', () => {
    renderWorkbench();
    expect(screen.getByTestId('architecture-verdict')).toHaveTextContent(
      'Check the source and the table fills with the imports between layers.',
    );
    expect(screen.getByTestId('architecture-agent-action')).toHaveTextContent('Copy the “Inspect source” task');
  });

  it('says the record is still loading instead of drawing an empty table', () => {
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    render(
      <IntlProvider locale="en" messages={en}>
        <ArchitectureWorkbench search={addressSearch()} profiles={[profile]} recordsLoaded={false} />
      </IntlProvider>,
    );
    expect(screen.getByTestId('architecture-record-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('architecture-matrix')).toBeNull();
  });
});

/*
 * `summary_<role>_<locale>` restates the canonical sentence for the screen; `summary_<role>` stays
 * the fact that briefs and prompts print.
 */
describe("the role sentence in the reader's language", () => {
  const KOREAN_VIEWS = '라우트가 열 수 있는 화면 하나마다 모듈 하나입니다.';

  function renderIn(locale: 'en' | 'ko') {
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    return render(
      <IntlProvider locale={locale} messages={locale === 'ko' ? ko : en}>
        <ArchitectureWorkbench search={addressSearch()} profiles={[profile]} />
      </IntlProvider>,
    );
  }

  it('prints the Korean sentence in the pane at ko', () => {
    renderIn('ko');
    fireEvent.click(screen.getByTestId('architecture-role-views'));
    expect(screen.getByTestId('architecture-role-summary-views')).toHaveTextContent(KOREAN_VIEWS);
  });

  it('prints the canonical English sentence at en', () => {
    renderIn('en');
    fireEvent.click(screen.getByTestId('architecture-role-views'));
    expect(screen.getByTestId('architecture-role-summary-views')).toHaveTextContent(
      'One module per route-level screen',
    );
  });

  /* A profile translated one role at a time shows reviewed English for the rest, never a blank. */
  it('falls back to the canonical sentence for a role nobody translated', () => {
    renderIn('ko');
    expect(screen.getByTestId('architecture-role-summary-routing')).toHaveTextContent(
      'Locale-prefixed route entry wrappers.',
    );
  });
});

/* An unreadable profile is named on the screen instead of failing the whole route. */
describe('an unreadable architecture document', () => {
  it('names the document and the parser sentence beside the profiles that did load', () => {
    const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);
    render(
      <IntlProvider locale="en" messages={en}>
        <ArchitectureWorkbench
        search={addressSearch()}
          profiles={[profile]}
          profileProblems={[
            {
              documentSlug: 'architecture/broken',
              message: 'summary_ghost_ko describes a role that does not exist.',
            },
          ]}
        />
      </IntlProvider>,
    );
    const notice = screen.getByTestId('architecture-profile-problem');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveTextContent('architecture/broken');
    expect(notice).toHaveTextContent('summary_ghost_ko describes a role that does not exist.');
    expect(screen.getByTestId('architecture-role-views')).toBeInTheDocument();
  });
});
