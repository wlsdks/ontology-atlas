import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Where the conversation's controls stand. Until 2026-09-07 they were the composer's own
 * two-row footer; the owner asked for the bottom to hold only the input and send, so the
 * pickers, the status word and the session buttons are a toolbar above the transcript.
 */

const bridge = vi.hoisted(() => {
  const state = {
    sent: [] as Array<Record<string, unknown>>,
    listener: null as ((line: string) => void) | null,
  };
  return state;
});

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

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

import { AcpChatPanel } from './AcpChatPanel';

/** The agent answers the last request we sent with that method. */
function replyTo(method: string, result: unknown) {
  const call = [...bridge.sent].reverse().find((m) => m.method === method);
  bridge.listener?.(JSON.stringify({ jsonrpc: '2.0', id: call?.id, result }));
}

/**
 * The reported screen: two usable tools (so the runtime slot is a picker rather than text) and a
 * session that offers modes. `mcpServers` is passed because the panel's auto-allow branch only
 * exists when it is.
 */
async function bootPanel() {
  render(
    <AcpChatPanel
      runtimeId="claude-acp"
      runtimeLabel="Claude Code"
      vaultRoot="/vault"
      mcpServers={[{ name: 'atlas-vault' }]}
      runtimes={[
        { id: 'claude-acp', label: 'Claude Code' },
        { id: 'codex-acp', label: 'Codex' },
      ]}
      onRuntimeChange={() => {}}
    />,
  );
  await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
  replyTo('initialize', { protocolVersion: 1 });
  await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
  replyTo('session/new', {
    sessionId: 's-1',
    modes: {
      currentModeId: 'default',
      availableModes: [
        { id: 'default', name: 'Default' },
        { id: 'acceptEdits', name: 'Accept Edits' },
      ],
    },
  });
  await waitFor(() =>
    expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'),
  );
}

afterEach(() => {
  cleanup();
  bridge.sent = [];
  bridge.listener = null;
});

describe('the composer footer is one quiet row: pickers left, status and buttons right, send last', () => {
  /*
   * Owner, installed app, 2026-09-07, after a toolbar above the transcript left an empty band
   * at the top: "one line at the very bottom". So the tool and the mode are quiet text
   * pickers at the left of the composer's bottom row, and the status word, the session
   * buttons and send stand at its right — the way chat composers are laid out elsewhere.
   */
  it('keeps everything on the composer footer, in that order', async () => {
    await bootPanel();
    const footer = screen.getByTestId('acp-chat-footer');
    const pickers = screen.getByTestId('acp-chat-pickers');
    const actions = screen.getByTestId('acp-chat-session-actions');
    expect(Array.from(footer.children)).toEqual([pickers, actions]);
    expect(pickers).toContainElement(screen.getByTestId('acp-chat-runtime'));
    expect(pickers).toContainElement(screen.getByTestId('acp-chat-mode'));
    expect(actions.querySelector('[data-acp-status-badge]')).not.toBeNull();
    expect(actions).toContainElement(screen.getByTestId('acp-chat-new'));
    expect(actions).toContainElement(screen.getByTestId('acp-chat-send'));
    expect(actions.lastElementChild).toBe(screen.getByTestId('acp-chat-send-group'));
    expect(screen.queryByTestId('acp-chat-toolbar')).toBeNull();
  });

  it('draws the pickers as quiet text, not bordered boxes', async () => {
    await bootPanel();
    for (const testId of ['acp-chat-runtime', 'acp-chat-mode']) {
      const trigger = screen.getByTestId(testId);
      expect(trigger.className, testId).toContain('border-transparent');
      expect(trigger.className, testId).toContain('h-[var(--control-h-sm)]');
    }
  });

  it('never lets a picker shrink below its label', async () => {
    await bootPanel();
    for (const testId of ['acp-chat-runtime', 'acp-chat-mode']) {
      const wrapper = screen.getByTestId(testId).closest('.relative')!;
      expect(wrapper.className, testId).toContain('min-w-[3rem]');
    }
  });
});
