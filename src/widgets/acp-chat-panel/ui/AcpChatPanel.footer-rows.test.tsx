import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * **The composer footer keeps its meaning when the dock is narrow.**
 *
 * The defect this file exists for (owner, 2026-09-06, installed app, dock at its own default
 * width, a turn running): the runtime picker and the mode picker were the only elastic slots on
 * a row that also carried a status word, a running clock and four buttons. They absorbed the
 * whole shortfall and rendered as two chevrons with no label, so the screen no longer said which
 * tool or which mode the person was talking to.
 *
 * Two rules answer it, and both are structural rather than visual, so jsdom can hold them:
 *
 * 1. below `COMPOSER_FOOTER_ONE_ROW_PX` **of the composer's own width** the footer stacks into
 *    two rows, and above it stays one row;
 * 2. a picker never renders narrower than `min-w-[104px]`, so truncation shows a first word and
 *    an ellipsis instead of nothing.
 *
 * ⚠️ **jsdom evaluates no container query**, so it cannot answer "what does 440px look like".
 * What it can do is prove the rule exists, that it names the measured number rather than a
 * second one somebody typed, and that the ordinary (narrow) case is the *default* rather than
 * the exception — a footer whose one-row shape were the default would fail exactly the way the
 * reported one did if the query ever stopped matching. The rendered widths at 1512 are proved
 * separately by the screenshots this change carries.
 */

const bridge = vi.hoisted(() => {
  const state = {
    sent: [] as Array<Record<string, unknown>>,
    listener: null as ((line: string) => void) | null,
  };
  return state;
});

vi.mock('@/shared/lib/tauri-acp', () => ({
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
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

import { COMPOSER_FOOTER_ONE_ROW_PX } from '../model/panel-width';
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

describe('composer footer — narrow is the default shape, not the broken one', () => {
  it('stacks into two rows and only unstacks above the measured width', async () => {
    await bootPanel();

    const footer = screen.getByTestId('acp-chat-footer');
    // The resting shape is the two-row one: a column whose children take the full width.
    expect(footer).toHaveClass('flex', 'flex-col', 'items-stretch');
    // One row is what the container query *adds*, at the width that was measured for it.
    const oneRow = `@min-[${COMPOSER_FOOTER_ONE_ROW_PX}px]/composer`;
    expect(footer.className).toContain(`${oneRow}:flex-row`);
    expect(footer.className).toContain(`${oneRow}:items-center`);
    expect(footer.className).toContain(`${oneRow}:justify-between`);

    // Row 2's two halves: the status word and its clock take the free space, so the session
    // buttons and send sit at the right edge instead of trailing the word.
    const status = footer.querySelector('[data-acp-status-badge]')!;
    expect(status.className).toContain('mr-auto');
    expect(status.className).toContain(`${oneRow}:mr-0`);

    // The container the query measures is the composer box, not the window.
    expect(screen.getByTestId('acp-chat-composer').className).toContain('@container/composer');
  });

  it('never lets a picker shrink below its label', async () => {
    await bootPanel();

    // Both pickers the owner saw empty: the tool on the left, the mode beside it.
    for (const testId of ['acp-chat-runtime', 'acp-chat-mode']) {
      const wrapper = screen.getByTestId(testId).closest('.relative')!;
      expect(wrapper.className, testId).toContain('min-w-[104px]');
      // The floor does not replace the equal-slot rule; it only stops it at the bottom.
      expect(wrapper.className, testId).toContain('flex-1 basis-0');
    }
  });

  it('keeps the pickers and the buttons in separate rows of the footer', async () => {
    await bootPanel();

    const footer = screen.getByTestId('acp-chat-footer');
    const actions = screen.getByTestId('acp-chat-session-actions');
    const pickerRow = screen.getByTestId('acp-chat-pickers');
    // The runtime picker really is inside that row, not merely beside it in the tree.
    expect(pickerRow).toContainElement(screen.getByTestId('acp-chat-runtime'));

    // Two children, in this order: everything you choose, then everything you press.
    expect(pickerRow.parentElement).toBe(footer);
    expect(actions.parentElement).toBe(footer);
    expect(Array.from(footer.children)).toEqual([pickerRow, actions]);
    // The picker row grows only once the footer is a row; as a column child, growing is vertical.
    expect(pickerRow.className).toContain(`@min-[${COMPOSER_FOOTER_ONE_ROW_PX}px]/composer:flex-1`);
  });
});
