import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ko from '../../../../messages/ko.json';
import type { AcpCheck } from '../model/acp-doctor';
import { useAgentDoctor } from './AgentDoctor';

/**
 * The connection-check screen — the subject of these tests is **whether it becomes noise.**
 *
 * The owner rejected the first version over the screen rather than the behaviour: "everything is
 * fine" was seven lines long, and that list ate the row's right half. So what is measured here is
 * not "does it return good values" but **"how many lines does it draw"**.
 */

const diagnoseAgent = vi.fn<(runtimeId: string) => Promise<AcpCheck[]>>();
const repairAgentCheck = vi.fn<(runtimeId: string, checkId: string) => Promise<AcpCheck[]>>();
const resetAgentConnection = vi.fn<(runtimeId: string) => Promise<AcpCheck[]>>();
const agentInstallPlan = vi.fn<(runtimeId: string) => Promise<string | null>>();
const installAgentCli = vi.fn<(runtimeId: string) => Promise<AcpCheck[]>>();
const nodeInstallPlan = vi.fn<() => Promise<string | null>>();
const installManagedNode = vi.fn<(runtimeId: string) => Promise<AcpCheck[]>>();
/** The test fires the progress events Rust would emit. */
let emitProgress: ((progress: unknown) => void) | null = null;
/** The "last progress" Rust holds. The test plants it directly. */
const lastInstallProgress = vi.fn<(runtimeId: string) => Promise<unknown>>();

vi.mock('../model/acp-doctor', async () => {
  const actual = await vi.importActual<typeof import('../model/acp-doctor')>('../model/acp-doctor');
  return {
    ...actual,
    diagnoseAgent: (runtimeId: string) => diagnoseAgent(runtimeId),
    repairAgentCheck: (runtimeId: string, checkId: string) => repairAgentCheck(runtimeId, checkId),
    resetAgentConnection: (runtimeId: string) => resetAgentConnection(runtimeId),
    agentInstallPlan: (runtimeId: string) => agentInstallPlan(runtimeId),
    installAgentCli: (runtimeId: string) => installAgentCli(runtimeId),
    nodeInstallPlan: () => nodeInstallPlan(),
    installManagedNode: (runtimeId: string) => installManagedNode(runtimeId),
    lastInstallProgress: (runtimeId: string) => lastInstallProgress(runtimeId),
    listenInstallProgress: async (
      _runtimeId: string,
      onProgress: (progress: unknown) => void,
    ) => {
      emitProgress = onProgress;
      return () => {
        emitProgress = null;
      };
    },
  };
});

function Harness({ runtimeId = 'claude-acp' }: { runtimeId?: string }) {
  const doctor = useAgentDoctor(runtimeId);
  return (
    <NextIntlClientProvider locale="ko" messages={ko}>
      <div>
        {doctor.scanButton}
        {doctor.result}
      </div>
    </NextIntlClientProvider>
  );
}

function renderHarness(runtimeId = 'claude-acp') {
  // `useTranslations` lives only inside a provider, and the component calling the hook must not be
  // outside one — hence the extra wrapper.
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <Harness runtimeId={runtimeId} />
    </NextIntlClientProvider>,
  );
}

const ok = (id: string): AcpCheck => ({ id, state: 'ok', fixable: false, blocked: false });
const problem = (id: string, fixable = true): AcpCheck => ({ id, state: 'problem', fixable, blocked: false });
const unknown = (id: string): AcpCheck => ({ id, state: 'unknown', fixable: false, blocked: false });

beforeEach(() => {
  diagnoseAgent.mockReset();
  repairAgentCheck.mockReset();
  resetAgentConnection.mockReset();
  agentInstallPlan.mockReset();
  agentInstallPlan.mockResolvedValue(null);
  installAgentCli.mockReset();
  nodeInstallPlan.mockReset();
  nodeInstallPlan.mockResolvedValue(null);
  installManagedNode.mockReset();
  emitProgress = null;
  lastInstallProgress.mockReset();
  lastInstallProgress.mockResolvedValue(null);
});

describe('agent doctor screen', () => {
  it('draws no rows before the check is pressed', () => {
    renderHarness();
    expect(screen.queryByTestId('agent-doctor')).toBeNull();
    expect(screen.getByTestId('agent-doctor-scan')).toBeVisible();
  });

  it('collapses to one row when every check passes', async () => {
    diagnoseAgent.mockResolvedValue(['cli', 'launcher', 'npx-cache', 'config-dir', 'credentials-link', 'shadow-keychain', 'login'].map(ok));
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));

    await waitFor(() => expect(screen.getByTestId('agent-doctor-all-clear')).toBeInTheDocument());
    // This was the first version's defect: the list must not be drawn.
    expect(screen.queryByTestId('agent-doctor-checks')).toBeNull();
    // ⚠️ **No count is given** (rejected 2026-08-20): "step" is our internal word, and the check
    // count differs per tool, so the number looks different for reasons the user cannot know. The
    // status is one sentence in plain language and what was examined is folded away.
    const summary = screen.getByTestId('agent-doctor-all-clear').textContent ?? '';
    expect(summary).not.toMatch(/\d/);
    expect(summary).toContain('문제 없어요');
    // Folded, the list is still in the DOM — unfold it if curious.
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
  });

  it('expands only blocked checks and counts the passed ones', async () => {
    diagnoseAgent.mockResolvedValue([
      ok('cli'),
      ok('launcher'),
      ok('npx-cache'),
      ok('config-dir'),
      ok('credentials-link'),
      problem('shadow-keychain'),
      { id: 'login', state: 'problem', fixable: false, blocked: false },
    ]);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-checks')).toBeVisible());

    // Only the two blocked ones become rows.
    expect(screen.getByTestId('agent-doctor-check-shadow-keychain')).toBeVisible();
    expect(screen.getByTestId('agent-doctor-check-login')).toBeVisible();
    expect(screen.queryByTestId('agent-doctor-check-cli')).toBeNull();
    // The five that are not drawn must not look as though they vanished.
    expect(screen.getByTestId('agent-doctor-rest').textContent).not.toMatch(/\d/);
  });

  it('offers a fix button only for fixable checks', async () => {
    diagnoseAgent.mockResolvedValue([
      problem('shadow-keychain', true),
      { id: 'login', state: 'problem', fixable: false, blocked: false },
    ]);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-checks')).toBeVisible());

    expect(screen.getByTestId('agent-doctor-fix-shadow-keychain')).toBeVisible();
    // A button on something the app cannot fix produces a screen where pressing does nothing.
    expect(screen.queryByTestId('agent-doctor-fix-login')).toBeNull();
  });

  it('draws the re-measured result after a fix', async () => {
    diagnoseAgent.mockResolvedValue([ok('cli'), problem('shadow-keychain')]);
    repairAgentCheck.mockResolvedValue([ok('cli'), ok('shadow-keychain')]);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-fix-shadow-keychain')).toBeVisible());

    fireEvent.click(screen.getByTestId('agent-doctor-fix-shadow-keychain'));

    await waitFor(() => expect(screen.getByTestId('agent-doctor-all-clear')).toBeInTheDocument());
    expect(repairAgentCheck).toHaveBeenCalledWith('claude-acp', 'shadow-keychain');
    expect(screen.queryByTestId('agent-doctor-check-shadow-keychain')).toBeNull();
  });

  it('draws an unknown check as a row instead of passing it', async () => {
    diagnoseAgent.mockResolvedValue([ok('cli'), unknown('login')]);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-checks')).toBeVisible());

    const row = screen.getByTestId('agent-doctor-check-login');
    expect(row.dataset.state).toBe('unknown');
    // "Fix" on something unknown claims the app will do what it cannot.
    expect(screen.queryByTestId('agent-doctor-fix-login')).toBeNull();
    expect(screen.queryByTestId('agent-doctor-all-clear')).toBeNull();
  });

  it('states the manual step for a problem the app cannot fix', async () => {
    diagnoseAgent.mockResolvedValue([
      { id: 'cli', state: 'problem', fixable: false, blocked: false },
      problem('shadow-keychain'),
    ]);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-checks')).toBeVisible());

    // Saying only why it does not work, without saying where to go, is a dead end.
    expect(screen.getByTestId('agent-doctor-next-cli')).toBeVisible();
    // Where the app can fix it, the button is the answer, so no sentence is added.
    expect(screen.queryByTestId('agent-doctor-next-shadow-keychain')).toBeNull();
  });

  it('shows the reconnect action only after a check ran', async () => {
    diagnoseAgent.mockResolvedValue([ok('cli')]);
    renderHarness();

    // Shown permanently to someone with no problem, it reads as a signal that something is wrong.
    expect(screen.queryByTestId('agent-doctor-reset')).toBeNull();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-reset')).toBeVisible());
  });

  it('draws the re-measured result after reconnecting', async () => {
    diagnoseAgent.mockResolvedValue([problem('config-dir')]);
    resetAgentConnection.mockResolvedValue([ok('config-dir')]);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-reset')).toBeVisible());

    fireEvent.click(screen.getByTestId('agent-doctor-reset'));

    await waitFor(() => expect(screen.getByTestId('agent-doctor-all-clear')).toBeInTheDocument());
    expect(resetAgentConnection).toHaveBeenCalledWith('claude-acp');
  });

  /**
   * **No fix button is raised on a collapsed foundation** (walkthrough 2026-08-20).
   *
   * Someone with no tool at all was being offered "fix the app's config" and "reconnect". Pressing
   * them is useless — there is no tool to launch in the first place.
   */
  it('does not offer a later fix while an earlier step is blocked', async () => {
    diagnoseAgent.mockResolvedValue([
      { id: 'cli', state: 'problem', fixable: false, blocked: false },
      { id: 'config-dir', state: 'problem', fixable: false, blocked: true },
    ]);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-checks')).toBeVisible());

    expect(screen.queryByTestId('agent-doctor-fix-config-dir')).toBeNull();
    // The same for "reconnect" — rebuilding the config with no tool present achieves nothing.
    expect(screen.queryByTestId('agent-doctor-reset')).toBeNull();
    // But **what to do about it** must still remain.
    expect(screen.getByTestId('agent-doctor-next-cli')).toBeVisible();
  });

  /**
   * **Show the command text first** — condition ② of ledger entry 2026-08-20 (88).
   *
   * With only an "install into this app" button and no view of what will be run, the user presses
   * without knowing what happens on their own machine.
   */
  it('shows the exact install command beside the install button', async () => {
    diagnoseAgent.mockResolvedValue([{ id: 'cli', state: 'problem', fixable: false, blocked: false }]);
    agentInstallPlan.mockResolvedValue('npm install --prefix /app/managed-node --global @anthropic-ai/claude-code@2.1.236');
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-install-plan')).toBeVisible());

    const card = screen.getByTestId('agent-doctor-install-plan').textContent ?? '';
    expect(card).toContain('--prefix');
    expect(card).toContain('@anthropic-ai/claude-code@2.1.236');
    expect(screen.getByTestId('agent-doctor-install')).toBeVisible();
  });

  it('does not offer install for a tool that cannot be installed', async () => {
    diagnoseAgent.mockResolvedValue([{ id: 'cli', state: 'problem', fixable: false, blocked: false }]);
    agentInstallPlan.mockResolvedValue(null);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-checks')).toBeVisible());

    // Never claim a package that was never verified will be installed on the user's machine.
    expect(screen.queryByTestId('agent-doctor-install')).toBeNull();
    // But what the person can do must still remain.
    expect(screen.getByTestId('agent-doctor-next-cli')).toBeVisible();
  });

  it('draws the re-measured result after install', async () => {
    diagnoseAgent.mockResolvedValue([{ id: 'cli', state: 'problem', fixable: false, blocked: false }]);
    agentInstallPlan.mockResolvedValue('npm install --prefix /app/managed-node --global x@1.0.0');
    installAgentCli.mockResolvedValue([ok('cli')]);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-install')).toBeVisible());
    fireEvent.click(screen.getByTestId('agent-doctor-install'));

    await waitFor(() => expect(screen.getByTestId('agent-doctor-all-clear')).toBeInTheDocument());
    expect(installAgentCli).toHaveBeenCalledWith('claude-acp');
  });

  it('does not offer install when the tool is healthy', async () => {
    diagnoseAgent.mockResolvedValue([ok('cli')]);
    agentInstallPlan.mockResolvedValue('npm install --prefix /app/managed-node --global x@1.0.0');
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-all-clear')).toBeInTheDocument());

    // Showing an install offer permanently to someone with no problem is advertising, not guidance.
    expect(screen.queryByTestId('agent-doctor-install-plan')).toBeNull();
  });

  /**
   * **The app fetches Node too** — ledger entry (89). This was the final dead end for someone with
   * no tooling at all: launching the adapter needs Node, and without it all the screen could say was
   * "install it yourself".
   */
  it('shows the Node download URL and hash when Node is missing', async () => {
    diagnoseAgent.mockResolvedValue([
      { id: 'launcher', state: 'problem', fixable: false, blocked: false },
    ]);
    nodeInstallPlan.mockResolvedValue('https://nodejs.org/dist/v24.18.0/node-v24.18.0-darwin-arm64.tar.gz (e1a97e14c99c)');
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-node-plan')).toBeVisible());

    const card = screen.getByTestId('agent-doctor-node-plan').textContent ?? '';
    // Where it is downloaded from and what it is checked against must both be readable before pressing.
    expect(card).toContain('https://nodejs.org/dist/');
    expect(card).toContain('e1a97e14c99c');
    expect(screen.getByTestId('agent-doctor-install-node')).toBeVisible();
  });

  it('does not offer a Node download on an unlisted platform', async () => {
    diagnoseAgent.mockResolvedValue([
      { id: 'launcher', state: 'problem', fixable: false, blocked: false },
    ]);
    nodeInstallPlan.mockResolvedValue(null);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-checks')).toBeVisible());

    expect(screen.queryByTestId('agent-doctor-install-node')).toBeNull();
    // But what the person can do must still remain.
    expect(screen.getByTestId('agent-doctor-next-launcher')).toBeVisible();
  });

  it('draws the re-measured result after the Node download', async () => {
    diagnoseAgent.mockResolvedValue([
      { id: 'launcher', state: 'problem', fixable: false, blocked: false },
    ]);
    nodeInstallPlan.mockResolvedValue('https://nodejs.org/dist/v24.18.0/x.tar.gz (abc123)');
    installManagedNode.mockResolvedValue([ok('launcher')]);
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor-install-node')).toBeVisible());
    fireEvent.click(screen.getByTestId('agent-doctor-install-node'));

    await waitFor(() => expect(screen.getByTestId('agent-doctor-all-clear')).toBeInTheDocument());
    expect(installManagedNode).toHaveBeenCalledWith('claude-acp');
  });

  it('reports a failed check instead of rendering an empty screen', async () => {
    diagnoseAgent.mockRejectedValue(new Error('boom'));
    renderHarness();

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));

    await waitFor(() => expect(screen.getByTestId('agent-doctor-failure')).toBeVisible());
    expect(screen.queryByTestId('agent-doctor-all-clear')).toBeNull();
  });
});


/**
 * **Does the screen speak while the install runs** (owner, 2026-08-20: *"Show the
 * installation process that happens automatically when you press the buttons, and check off completion?"* — does pressing the buttons show the
 * install progress and check off completion?).
 *
 * The command used to return only when finished, so while 52MB downloaded all the screen could do
 * was leave the chip disabled — the pattern the walkthrough named **"the silent wait"**. So what is
 * measured here is not "does the install work" but **"what is visible while it runs"**.
 */
describe('install progress', () => {
  it('shows no progress row before any install starts', async () => {
    diagnoseAgent.mockResolvedValue([ok('cli'), ok('launcher')]);
    renderHarness();
    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.getByTestId('agent-doctor')).toBeInTheDocument());
    expect(screen.queryByTestId('agent-doctor-progress')).toBeNull();
  });

  it('draws a percentage and bar while the total is known', async () => {
    diagnoseAgent.mockResolvedValue([problem('launcher', false)]);
    renderHarness();
    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(emitProgress).not.toBeNull());

    emitProgress?.({
      runtimeId: 'claude-acp',
      job: 'node',
      stage: 'downloading',
      received: 26_043_779,
      total: 52_087_559,
      note: null,
      at: Date.now(),
    });

    const row = await screen.findByTestId('agent-doctor-progress');
    expect(row).toHaveAttribute('data-stage', 'downloading');
    expect(row.textContent).toContain('50%');
    // The amount received is stated in a human-readable size too — a percentage alone does not convey scale.
    expect(row.textContent).toContain('MB');
    const bar = screen.getByTestId('agent-doctor-progress-bar');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('50%');
  });

  it('shows the tool output line instead of a bar when the total is unknown', async () => {
    diagnoseAgent.mockResolvedValue([problem('cli', false)]);
    renderHarness();
    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(emitProgress).not.toBeNull());

    emitProgress?.({
      runtimeId: 'claude-acp',
      job: 'cli',
      stage: 'installing',
      received: null,
      total: null,
      note: 'added 121 packages in 8s',
      at: Date.now(),
    });

    await screen.findByTestId('agent-doctor-progress');
    expect(screen.queryByTestId('agent-doctor-progress-bar')).toBeNull();
    expect(screen.getByTestId('agent-doctor-progress-note').textContent).toBe(
      'added 121 packages in 8s',
    );
    // No percentage was invented.
    expect(screen.getByTestId('agent-doctor-progress').textContent).not.toContain('%');
  });

  it('leaves a completion line when the install finishes', async () => {
    diagnoseAgent.mockResolvedValue([ok('cli')]);
    renderHarness();
    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(emitProgress).not.toBeNull());

    emitProgress?.({
      runtimeId: 'claude-acp',
      job: 'cli',
      stage: 'done',
      received: null,
      total: null,
      note: null,
      at: Date.now(),
    });

    const row = await screen.findByTestId('agent-doctor-progress');
    expect(row).toHaveAttribute('data-stage', 'done');
    expect(row.textContent).toContain(ko.acpChat.doctor.progress.cli.done);
  });

  it('clears the previous install result when a new check starts', async () => {
    diagnoseAgent.mockResolvedValue([ok('cli')]);
    renderHarness();
    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(emitProgress).not.toBeNull());
    emitProgress?.({
      runtimeId: 'claude-acp',
      job: 'cli',
      stage: 'done',
      received: null,
      total: null,
      note: null,
      at: Date.now(),
    });
    await screen.findByTestId('agent-doctor-progress');

    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await waitFor(() => expect(screen.queryByTestId('agent-doctor-progress')).toBeNull());
  });
});

/**
 * **When the app can do it for you, do not say "do it yourself".**
 *
 * In a 2026-08-20 screenshot, directly beneath the "install into this app" button stood *"press
 * 「install instructions」 for that tool in this list, install it, then press 「check again」 above"*.
 * The user cannot tell which of the two is real.
 */
describe('contradictory guidance', () => {
  it('hides the manual install hint while the app offers install', async () => {
    diagnoseAgent.mockResolvedValue([problem('cli', false)]);
    agentInstallPlan.mockResolvedValue('npm install --prefix /x --global pkg@1');
    renderHarness();
    fireEvent.click(screen.getByTestId('agent-doctor-scan'));

    await screen.findByTestId('agent-doctor-install-plan');
    expect(screen.queryByTestId('agent-doctor-next-cli')).toBeNull();
  });

  it('states the manual step when the app has no install path', async () => {
    diagnoseAgent.mockResolvedValue([problem('cli', false)]);
    agentInstallPlan.mockResolvedValue(null);
    renderHarness();
    fireEvent.click(screen.getByTestId('agent-doctor-scan'));

    await screen.findByTestId('agent-doctor-next-cli');
    expect(screen.queryByTestId('agent-doctor-install-plan')).toBeNull();
  });

  it('hides the manual Node hint while the app can download Node', async () => {
    diagnoseAgent.mockResolvedValue([problem('launcher', false)]);
    nodeInstallPlan.mockResolvedValue('https://nodejs.org/dist/x.tar.gz (abc123)');
    renderHarness();
    fireEvent.click(screen.getByTestId('agent-doctor-scan'));

    await screen.findByTestId('agent-doctor-node-plan');
    expect(screen.queryByTestId('agent-doctor-next-launcher')).toBeNull();
  });
});

/**
 * **A command text wider than its column breaks condition ②** (ledger 2026-08-20 (88): show what
 * will be run, first).
 *
 * Measured: this command is 142 characters and the settings sheet's right pane is 698px. It used to
 * be bound to one line with `whitespace-pre`, putting the overflowing third behind a horizontal
 * scroll — and **nobody ever discovers a horizontal scroll.**
 */
describe('raw command text', () => {
  it('wraps the command instead of hiding overflow behind a scroll', async () => {
    diagnoseAgent.mockResolvedValue([problem('cli', false)]);
    agentInstallPlan.mockResolvedValue(
      'npm install --prefix /Users/x/Library/Application Support/dev.jinan.ontology-atlas/managed-node --global @anthropic-ai/claude-code@2.1.236',
    );
    renderHarness();
    fireEvent.click(screen.getByTestId('agent-doctor-scan'));

    const card = await screen.findByTestId('agent-doctor-install-plan');
    const code = card.querySelector('code');
    expect(code).not.toBeNull();
    expect(code?.className).not.toContain('whitespace-pre ');
    expect(code?.className).not.toContain('overflow-x-auto');
    // The path contains a space (`Application Support`), so wrapping only at word boundaries still overflows.
    expect(code?.className).toContain('break-all');
  });
});

/**
 * **Is an install that finished while closed still caught?**
 *
 * The settings sheet unmounts entirely when closed (the conditional portal in
 * `AppSettingsMenu.tsx`), taking this hook's state and its event subscription with it. The Node
 * download ticks every 250ms and revives on reopening, but **completion (`done`) is a single event**
 * and going past in the meantime means it is never seen — which is exactly the "check off completion"
 * the owner asked for.
 */
describe('completion that survives unmount', () => {
  const done = {
    runtimeId: 'claude-acp',
    job: 'cli' as const,
    stage: 'done' as const,
    received: null,
    total: null,
    note: null,
    at: Date.now(),
  };

  it('asks the native side for the last progress on mount', async () => {
    diagnoseAgent.mockResolvedValue([ok('cli')]);
    renderHarness();
    await waitFor(() => expect(lastInstallProgress).toHaveBeenCalledWith('claude-acp'));
  });

  it('shows a completion that happened while the screen was closed', async () => {
    diagnoseAgent.mockResolvedValue([ok('cli')]);
    lastInstallProgress.mockResolvedValue(done);
    renderHarness();

    const row = await screen.findByTestId('agent-doctor-progress');
    expect(row).toHaveAttribute('data-stage', 'done');
    expect(row.textContent).toContain(ko.acpChat.doctor.progress.cli.done);
  });

  it('draws nothing when no progress is held', async () => {
    diagnoseAgent.mockResolvedValue([ok('cli')]);
    lastInstallProgress.mockResolvedValue(null);
    renderHarness();
    await waitFor(() => expect(lastInstallProgress).toHaveBeenCalled());
    expect(screen.queryByTestId('agent-doctor-progress')).toBeNull();
  });

  it('keeps a subscription event that arrived before the held progress', async () => {
    diagnoseAgent.mockResolvedValue([ok('cli')]);
    // Rust holds an old completion while a new install is running right now.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the test controls when it resolves
    let release!: (value: any) => void;
    lastInstallProgress.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    renderHarness();
    await waitFor(() => expect(emitProgress).not.toBeNull());

    emitProgress?.({
      runtimeId: 'claude-acp',
      job: 'cli',
      stage: 'installing',
      received: null,
      total: null,
      note: 'reify',
      at: Date.now(),
    });
    await screen.findByTestId('agent-doctor-progress');

    // A late-arriving "last state" must not overwrite what is running now.
    release(done);
    await waitFor(() =>
      expect(screen.getByTestId('agent-doctor-progress')).toHaveAttribute(
        'data-stage',
        'installing',
      ),
    );
  });
});

/**
 * **Never draw the unknown as green.**
 *
 * Reviving "completion while closed" made progress state load on mount, and with it the result block
 * began rendering **even with no checks**. At that point `blocked.length === 0` does not mean
 * "everything is fine" but **"nothing has been measured yet"**, while the screen says "no problems
 * right now" — drawing green without measuring, in direct violation of the first of this screen's
 * two rules.
 */
describe('unmeasured state is not reported as healthy', () => {
  it('does not show the all-clear when only progress exists and no check ran', async () => {
    lastInstallProgress.mockResolvedValue({
      runtimeId: 'claude-acp',
      job: 'node',
      stage: 'done',
      received: null,
      total: null,
      note: null,
      at: Date.now(),
    });
    renderHarness();

    // Completion is shown — that is what this wiring exists for.
    await screen.findByTestId('agent-doctor-progress');
    // But the checks never ran once. That must not be turned into "fine".
    expect(screen.queryByTestId('agent-doctor-all-clear')).toBeNull();
    expect(screen.queryByTestId('agent-doctor-checks')).toBeNull();
  });

  it('reports normally after a check ran', async () => {
    diagnoseAgent.mockResolvedValue([ok('cli'), ok('launcher')]);
    renderHarness();
    fireEvent.click(screen.getByTestId('agent-doctor-scan'));
    await screen.findByTestId('agent-doctor-all-clear');
  });
});
