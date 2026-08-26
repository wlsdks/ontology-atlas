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
import { FSD_PROFILE_FRONTMATTER } from '../../../../tests/fixtures/architecture-profile-cases.mjs';
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
    expect(screen.getByText(/Feature-Sliced Design/)).toBeInTheDocument();
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
   * ⚠️ **The matrix is where the policy is checkable.** Five rounds of this screen were a list of
   * roles with decoration attached, and the last one -- concentric rings -- failed for a measured
   * reason: the nested-rectangle literature puts the legibility limit at 2-3 levels and
   * Feature-Sliced Design has seven. Rings also cannot state an exception, only imply permission.
   *
   * Rows are the consumer and columns the provider, so a legal layering draws a filled triangle and
   * a hole is a gap in it. That shape is the assertion: it fails the moment a rule points upward,
   * whatever the layer count, and it needs no separate mark for an exception because the position
   * of an empty cell *is* the exception.
   */
  it('states the whole policy as a triangle', () => {
    renderWorkbench();
    const order = ['routing', 'app', 'views', 'widgets', 'features', 'entities', 'shared'];
    const cellsOf = (id: string) =>
      [...screen.getByTestId(`architecture-matrix-row-${id}`).children].map((cell) =>
        cell.getAttribute('data-reach'),
      );

    order.forEach((id, row) => {
      const cells = cellsOf(id);
      expect(cells, `${id} needs one cell per layer`).toHaveLength(order.length);
      expect(cells[row], `${id} marks itself at column ${row + 1}`).toBe('self');
      expect(
        cells.slice(0, row),
        `${id} must not be allowed to depend on a layer above it`,
      ).not.toContain('on');
      expect(
        cells.slice(row + 1).every((cell) => cell === 'on'),
        `${id} must reach every layer beneath it`,
      ).toBe(true);
    });

    // One stroke with one stated meaning, rather than an arrow per permitted pair.
    expect(screen.getByTestId('architecture-flow-inward')).toBeInTheDocument();
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
