import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  sent: [] as Array<Record<string, unknown>>,
  listener: null as ((line: string) => void) | null,
}));

/** The folder's project lines as the manifest reports them; a spec moves them as an agent would. */
const vault = vi.hoisted(() => ({ uncovered: null as number | null, unreadable: false }));

vi.mock('@/shared/lib/agent-chat/tauri-acp', () => ({
  isAcpBridgeAvailable: () => true,
  startAcpSession: async () => 'acp-1-999',
  sendAcpLine: async (_id: string, line: string) => {
    bridge.sent.push(JSON.parse(line));
  },
  stopAcpSession: async () => {},
  acpPermissionVerdict: async () => 'ask',
  listenToAcpSession: async (_id: string, handlers: { onMessage?: (line: string) => void }) => {
    bridge.listener = handlers.onMessage ?? null;
    return () => {
      bridge.listener = null;
    };
  },
}));

vi.mock('next-intl', () => {
  const t = (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key);
  return { useLocale: () => 'en', useTranslations: () => Object.assign(t, { rich: t }) };
});

/** The project note as the agent leaves it on disk, read at each request's end. */
const projectNote = () => (vault.uncovered === null
  ? 'A launch.\n'
  : `A launch.\n\n## Uncertainty\n\n- Not mapped yet: 3 of 9 areas, ${vault.uncovered} of 120 abilities.\n`);

vi.mock('@/shared/lib/vault-folder/vault-text-reader', () => ({
  createVaultTextReader: () => async (docs: readonly unknown[]) => docs.map(() => (vault.unreadable ? null : projectNote())),
}));

const GRANTED = { root: { rootPath: '/vault' }, fileHandles: new Map() };

vi.mock('@/entities/vault-session', async (original) => ({
  ...(await original<typeof import('@/entities/vault-session')>()),
  useGrantedVaultFiles: () => GRANTED,
  useLocalVault: () => ({
    manifest: {
      docs: [{
        slug: 'project',
        path: 'project.md',
        frontmatter: { kind: 'project' },
        ...(vault.uncovered === null ? {} : { notMappedAreas: { remaining: 3, total: 9, abilitiesUncovered: vault.uncovered, abilitiesTotal: 120 } }),
      }],
    },
  }),
}));

import { keepStandingChoice } from '@/features/acp-session/model/permissions/standing-choice';
import { workRuns } from '@/features/work-run';

import { folderHolder, keptPanels } from '../model/kept-panels';
import { AcpChatPanel } from './AcpChatPanel';
import { AcpChatPanelKeeper } from './AcpChatPanelKeeper';

const FOLDER = '/vault';

const sentOf = (method: string) => bridge.sent.filter((message) => message.method === method);

function replyTo(method: string, result: unknown) {
  const call = [...bridge.sent].reverse().find((message) => message.method === method);
  bridge.listener?.(JSON.stringify({ jsonrpc: '2.0', id: call?.id, result }));
}

/** Answers the newest `initialize` and `session/new` the panel sent, as an agent starting up. */
async function agentStarts(count: number) {
  await waitFor(() => expect(sentOf('initialize')).toHaveLength(count));
  replyTo('initialize', { protocolVersion: 1 });
  await waitFor(() => expect(sentOf('session/new')).toHaveLength(count));
  replyTo('session/new', { sessionId: `s-${count}` });
  await waitFor(() => expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'));
}

function renderMapConversation(props: { openingRequest?: { text: string; nonce: number } } = {}) {
  return render(
    <>
      <AcpChatPanelKeeper />
      <AcpChatPanel
        keepKey={`map:${FOLDER}:claude-acp`}
        runtimeId="claude-acp"
        runtimeLabel="Claude Agent"
        vaultRoot={FOLDER}
        {...props}
      />
    </>,
  );
}

afterEach(() => {
  cleanup();
  act(() => workRuns.reset());
  keptPanels.reset();
  window.localStorage.clear();
  bridge.sent = [];
  bridge.listener = null;
  vault.uncovered = null;
  vault.unreadable = false;
});

describe('the map conversation maps the rest of the code from one press', () => {
  it('stays busy and holds the folder between requests, so a parked panel is kept and another dock waits', async () => {
    vault.uncovered = 96;
    renderMapConversation();
    await agentStarts(1);
    fireEvent.click(await screen.findByTestId('mapping-run-action'));
    await agentStarts(2);
    await waitFor(() => expect(sentOf('session/prompt')).toHaveLength(1));
    expect(JSON.stringify(sentOf('session/prompt')[0])).toContain('suggest.mapArea.prompt');
    // The agent receives the whole request; the conversation shows one line of it.
    const requests = () => [...document.querySelectorAll('[data-acp-entry="user"]')].map((entry) => entry.textContent);
    await waitFor(() => expect(requests()).toEqual(['suggest.mapArea.line:{"part":1}']));
    // What was sent stays inspectable, as every request the app writes is: closed until asked for.
    const full = screen.getByTestId('acp-chat-request-full');
    expect(full).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/suggest\.mapArea\.prompt/)).toBeNull();
    fireEvent.click(full);
    expect(screen.getByText(/suggest\.mapArea\.prompt/)).toBeInTheDocument();

    vault.uncovered = 72;
    replyTo('session/prompt', { stopReason: 'end_turn' });
    await waitFor(() => expect(sentOf('initialize')).toHaveLength(3));
    // Between requests no turn runs, yet the panel reports itself busy and holding the folder.
    expect(keptPanels.read()[0]).toMatchObject({ key: `map:${FOLDER}:claude-acp`, busy: true, outlives: true, readOnly: false });
    expect(folderHolder(`library:${FOLDER}:claude-acp`, FOLDER)).not.toBeNull();

    replyTo('initialize', { protocolVersion: 1 });
    await waitFor(() => expect(sentOf('session/new')).toHaveLength(3));
    replyTo('session/new', { sessionId: 's-3' });
    await waitFor(() => expect(sentOf('session/prompt')).toHaveLength(2));
    expect(JSON.stringify(sentOf('session/prompt')[1])).toContain('\\"mapped\\":48');

    act(() => workRuns.stopRun(`mapping:${FOLDER}`));
    await waitFor(() => expect(sentOf('session/cancel')).toHaveLength(1));
    replyTo('session/prompt', { stopReason: 'cancelled' });
    await waitFor(() => expect(screen.getByTestId('mapping-run-row')).toHaveAttribute('data-mapping-state', 'stopped'));
    expect(keptPanels.read()[0]?.busy).toBe(false);
    expect(folderHolder(`library:${FOLDER}:claude-acp`, FOLDER)).toBeNull();
  });

  it('stops with the line lost, not finished, when the project note cannot be read at a request\'s end', async () => {
    // What the line last said one request could close: a note read as empty would call the run finished.
    vault.uncovered = 31;
    renderMapConversation();
    await agentStarts(1);
    fireEvent.click(await screen.findByTestId('mapping-run-action'));
    await agentStarts(2);
    await waitFor(() => expect(sentOf('session/prompt')).toHaveLength(1));
    vault.unreadable = true;
    replyTo('session/prompt', { stopReason: 'end_turn' });
    await waitFor(() => expect(screen.getByTestId('mapping-run-row')).toHaveAttribute('data-mapping-state', 'stopped'));
    expect(workRuns.read().runs.get(`mapping:${FOLDER}`)).toMatchObject({ run: { stopReason: 'lineLost' } });
  });

  it('ends the run when the person stops the connection its next request waits on', async () => {
    vault.uncovered = 96;
    renderMapConversation();
    await agentStarts(1);
    fireEvent.click(await screen.findByTestId('mapping-run-action'));
    await waitFor(() => expect(sentOf('initialize')).toHaveLength(2));
    fireEvent.click(await screen.findByTestId('acp-chat-stop-connecting'));
    await waitFor(() => expect(screen.getByTestId('mapping-run-row')).toHaveAttribute('data-mapping-state', 'stopped'));
    expect(workRuns.read().runs.get(`mapping:${FOLDER}`)).toMatchObject({ run: { stopReason: 'press' } });
    expect(keptPanels.read()[0]?.busy).toBe(false);
    expect(sentOf('session/prompt')).toHaveLength(0);
  });

  it('shows the row once a first build sent from a door writes the line, though that turn gets no next steps', async () => {
    const view = renderMapConversation({ openingRequest: { text: 'Build the first map of this code.', nonce: 1 } });
    await agentStarts(1);
    await waitFor(() => expect(sentOf('session/prompt')).toHaveLength(1));
    expect(screen.queryByTestId('mapping-run-row')).toBeNull();

    vault.uncovered = 96;
    replyTo('session/prompt', { stopReason: 'end_turn' });
    await waitFor(() => expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'));
    view.rerender(
      <>
        <AcpChatPanelKeeper />
        <AcpChatPanel keepKey={`map:${FOLDER}:claude-acp`} runtimeId="claude-acp" runtimeLabel="Claude Agent" vaultRoot={FOLDER} />
      </>,
    );
    expect(await screen.findByTestId('mapping-run-row')).toHaveAttribute('data-mapping-state', 'notStarted');
  });

  it('says what the kept Auto-approve passes, though the conversation on screen is in plan mode', async () => {
    // A run's requests open new conversations in the tool's opening mode, where the folder's kept choice answers.
    keepStandingChoice(FOLDER, true);
    try {
      vault.uncovered = 96;
      renderMapConversation();
      await waitFor(() => expect(sentOf('initialize')).toHaveLength(1));
      replyTo('initialize', { protocolVersion: 1 });
      await waitFor(() => expect(sentOf('session/new')).toHaveLength(1));
      replyTo('session/new', { sessionId: 's-1', modes: { currentModeId: 'plan', availableModes: [{ id: 'default', name: 'Default' }, { id: 'plan', name: 'Plan' }] } });
      await waitFor(() => expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'));
      expect(await screen.findByTestId('mapping-run-approval')).toHaveTextContent('approvalAuto');
    } finally {
      keepStandingChoice(FOLDER, false);
    }
  });

  it('offers no row outside the map conversation', async () => {
    vault.uncovered = 96;
    render(
      <>
        <AcpChatPanelKeeper />
        <AcpChatPanel keepKey={`library:${FOLDER}:claude-acp`} runtimeId="claude-acp" runtimeLabel="Claude Agent" vaultRoot={FOLDER} />
      </>,
    );
    await agentStarts(1);
    expect(screen.queryByTestId('mapping-run-row')).toBeNull();
  });
});
