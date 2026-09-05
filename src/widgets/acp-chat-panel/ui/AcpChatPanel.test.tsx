import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TURN_SILENCE_LIMIT_MS } from '@/features/acp-session/model/turn-liveness';

/**
 * A fake bridge — it imitates the protocol round trip with no real process.
 *
 * `emit` is a line the agent sent and `sent` is a line we sent. So these checks
 * measure 「what the screen draws」 and 「what we answer the agent」 **together** — the
 * permission card is a checkpoint only when those two interlock.
 */
const bridge = vi.hoisted(() => {
  const state = {
    available: true,
    sent: [] as Array<Record<string, unknown>>,
    listener: null as ((line: string) => void) | null,
    verdict: 'ask' as 'ask' | 'allow-inside-vault',
    verdictCalls: [] as Array<{ sessionId: string; filePath: string | null }>,
    stopped: [] as string[],
    /** So a test can make the adapter process die. */
    exit: null as ((code: number | null) => void) | null,
    /** Notices from the Rust side (`acp://notice`) — the first-download indicator arrives this way. */
    notice: null as ((message: string) => void) | null,
    /** stderr diagnostics — the clues to a corrupt npx cache arrive this way (measured). */
    stderr: null as ((line: string) => void) | null,
  };
  return state;
});

vi.mock('@/shared/lib/tauri-acp', () => ({
  isAcpBridgeAvailable: () => bridge.available,
  startAcpSession: async () => 'acp-1-999',
  sendAcpLine: async (_id: string, line: string) => {
    bridge.sent.push(JSON.parse(line));
  },
  stopAcpSession: async (id: string) => {
    bridge.stopped.push(id);
  },
  acpPermissionVerdict: async (sessionId: string, filePath: string | null) => {
    bridge.verdictCalls.push({ sessionId, filePath });
    return bridge.verdict;
  },
  listenToAcpSession: async (
    _id: string,
    handlers: {
      onMessage?: (line: string) => void;
      onExit?: (code: number | null) => void;
      onNotice?: (message: string) => void;
      onStderr?: (line: string) => void;
    },
  ) => {
    bridge.listener = handlers.onMessage ?? null;
    bridge.exit = handlers.onExit ?? null;
    bridge.notice = handlers.onNotice ?? null;
    bridge.stderr = handlers.onStderr ?? null;
    return () => {
      bridge.listener = null;
      bridge.exit = null;
      bridge.notice = null;
      bridge.stderr = null;
    };
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

import {
  AcpChatPanel,
  type AcpOntologyRelationPreview,
} from './AcpChatPanel';
import type { AcpWorkReceipt } from '@/shared/lib/acp-work-receipt';

/** The agent sends one line. */
function emit(payload: unknown) {
  bridge.listener?.(JSON.stringify(payload));
}

/** Answer the last request we sent with that method. */
function replyTo(method: string, result: unknown) {
  const call = [...bridge.sent].reverse().find((m) => m.method === method);
  emit({ jsonrpc: '2.0', id: call?.id, result });
}

/**
 * ⚠️ `mcpServers` **must** be passed. Auto-allow for vault tools switches on only
 * 「when we really wired it in」 (2026-08-16) — without it, this measures a session in
 * which that branch does not exist at all, which is measuring something other than
 * the real app.
 */
async function bootSession(
  props: Partial<ComponentProps<typeof AcpChatPanel>> = {},
) {
  const baseProps = {
    runtimeId: 'claude-acp',
    runtimeLabel: 'Claude Code',
    vaultRoot: '/vault',
    mcpServers: [{ name: 'atlas-vault' }],
  } satisfies ComponentProps<typeof AcpChatPanel>;
  const view = render(
    <AcpChatPanel
      {...baseProps}
      {...props}
    />,
  );
  await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
  replyTo('initialize', { protocolVersion: 1 });
  await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
  replyTo('session/new', { sessionId: 's-1' });
  await waitFor(() =>
    expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'),
  );
  return {
    rerenderPanel(nextProps: Partial<ComponentProps<typeof AcpChatPanel>>) {
      view.rerender(<AcpChatPanel {...baseProps} {...nextProps} />);
    },
  };
}

function permissionRequest(filePath: string, id = 77, kind = 'edit') {
  return {
    jsonrpc: '2.0',
    id,
    method: 'session/request_permission',
    params: {
      sessionId: 's-1',
      options: [
        { kind: 'reject_once', name: 'Deny', optionId: 'reject' },
        { kind: 'allow_once', name: 'Allow Once', optionId: 'allow' },
        { kind: 'allow_always', name: 'Always', optionId: 'allow_always' },
      ],
      toolCall: { toolCallId: 'tc1', title: `Write ${filePath}`, kind, rawInput: { file_path: filePath } },
    },
  };
}

function answerFor(id: number) {
  const answer = bridge.sent.find((m) => m.id === id && 'result' in m);
  return (answer?.result as { outcome?: { outcome?: string; optionId?: string } })?.outcome;
}

/** The work detail is collapsed by default. Checks that measure a tool row expand it explicitly first. */
afterEach(() => {
  cleanup();
  bridge.available = true;
  bridge.sent = [];
  bridge.listener = null;
  bridge.verdictCalls = [];
  bridge.exit = null;
  bridge.notice = null;
  bridge.stderr = null;
  bridge.verdict = 'ask';
  bridge.stopped = [];
});

describe('대화 패널 — 일어난 일만 그린다', () => {
  it('재 보지 않은 작업 방식은 안전한 것처럼 보이지 않는다', async () => {
    render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Code"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
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
          { id: 'turbo-yolo', name: 'Turbo' },
        ],
      },
    });
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'),
    );

    fireEvent.click(screen.getByTestId('acp-chat-mode'));
    expect(screen.getByText('modeUnverified:{"name":"Turbo"}')).toBeInTheDocument();
    expect(screen.getByText('modeUnverifiedHint')).toBeInTheDocument();
  });

  it('모델·작업 방식은 빈 상자나 정지 버튼과 겹치는 고정 폭이 되지 않는다', async () => {
    render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Code"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
      />,
    );
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    replyTo('initialize', { protocolVersion: 1 });
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
    replyTo('session/new', {
      sessionId: 's-1',
      models: {
        currentModelId: null,
        availableModels: [{ modelId: 'gpt-5.6-sol-low', name: 'GPT-5.6-Sol (low)' }],
      },
      modes: {
        currentModeId: null,
        availableModes: [{ id: 'default', name: 'Default' }],
      },
    });
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'),
    );

    const choices = screen.getByTestId('acp-chat-choices');
    expect(choices).toHaveClass('w-full', 'min-w-0');
    expect(choices).not.toHaveClass('shrink-0');
    expect(screen.getByTestId('acp-chat-model')).toHaveTextContent('model');
    expect(screen.getByTestId('acp-chat-mode')).toHaveTextContent('mode');

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '계속해 줘' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() => expect(screen.getByTestId('acp-chat-stop')).toBeInTheDocument());
    expect(screen.getByTestId('acp-chat-choices')).toBeInTheDocument();
  });

  it('세션이 서면 준비됨이 되고, 보낸 말과 받은 말이 각각 남는다', async () => {
    await bootSession();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '이 폴더 정리해줘' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() => expect(screen.getByText('이 폴더 정리해줘')).toBeInTheDocument());

    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { update: { sessionUpdate: 'agent_message_chunk', content: { text: '네, ' } } },
    });
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { update: { sessionUpdate: 'agent_message_chunk', content: { text: '볼게요.' } } },
    });

    // Several chunks still make one bubble — a single sentence arrives split up.
    await waitFor(() => expect(screen.getByText('네, 볼게요.')).toBeInTheDocument());
    expect(screen.getAllByText(/네, 볼게요\./)).toHaveLength(1);
  });

  it('에이전트의 GFM 표를 좁은 패널에서도 구획과 가로 스크롤이 있는 표로 그린다', async () => {
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { text: '| 항목 | 값 |\n| --- | --- |\n| 소스 코드 | 연결 안 됨 |' },
        },
      },
    });

    const scroller = await screen.findByTestId('acp-chat-markdown-table');
    expect(scroller).toHaveClass('overflow-x-auto');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '항목' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '연결 안 됨' })).toBeInTheDocument();
  });

  it('생각과 말을 다른 것으로 그린다 — 중간 과정을 결론으로 읽지 않게', async () => {
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { update: { sessionUpdate: 'agent_thought_chunk', content: { text: '**어디부터** 볼까' } } },
    });
    await waitFor(() => expect(screen.getByTestId('acp-chat-work-group')).toBeInTheDocument());
    expect(screen.getByTestId('acp-chat-work-group')).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('[data-acp-entry="thought"]')).toBeNull();
    expect(document.querySelector('[data-acp-entry="agent"]')).toBeNull();

    fireEvent.click(screen.getByTestId('acp-chat-work-group'));
    await waitFor(() =>
      expect(document.querySelector('[data-acp-entry="thought"]')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('acp-chat-work-group')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText('**어디부터** 볼까')).toBeNull();
    expect(screen.getByText('어디부터').tagName).toBe('STRONG');
  });

  it('a tool line appears once the call is made, and its status only changes when told', async () => {
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: { sessionUpdate: 'tool_call', toolCallId: 'tc1', title: 'Read notes.md', kind: 'read', status: 'pending' },
      },
    });
    await waitFor(() => {
      const row = document.querySelector('[data-acp-entry="tool"]');
      expect(row).toHaveAttribute('data-tool-status', 'pending');
      expect(row).toHaveAttribute('data-tool-kind', 'read');
    });

    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { update: { sessionUpdate: 'tool_call_update', toolCallId: 'tc1', status: 'completed' } },
    });
    await waitFor(() =>
      expect(document.querySelector('[data-acp-entry="tool"]')).toHaveAttribute(
        'data-tool-status',
        'completed',
      ),
    );
    // The row count does not grow — it is the same tool call.
    expect(document.querySelectorAll('[data-acp-entry="tool"]')).toHaveLength(1);
  });

  it('renders an external connector call as a status-only trace line, with no invented meaning', async () => {
    /*
     * A connector's tools are somebody else's. The row may say **that** the call happened and how
     * it ended, and nothing more: translating `API-post-page` into a sentence of ours would make
     * the screen describe a Notion action in Atlas words, and it would keep describing it that way
     * on the day the tool changed. The vault's own outcome reading (「found N」) is withheld for the
     * same reason — we do not know the shape of somebody else's answer.
     */
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'ext1',
          title: 'mcp__notion__API-post-page',
          kind: 'other',
          status: 'in_progress',
          rawInput: { parent: { page_id: 'abc' } },
        },
      },
    });
    await waitFor(() => {
      const row = document.querySelector('[data-acp-entry="tool"]');
      expect(row).toHaveAttribute('data-tool-label', 'raw');
      expect(row).toHaveAttribute('data-tool-status', 'in_progress');
    });
    // The server prefix is stripped; the tool's own name is shown as it is.
    expect(document.querySelector('[data-tool-label-text]')?.textContent).toBe('API-post-page');
    // No vault node is claimed to have been touched by somebody else's tool.
    expect(document.querySelector('[data-testid="acp-chat-slug"]')).toBeNull();

    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'ext1',
          status: 'completed',
          rawOutput: { content: [{ type: 'text', text: '{"object":"page"}' }] },
        },
      },
    });
    await waitFor(() =>
      expect(document.querySelector('[data-acp-entry="tool"]')).toHaveAttribute(
        'data-tool-status',
        'completed',
      ),
    );
    // A status word, not a count. `data-tool-outcome` holds a number only for the vault
    // server's own tools, whose answer shape we wrote and can therefore read.
    expect(document.querySelector('[data-acp-entry="tool"]')).toHaveAttribute(
      'data-tool-outcome',
      'done',
    );
  });

  it('stands the tool line in the transcript — no disclosure is created for a turn that only called tools', async () => {
    /*
     * The trace only works if it is read without being asked for. Folded away, a `0 found`
     * beside a confident paragraph costs a click nobody makes.
     */
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-standing',
          title: 'mcp__atlas-vault__list_concepts',
          kind: 'read',
          status: 'pending',
        },
      },
    });
    await waitFor(() =>
      expect(document.querySelector('[data-acp-entry="tool"]')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('acp-chat-work-group')).toBeNull();
  });

  it('says how much came back, using the number the tool itself reported', async () => {
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-count',
          title: 'mcp__atlas-vault__list_concepts',
          kind: 'read',
          status: 'pending',
          rawInput: { kind: 'domain' },
        },
      },
    });
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-tool-outcome').textContent).toContain(
        'toolOutcome.running',
      ),
    );

    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tc-count',
          status: 'completed',
          // Exactly what the live server answers: one text block of pretty-printed JSON.
          rawOutput: [{ type: 'text', text: JSON.stringify({ total: 8, nodes: [] }, null, 2) }],
        },
      },
    });
    await waitFor(() =>
      expect(document.querySelector('[data-acp-entry="tool"]')).toHaveAttribute(
        'data-tool-outcome',
        '8',
      ),
    );
    expect(screen.getByTestId('acp-chat-tool-outcome').textContent).toContain(
      'toolOutcome.found',
    );
  });

  it('never puts a count beside a call that failed', async () => {
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-fail',
          title: 'mcp__atlas-vault__add_relation',
          kind: 'other',
          status: 'failed',
          rawOutput: [{ type: 'text', text: JSON.stringify({ total: 8 }) }],
        },
      },
    });
    await waitFor(() =>
      expect(document.querySelector('[data-acp-entry="tool"]')).toHaveAttribute(
        'data-tool-outcome',
        'failed',
      ),
    );
  });

  it('marks only a running call, and says the outcome in words on the rest', async () => {
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-dot',
          title: 'mcp__atlas-vault__list_concepts',
          kind: 'read',
          status: 'pending',
        },
      },
    });
    await waitFor(() =>
      expect(document.querySelector('[data-acp-entry="tool"] [data-tool-running]')).toBeInTheDocument(),
    );

    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tc-dot',
          status: 'completed',
          rawOutput: [{ type: 'text', text: JSON.stringify({ total: 2 }) }],
        },
      },
    });
    // A mark that varies reads as a mark that means something; "done" is already in words.
    await waitFor(() =>
      expect(document.querySelector('[data-acp-entry="tool"] [data-tool-running]')).toBeNull(),
    );
  });

  it('reports the number our server gave, and zero is a number', async () => {
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-none',
          title: 'mcp__atlas-vault__find_backlinks',
          kind: 'read',
          status: 'completed',
          rawOutput: [{ type: 'text', text: JSON.stringify({ total: 0, matches: [] }) }],
        },
      },
    });
    await waitFor(() =>
      expect(document.querySelector('[data-acp-entry="tool"]')).toHaveAttribute(
        'data-tool-outcome',
        '0',
      ),
    );
  });

  it('a search that found nothing says so, instead of reading like every other line', async () => {
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-none-words',
          title: 'mcp__atlas-vault__find_backlinks',
          kind: 'read',
          status: 'completed',
          rawOutput: [{ type: 'text', text: JSON.stringify({ total: 0, matches: [] }) }],
        },
      },
    });
    const outcome = await screen.findByTestId('acp-chat-tool-outcome');
    // Not "0 found" — the long form is what pushes this row out of the number column.
    expect(outcome.textContent).toBe('toolOutcome.foundNone');
  });

  it('never prints a number a foreign tool happened to call total', async () => {
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-foreign',
          title: 'Grep',
          kind: 'search',
          status: 'completed',
          // Somebody else's JSON. `total` there may be bytes, tokens, or a page index.
          rawOutput: [{ type: 'text', text: JSON.stringify({ total: 8, count: 2 }) }],
        },
      },
    });
    await waitFor(() =>
      expect(document.querySelector('[data-acp-entry="tool"]')).toHaveAttribute(
        'data-tool-outcome',
        'done',
      ),
    );
    expect(screen.getByTestId('acp-chat-tool-outcome').textContent).toBe('toolOutcome.done');
  });

  it('a call that did not land gets a seam, never a colour on the word', async () => {
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-broke',
          title: 'mcp__atlas-vault__add_relation',
          kind: 'other',
          status: 'failed',
        },
      },
    });
    const row = await waitFor(() => {
      const el = document.querySelector('[data-acp-entry="tool"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(row.className).toContain('border-[color:var(--color-danger-a50)]');
    // The ink stays tertiary: danger text against it measures 1.04:1.
    expect(row.className).toContain('text-[color:var(--color-text-tertiary)]');
    /*
     * ⚠️ **The seam replaces the run's rule; it does not stand beside it.** The row is
     * pulled out by the run's border plus its padding, and pays the same padding back, so
     * the red hairline lands on the grey one and the words stay in the transcript's single
     * left column. Measured 2026-09-05 before this pairing existed: the seam sat 1px right
     * of the divider (two rules for one fact) and the row's text 1px left of every sibling.
     * The two values are read off the wrapper rather than written twice, because the day
     * they disagree is the day the left edge goes ragged.
     */
    const run = row.closest('[data-acp-entry="tool-run"]');
    expect(run, 'a tool row outside its run has no rule to turn red').not.toBeNull();
    expect(run!.className).toContain('border-l');
    expect(run!.className).toContain('pl-2');
    expect(row.className).toContain('pl-2');
    // border-l (1) + pl-2 (8) = 9.
    expect(row.className).toContain('-ml-[9px]');
    expect(screen.getByTestId('acp-chat-tool-outcome').className).toContain(
      'font-[var(--font-weight-emphasis)]',
    );
  });

  it('draws consecutive calls on different targets as one run of standing rows', async () => {
    await bootSession();
    for (const [id, slug] of [
      ['r1', 'domains/order'],
      ['r2', 'domains/payment'],
      ['r3', 'domains/delivery'],
    ]) {
      emit({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          update: {
            sessionUpdate: 'tool_call',
            toolCallId: id,
            title: 'mcp__atlas-vault__get_concept',
            kind: 'read',
            status: 'completed',
            rawInput: { slug },
          },
        },
      });
    }
    await waitFor(() =>
      expect(document.querySelectorAll('[data-acp-entry="tool"]')).toHaveLength(3),
    );
    const runs = document.querySelectorAll('[data-acp-entry="tool-run"]');
    expect(runs).toHaveLength(1);
    expect(runs[0]).toHaveAttribute('data-tool-run-count', '3');
    expect(runs[0]).toHaveAttribute('data-tool-run-rows', '3');
    expect(document.querySelectorAll('[data-tool-repeat]')).toHaveLength(0);
  });

  /*
   * ⚠️ **Only repetition collapses** (2026-09-06). Three byte-identical calls are one fact stated
   * three times, and stating it three times pushes the *next*, different call out of view. The row
   * still says how many, so nothing about what happened is hidden — which is what keeps this
   * inside the 2026-09-05 decision that an agent's lookups stand above its answer.
   */
  it('folds a run of identical calls onto one row that says how many', async () => {
    await bootSession();
    for (const id of ['r1', 'r2', 'r3', 'r4']) {
      emit({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          update: {
            sessionUpdate: 'tool_call',
            toolCallId: id,
            title: 'mcp__atlas-vault__get_concept',
            kind: 'read',
            status: 'completed',
            rawInput: { slug: 'domains/order' },
          },
        },
      });
    }
    await waitFor(() =>
      expect(document.querySelectorAll('[data-acp-entry="tool"]')).toHaveLength(1),
    );
    const run = document.querySelector('[data-acp-entry="tool-run"]')!;
    expect(run).toHaveAttribute('data-tool-run-count', '4');
    expect(run).toHaveAttribute('data-tool-run-rows', '1');
    const repeat = screen.getByTestId('acp-chat-tool-repeat');
    expect(repeat).toHaveTextContent('×4');
    // The multiplication sign is read aloud by nothing, so the count carries a stated name.
    expect(repeat).toHaveAttribute('aria-label', 'toolRepeat:{"count":4}');
  });

  it('a very long provider tool name never pushes the transcript sideways', async () => {
    /*
     * ⚠️ **`shrink-0` on the label was a promise the row could not keep** (measured at
     * `CHAT_WIDTH_MIN`, 320). Someone else's adapter is free to name a tool anything; a
     * 90-character title held its full width and the outcome column — the diagnostic half
     * of the row — was pushed off the right edge, where a dock has no horizontal scrollbar
     * to get it back.
     */
    await bootSession();
    const longTitle = `Run${'ExtremelyVerboseProviderToolName'.repeat(3)}`;
    expect(longTitle.length).toBeGreaterThan(90);
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-long',
          title: longTitle,
          kind: 'execute',
          status: 'completed',
        },
      },
    });
    const row = await waitFor(() => {
      const el = document.querySelector('[data-acp-entry="tool"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    const label = row.querySelector('[data-tool-label-text]');
    expect(label, 'the label has no element of its own to constrain').not.toBeNull();
    // The row's own contract: the label yields, the outcome does not.
    expect(label!.className).toContain('truncate');
    expect(label!.className).toContain('min-w-0');
    expect(screen.getByTestId('acp-chat-tool-outcome').className).toContain('shrink-0');
  });

  it('frames a listing filter so it does not read as a concept that was read', async () => {
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-kind',
          title: 'mcp__atlas-vault__list_concepts',
          kind: 'read',
          status: 'pending',
          rawInput: { kind: 'capability' },
        },
      },
    });
    const target = await screen.findByTestId('acp-chat-tool-target');
    expect(target.textContent).toContain('kind: capability');
  });

  it('names a target the vault does not hold yet as plain text, never as a map marker', async () => {
    await bootSession({ knownSlugs: new Set(['capabilities/invoice']) });
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-new',
          title: 'mcp__atlas-vault__add_concept',
          kind: 'other',
          status: 'pending',
          rawInput: { slug: 'capabilities/not-yet-written' },
        },
      },
    });
    const target = await screen.findByTestId('acp-chat-tool-target');
    expect(target).toHaveAttribute('data-tool-target', 'name');
    expect(target.textContent).toContain('capabilities/not-yet-written');
    expect(screen.queryAllByTestId('acp-chat-slug')).toHaveLength(0);
  });
});

describe('대화 패널 — 권한 카드가 실제로 막는다', () => {
  /**
   * ⚠️ **A defect that only measurement could have caught** (2026-08-16).
   *
   * Running a real session end to end, the agent could write **nothing** to the map —
   * our own permission checkpoint was blocking our own MCP tools. An MCP tool call
   * has no `file_path`, so it fell into 「path unknown → ask」, even though that server
   * was launched by us against the vault path and cannot touch anything outside it.
   *
   * Every unit test was passing, because only requests with a file path had ever been
   * fed in — **there was no test for the absent input.**
   */
  function mcpPermissionRequest(
    toolName: string,
    id = 78,
    rawInput: Record<string, unknown> = { summary: true },
  ) {
    return {
      jsonrpc: '2.0',
      id,
      method: 'session/request_permission',
      params: {
        sessionId: 's-1',
        options: [
          { kind: 'reject_once', name: 'Deny', optionId: 'reject' },
          { kind: 'allow_once', name: 'Allow Once', optionId: 'allow' },
        ],
    // Exactly as measured: `rawInput` has no path and the name arrives in `title`.
        toolCall: { toolCallId: 'tc9', title: toolName, kind: 'other', rawInput },
      },
    };
  }

  it('단일 관계 변경안을 지도에 즉시 내보내고 승인부터 도구 완료까지 실선 단계로 잇는다', async () => {
    const previews: Array<{
      sourceSlug: string;
      targetSlug: string;
      relationType: string;
      phase: 'draft' | 'committing';
    } | null> = [];
    await bootSession({
      onOntologyRelationPreviewChange: (preview) => previews.push(preview),
    });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '관계를 추가해줘' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'thinking'),
    );

    const rawInput = {
      from: 'capabilities/contextual-editing',
      to: 'domains/graph-modeling',
      type: 'depends_on',
      why: '지도 안 쓰기 흐름이 graph modeling 계약을 따른다.',
    };
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc9',
          title: 'mcp__atlas-vault__add_relation',
          kind: 'other',
          status: 'pending',
          rawInput,
        },
      },
    });
    emit(mcpPermissionRequest('mcp__atlas-vault__add_relation', 89, rawInput));

    await waitFor(() =>
      expect(previews.at(-1)).toEqual({
        sourceSlug: 'capabilities/contextual-editing',
        targetSlug: 'domains/graph-modeling',
        relationType: 'depends_on',
        phase: 'draft',
      }),
    );

    // Wait for the card itself, not only for a side effect of the same event.
    // `previews` updates from the preview callback while the permission card mounts
    // on a later render, so a green `previews` assertion does not mean the button
    // exists yet. CI caught the gap on 2026-08-22 ("Unable to find
    // [data-testid=acp-permission-allow]") while every local run passed — the two
    // renders land in the same tick on a fast machine and not on a slow one.
    fireEvent.click(await screen.findByTestId('acp-permission-allow'));
    await waitFor(() =>
      expect(previews.at(-1)).toEqual({
        sourceSlug: 'capabilities/contextual-editing',
        targetSlug: 'domains/graph-modeling',
        relationType: 'depends_on',
        phase: 'committing',
      }),
    );
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    expect(
      answerFor(89),
      '확정 모션이 끝나기 전에 ACP 도구를 진행하면 빠른 쓰기에서 실선이 보이지 않는다',
    ).toBeUndefined();
    await waitFor(() =>
      expect(answerFor(89)).toEqual({ outcome: 'selected', optionId: 'allow' }),
    );

    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: { sessionUpdate: 'tool_call_update', toolCallId: 'some-other-tool', status: 'completed' },
      },
    });
    await waitFor(() => expect(previews.at(-1)?.phase).toBe('committing'));

    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: { sessionUpdate: 'tool_call_update', toolCallId: 'tc9', status: 'completed' },
      },
    });
    await waitFor(() => expect(previews.at(-1)).toBeNull());
  });

  it('관계 변경을 거절하면 실선 단계 없이 지도 변경안을 즉시 거둔다', async () => {
    const previews: Array<AcpOntologyRelationPreview | null> = [];
    await bootSession({
      onOntologyRelationPreviewChange: (preview) => previews.push(preview),
    });
    emit(
      mcpPermissionRequest('mcp__atlas-vault__add_relation', 91, {
        from: 'capabilities/contextual-editing',
        to: 'domains/graph-modeling',
        type: 'depends_on',
      }),
    );
    await waitFor(() => expect(previews.at(-1)?.phase).toBe('draft'));

    fireEvent.click(screen.getByTestId('acp-permission-reject'));

    await waitFor(() => expect(previews.at(-1)).toBeNull());
    expect(previews.some((preview) => preview?.phase === 'committing')).toBe(false);
    expect(answerFor(91)).toEqual({ outcome: 'selected', optionId: 'reject' });
  });

  /**
   * ⚠️ **The two answers must stay in the frame** (2026-09-06). The card sat unbounded in the
   * panel's flex column, so a batch write — one review row per item — grew it until 「Don't」 and
   * 「Allow once」 were below the bottom edge of a 1040×720 window. jsdom has no layout, so what is
   * pinned here is the structure that produces the behaviour: the panel caps the card's height,
   * the card scrolls **only its reading matter**, and the decision row sits after that scroller
   * rather than inside it. Rendered geometry is the installed app's job.
   */
  it('권한 카드가 길어져도 답할 두 버튼은 스크롤 밖에 남는다', async () => {
    await bootSession();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '관계를 정리해줘' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    emit(
      mcpPermissionRequest('mcp__atlas-vault__add_relation', 97, {
        from: 'capabilities/a',
        to: 'domains/b',
        type: 'relates',
        why: '같은 흐름이라서',
      }),
    );
    const card = await screen.findByTestId('acp-permission-card');
    const scroller = screen.getByTestId('acp-permission-body-scroll');
    const reject = screen.getByTestId('acp-permission-reject');
    const allow = screen.getByTestId('acp-permission-allow');

    expect(scroller.className).toContain('overflow-y-auto');
    expect(scroller.className).toContain('atlas-scroll-quiet');
    expect(scroller.contains(reject)).toBe(false);
    expect(scroller.contains(allow)).toBe(false);
    expect(card.contains(reject)).toBe(true);
    // The card yields its own height rather than the panel's, so the transcript is not evicted.
    expect(card.className).toContain('max-h-full');
    expect(card.closest('[data-surface-state]')?.className).toContain('max-h-[45%]');
  });

  it('온톨로지 쓰기의 사람 결정과 최종 도구 상태를 작업 영수증으로 내보낸다', async () => {
    const receipts: AcpWorkReceipt[] = [];
    await bootSession({ onWorkReceipt: (receipt) => receipts.push(receipt) });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '관계를 정리해줘' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    const rawInput = {
      from: 'capabilities/a',
      to: 'domains/b',
      type: 'relates',
      why: '같은 흐름이라서',
    };
    emit(mcpPermissionRequest('mcp__atlas-vault__add_relation', 96, rawInput));
    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());
    // Wait for the card itself, not only for a side effect of the same event.
    // `previews` updates from the preview callback while the permission card mounts
    // on a later render, so a green `previews` assertion does not mean the button
    // exists yet. CI caught the gap on 2026-08-22 ("Unable to find
    // [data-testid=acp-permission-allow]") while every local run passed — the two
    // renders land in the same tick on a fast machine and not on a slow one.
    fireEvent.click(await screen.findByTestId('acp-permission-allow'));

    await waitFor(() => expect(receipts.at(-1)).toMatchObject({
      request: '관계를 정리해줘',
      tool: 'add_relation',
      decision: 'allowed',
      result: 'pending',
    }));
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: { sessionUpdate: 'tool_call_update', toolCallId: 'tc9', status: 'completed' },
      },
    });
    await waitFor(() => expect(receipts.at(-1)?.result).toBe('completed'));
    expect(receipts.at(-1)?.items[0].relation?.to).toBe('domains/b');
  });

  it('거절한 변경은 실행 안 함 영수증으로 즉시 닫는다', async () => {
    const receipts: AcpWorkReceipt[] = [];
    await bootSession({ onWorkReceipt: (receipt) => receipts.push(receipt) });
    emit(mcpPermissionRequest('mcp__atlas-vault__add_concept', 97, {
      slug: 'capabilities/not-created',
      kind: 'capability',
      title: 'Not Created',
    }));
    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('acp-permission-reject'));

    await waitFor(() => expect(receipts).toHaveLength(1));
    expect(receipts[0]).toMatchObject({
      decision: 'rejected',
      result: 'not-run',
      tool: 'add_concept',
    });
  });

  it('여러 관계 요청은 모든 행을 보여 주고 고른 행 하나만 지도에 내보낸다', async () => {
    const previews: Array<AcpOntologyRelationPreview | null> = [];
    await bootSession({
      onOntologyRelationPreviewChange: (preview) => previews.push(preview),
    });
    emit(
      mcpPermissionRequest('mcp__atlas-vault__add_relations', 90, {
        relations: [
          { from: 'capabilities/a', to: 'domains/one', type: 'depends_on', why: '첫 이유' },
          { from: 'capabilities/b', to: 'domains/two', type: 'contains', why: '둘째 이유' },
        ],
      }),
    );
    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());
    const rows = screen.getAllByTestId('acp-ontology-change-item');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent('domains/two');
    expect(previews.at(-1)).toEqual({
      sourceSlug: 'capabilities/a',
      targetSlug: 'domains/one',
      relationType: 'depends_on',
      phase: 'draft',
    });

    fireEvent.click(screen.getByTestId('acp-ontology-change-item-1'));
    await waitFor(() => expect(previews.at(-1)).toEqual({
      sourceSlug: 'capabilities/b',
      targetSlug: 'domains/two',
      relationType: 'contains',
      phase: 'draft',
    }));
  });

  it('우리가 꽂아 준 볼트의 읽기 도구는 경로가 없어도 막지 않는다', async () => {
    await bootSession();
    emit(mcpPermissionRequest('mcp__atlas-vault__list_concepts'));

    await waitFor(() => expect(answerFor(78)).toEqual({ outcome: 'selected', optionId: 'allow' }));
    // A read does not raise the card — a person is not blocked on every lookup mid-conversation.
    expect(screen.queryByTestId('acp-permission-card')).toBeNull();
  });

  it('우리 볼트의 쓰기 도구는 경로가 없어도 변경안을 보여 주고 답을 기다린다', async () => {
    await bootSession();
    emit(
      mcpPermissionRequest('mcp__atlas-vault__add_concept', 83, {
        slug: 'capabilities/contextual-editing',
        kind: 'capability',
        title: 'Contextual Meaning Editing',
        domain: 'domains/graph-modeling',
      }),
    );

    await waitFor(() => expect(screen.getByTestId('acp-ontology-change-review')).toBeInTheDocument());
    expect(answerFor(83), '사람이 답하기 전에 ACP 세션을 이어가면 안 된다').toBeUndefined();
    expect(screen.getByText('capabilities/contextual-editing')).toBeInTheDocument();
    expect(screen.getByText('Contextual Meaning Editing')).toBeInTheDocument();
    expect(screen.queryByTestId('acp-permission-allow-always')).toBeNull();
  });

  it('**우리 도구라도 볼트 밖 경로면 묻는다** — 이름이 통행증이 아니다', async () => {
    /*
     * A hole caught in the 2026-08-16 review. A name starting with
     * `mcp__atlas-vault__` used to **skip the path check** and be allowed outright.
     * The rationale was "that server was launched against the vault path, so it cannot
     * touch anything outside", and that is not true: `absorb_document` edits the source
     * file in place relative to the **repository root**, not the vault. That breaks
     * this screen's promise "ask before going outside the folder" without a single card.
     */
    bridge.verdict = 'ask';
    await bootSession();
    emit({
      jsonrpc: '2.0',
      id: 81,
      method: 'session/request_permission',
      params: {
        sessionId: 's-1',
        options: [
          { kind: 'reject_once', name: 'Deny', optionId: 'reject' },
          { kind: 'allow_once', name: 'Allow Once', optionId: 'allow' },
        ],
        /*
         * ⚠️ The argument name is **`filePath`** — the name our MCP server actually
         * uses (`mcp/src/index.js` has `file_path` 0 times and `filePath` 30 times).
         * This check used to hand-write `file_path`, a shape the real server never
         * produces, so **the check was green while the screen was wide open.**
         */
        toolCall: {
          toolCallId: 'tc10',
          title: 'mcp__atlas-vault__absorb_document',
          kind: 'edit',
          rawInput: { filePath: '/repo/AGENTS.md', confirm: true },
        },
      },
    });

    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());
    expect(answerFor(81)).toBeUndefined();
  });

  it('폴더를 훑는 도구도 볼트 밖이면 묻는다 — 인자 이름이 `rootPath` 다', async () => {
    /*
     * `analyze_repo_structure` · `index_project` · `infer_imports` take a
     * **directory**, not a file. The decision is ultimately 「is this path inside the
     * vault」, and a folder answers that question too.
     */
    bridge.verdict = 'ask';
    await bootSession();
    emit({
      jsonrpc: '2.0',
      id: 82,
      method: 'session/request_permission',
      params: {
        sessionId: 's-1',
        options: [
          { kind: 'reject_once', name: 'Deny', optionId: 'reject' },
          { kind: 'allow_once', name: 'Allow Once', optionId: 'allow' },
        ],
        toolCall: {
          toolCallId: 'tc11',
          title: 'mcp__atlas-vault__analyze_repo_structure',
          kind: 'other',
          rawInput: { rootPath: '/somewhere/else' },
        },
      },
    });

    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());
    expect(answerFor(82)).toBeUndefined();
  });

  it('남의 MCP 도구는 경로가 없으면 그대로 묻는다', async () => {
    await bootSession();
    emit(mcpPermissionRequest('mcp__some-other-server__write_file', 79));

    // A name that is not our server has no basis for auto-allow — it has to ask.
    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());
    expect(answerFor(79)).toBeUndefined();
  });

  it('이름을 흉내 낸 도구는 통과하지 못한다', async () => {
    await bootSession();
    // If something merely prefix-similar (`atlas-vault-evil`) passed, the decision would be meaningless.
    emit(mcpPermissionRequest('mcp__atlas-vault-evil__write_file', 80));

    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());
    expect(answerFor(80)).toBeUndefined();
  });

  it('볼트 안 **읽기**는 카드를 안 띄우고 앱이 대신 허용한다', async () => {
    bridge.verdict = 'allow-inside-vault';
    await bootSession();
    emit(permissionRequest('/vault/notes.md', 77, 'read'));

    await waitFor(() => expect(answerFor(77)).toBeTruthy());
    expect(bridge.verdictCalls).toEqual([
      { sessionId: 'acp-1-999', filePath: '/vault/notes.md' },
    ]);
    expect(answerFor(77)).toEqual({ outcome: 'selected', optionId: 'allow' });
    expect(screen.queryByTestId('acp-permission-card')).toBeNull();
  });

  it('볼트 안이라도 **편집**은 카드를 띄운다 — 경로 안전과 변경 승인은 다른 질문이다', async () => {
    // 2026-09-01 review: path containment auto-allowed the agent's own edit tool on
    // vault Markdown, bypassing the review the Atlas write path enforces on the same files.
    bridge.verdict = 'allow-inside-vault';
    await bootSession();
    emit(permissionRequest('/vault/notes.md', 77, 'edit'));

    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());
    expect(answerFor(77)).toBeUndefined();

    fireEvent.click(screen.getByTestId('acp-permission-reject'));
    await waitFor(() => expect(answerFor(77)).toEqual({ outcome: 'selected', optionId: 'reject' }));
  });

  it('볼트 밖이면 카드를 띄우고, 답하기 전에는 아무 답도 보내지 않는다', async () => {
    await bootSession();
    emit(permissionRequest('/somewhere/else.md'));

    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());
    // This moment is the checkpoint — the agent gets no answer until the user chooses.
    expect(answerFor(77)).toBeUndefined();
    // The path is shown in full, untruncated — that is the basis for the judgement.
    expect(screen.getByTestId('acp-permission-path')).toHaveTextContent('/somewhere/else.md');
  });

  it('「안 할래요」를 누르면 거절이 전해지고 카드가 사라진다', async () => {
    await bootSession();
    emit(permissionRequest('/somewhere/else.md'));
    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('acp-permission-reject'));
    await waitFor(() => expect(answerFor(77)).toEqual({ outcome: 'selected', optionId: 'reject' }));
    /*
     * The card does **not** disappear immediately — it stays while the exit animation
     * runs. Being pressable during that window would send the answer twice, so it has
     * to be blocked with `inert` (the `Surface` contract). The disappearance itself
     * happens with time, so what is measured here is **whether it is blocked**.
     */
    const card = screen.queryByTestId('acp-permission-card');
    if (card) {
      expect(card.closest('[inert]'), '퇴장 중인 카드가 여전히 눌린다').not.toBeNull();
    }
    await waitFor(() => expect(screen.queryByTestId('acp-permission-card')).toBeNull(), {
      timeout: 2000,
    });
  });

  it('「이번만 허용」을 누르면 그 한 번만 허용된다', async () => {
    await bootSession();
    emit(permissionRequest('/somewhere/else.md'));
    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());

    // Wait for the card itself, not only for a side effect of the same event.
    // `previews` updates from the preview callback while the permission card mounts
    // on a later render, so a green `previews` assertion does not mean the button
    // exists yet. CI caught the gap on 2026-08-22 ("Unable to find
    // [data-testid=acp-permission-allow]") while every local run passed — the two
    // renders land in the same tick on a fast machine and not on a slow one.
    fireEvent.click(await screen.findByTestId('acp-permission-allow'));
    await waitFor(() => expect(answerFor(77)).toEqual({ outcome: 'selected', optionId: 'allow' }));
  });

  it('카드에는 닫는 X 가 없다 — 답하지 않고 치울 수 있으면 관문이 아니다', async () => {
    await bootSession();
    emit(permissionRequest('/somewhere/else.md'));
    const card = await screen.findByTestId('acp-permission-card');

    const buttons = [...card.querySelectorAll('button')].map((b) => b.getAttribute('data-testid'));
    expect(buttons).toEqual([
      'acp-permission-reject',
      'acp-permission-allow',
      'acp-permission-allow-always',
    ]);
  });

  it('「이 폴더 전체 허용」은 주 행동과 같은 무게로 두지 않는다', async () => {
    // This option widens the boundary wholesale in one click. At the same size as the
    // other two, people pick the easiest one.
    await bootSession();
    emit(permissionRequest('/somewhere/else.md'));
    await screen.findByTestId('acp-permission-card');

    const always = screen.getByTestId('acp-permission-allow-always');
    const allow = screen.getByTestId('acp-permission-allow');
    expect(always.className).not.toEqual(allow.className);
    // It sits in a different group from the primary action buttons.
    expect(always.parentElement).not.toBe(allow.parentElement);
  });
});

describe('대화 패널 — 대화방처럼 관리한다', () => {
  /** Imitate a `session/list` response, mixing in another folder's — that is what really happens. */
  function replyToList() {
    const call = [...bridge.sent].reverse().find((m) => m.method === 'session/list');
    if (!call) return false;
    emit({
      jsonrpc: '2.0',
      id: call.id,
      result: {
        sessions: [
          { sessionId: 's-old', cwd: '/vault', title: '어제 하던 정리', updatedAt: null },
          { sessionId: 's-other', cwd: '/somewhere/else', title: '남의 폴더 작업', updatedAt: null },
        ],
      },
    });
    return true;
  }

  it('지난 대화가 있으면 목록 문이 생기고, 이 폴더 것만 담긴다', async () => {
    await bootSession();
    await waitFor(() => expect(replyToList()).toBe(true));

    const historyButton = await screen.findByTestId('acp-chat-history');
    fireEvent.click(historyButton);

    const items = await screen.findAllByTestId('acp-chat-history-item');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveAttribute('data-session-id', 's-old');
    // A title from a folder that was not opened being on screen is the defect.
    expect(screen.queryByText('남의 폴더 작업')).toBeNull();
  });

  it('Esc 로 닫힌다 — 이 앱의 다른 표면이 다 그러므로', async () => {
    /*
     * Caught reviewing the real thing (2026-08-16): the list opened, Esc was pressed,
     * and it stayed. With only the scrim-click route, someone arriving by keyboard has
     * no way out.
     */
    await bootSession();
    await waitFor(() => expect(replyToList()).toBe(true));
    fireEvent.click(await screen.findByTestId('acp-chat-history'));
    expect(await screen.findByTestId('acp-chat-history-scrim')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId('acp-chat-history-scrim')).toBeNull());
  });

  it('지난 대화를 고르면 그것을 이어 받는다', async () => {
    await bootSession();
    await waitFor(() => expect(replyToList()).toBe(true));
    fireEvent.click(await screen.findByTestId('acp-chat-history'));
    const before = bridge.sent.filter((m) => m.method === 'initialize').length;
    fireEvent.click((await screen.findAllByTestId('acp-chat-history-item'))[0]);

    /*
     * Switching conversations **relaunches the process first**, so there is another
     * handshake (`initialize`) and nothing else arrives until it is answered. Without
     * imitating that round trip, the check reports 「it never came」 when in fact we
     * never answered.
     */
    await waitFor(() =>
      expect(bridge.sent.filter((m) => m.method === 'initialize').length).toBe(before + 1),
    );
    replyTo('initialize', { protocolVersion: 1 });

    // And it **resumes** that conversation rather than creating a new one.
    await waitFor(() => {
      const load = [...bridge.sent].reverse().find((m) => m.method === 'session/load');
      expect(load).toBeTruthy();
      expect((load?.params as { sessionId?: string })?.sessionId).toBe('s-old');
    });
    expect(
      [...bridge.sent].reverse().findIndex((m) => m.method === 'session/load'),
      '이어 받는 자리에서 새 대화를 만들면 지난 맥락이 사라진다',
    ).toBeLessThan([...bridge.sent].reverse().findIndex((m) => m.method === 'session/new'));
  });

  it('지난 대화가 없으면 목록 문을 만들지 않는다', async () => {
    await bootSession();
    const call = [...bridge.sent].reverse().find((m) => m.method === 'session/list');
    emit({ jsonrpc: '2.0', id: call?.id, result: { sessions: [] } });
    // No reason to show a first-time user a button that is always empty.
    await waitFor(() => expect(screen.getByTestId('acp-chat-new')).toBeInTheDocument());
    expect(screen.queryByTestId('acp-chat-history')).toBeNull();
  });

  it('「새 대화」는 기록을 비우고 새로 연다', async () => {
    await bootSession();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '먼저 한 말' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() => expect(screen.getByText('먼저 한 말')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('acp-chat-new'));
    await waitFor(() => expect(screen.queryByText('먼저 한 말')).toBeNull());
    // It opens a new one rather than resuming.
    expect(bridge.sent.filter((m) => m.method === 'session/load')).toHaveLength(0);
  });
});

describe('대화 패널 — 못 하는 일은 정직하게', () => {
  it('세션이 끝나면 상태로 말하고 작성 칸을 잠근다', async () => {
    await bootSession();
    // An exit event arrives when the adapter dies. A protocol error stands in for it here.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '안녕' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    const call = [...bridge.sent].reverse().find((m) => m.method === 'session/prompt');
    emit({ jsonrpc: '2.0', id: call?.id, error: { code: -1, message: 'adapter died' } });

    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'error'),
    );
    expect(screen.getByTestId('acp-chat-error')).toHaveTextContent('adapter died');
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  /*
   * ⚠️ Measured in the installed v1.0.0-rc.11 build: a turn ended on the agent's side without a
   * `session/prompt` result. All nine steps finished, the adapter went idle at 0.35s of CPU over
   * thirteen minutes, and because `prompt` is deliberately given **no timeout**, the panel kept
   * claiming progress and refused every keystroke. `cancel` recovered it; nothing on screen said so.
   *
   * The point of these two is that a long turn and a dead one must *not* look the same.
   */
  it('턴이 오래 조용하면 사실대로 말하고 나가는 길을 가리킨다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await bootSession();
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '지도 만들어줘' } });
      fireEvent.click(screen.getByTestId('acp-chat-send'));
      // The agent never answers, and never says anything either.
      expect(screen.queryByTestId('acp-chat-turn-silent')).toBeNull();

      await vi.advanceTimersByTimeAsync(TURN_SILENCE_LIMIT_MS + 6_000);
      await waitFor(() =>
        expect(screen.getByTestId('acp-chat-turn-silent')).toBeInTheDocument(),
      );
      // The way out has to be on screen next to the words that name the problem.
      expect(screen.getByTestId('acp-chat-stop')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('말을 계속하는 턴은 아무리 길어도 멈췄다고 하지 않는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await bootSession();
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '지도 만들어줘' } });
      fireEvent.click(screen.getByTestId('acp-chat-send'));

      // Three quiet stretches, each just under the limit, with one word between them: a real sweep.
      for (let round = 0; round < 3; round += 1) {
        await vi.advanceTimersByTimeAsync(TURN_SILENCE_LIMIT_MS - 10_000);
        emit({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId: 'sess-1',
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: `still going ${round}` },
            },
          },
        });
        // ⚠️ Chunks of one answer concatenate into a single node, so the text is matched inside the
        // panel rather than as its own element.
        await waitFor(() =>
          expect(screen.getByTestId('acp-chat-panel').textContent).toContain(
            `still going ${round}`,
          ),
        );
      }
      expect(screen.queryByTestId('acp-chat-turn-silent')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  /*
   * ⚠️ Caught by this very fix's first outing in the installed rc.12 build: a permission card sat on
   * screen while the notice under it said the agent had gone quiet for three minutes. Updates do
   * stop while an answer is awaited -- but the person is the thing that has stopped, the card
   * already explains the wait, and telling somebody nothing is happening while they are the thing
   * not happening is worse than saying nothing.
   */
  it('승인 카드가 떠 있는 동안은 조용해도 멈췄다고 하지 않는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await bootSession();
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '지도 만들어줘' } });
      fireEvent.click(screen.getByTestId('acp-chat-send'));
      emit(permissionRequest('/tmp/vault/a.md', 91));
      await waitFor(() =>
        expect(screen.getByTestId("acp-permission-card")).toBeInTheDocument(),
      );

      await vi.advanceTimersByTimeAsync(TURN_SILENCE_LIMIT_MS + 6_000);
      expect(screen.queryByTestId('acp-chat-turn-silent')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('빈 말은 보내지 않는다', async () => {
    await bootSession();
    expect(screen.getByTestId('acp-chat-send')).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    expect(screen.getByTestId('acp-chat-send')).toBeDisabled();
  });

  it('화면이 사라지면 프로세스도 끝낸다', async () => {
    await bootSession();
    cleanup();
    await waitFor(() => expect(bridge.stopped).toContain('acp-1-999'));
  });
});

describe('대화 패널 — 사람이 읽는 화면이다', () => {
  it('에이전트의 답을 마크다운으로 그린다 — 백틱이 글자로 남지 않게', async () => {
    /*
     * On the real thing it came out like this: ``This folder (`my-ontology-2`) is …`` —
     * backticks and all. This repository already has a renderer and only this screen
     * was not using it.
     */
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { text: '이 폴더의 `payment` 노드를 봤어요.\n\n- 하나\n- 둘' },
        },
      },
    });

    const body = await waitFor(() => {
      const el = document.querySelector('[data-acp-entry="agent"]');
      expect(el).not.toBeNull();
      return el!;
    });
    // The backticks disappear and it becomes a code fragment.
    expect(body.querySelector('code')?.textContent).toBe('payment');
    expect(body.textContent).not.toContain('`');
    // A list is drawn as a list too.
    expect(body.querySelectorAll('li')).toHaveLength(2);
  });

  it('도구 줄은 함수 이름이 아니라 일어난 일을 적는다', async () => {
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-known',
          title: 'mcp__atlas-vault__add_concept',
          kind: 'other',
          status: 'pending',
        },
      },
    });
    const row = await waitFor(() => {
      const el = document.querySelector('[data-acp-entry="tool"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(row).toHaveAttribute('data-tool-label', 'known');
    // A function name still on screen means it was not fixed.
    expect(row.textContent).not.toContain('mcp__');
    expect(row.textContent).not.toContain('add_concept');
  });

  it('모르는 도구는 이름만 보여 준다 — 그럴듯한 말을 지어내지 않는다', async () => {
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-raw',
          title: 'Terminal',
          kind: 'execute',
          status: 'pending',
        },
      },
    });
    const row = await waitFor(() => {
      const el = document.querySelector('[data-acp-entry="tool"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(row).toHaveAttribute('data-tool-label', 'raw');
    expect(row.textContent).toContain('Terminal');
  });
});

describe('대화 패널 — 어댑터를 두 개 띄우지 않는다', () => {
  /**
   * ⚠️ **A defect that surfaced only on the real thing** (2026-08-16).
   *
   * One chat window had two adapter processes running:
   * ```
   * 83796  npm exec @agentclientprotocol/claude-agent-acp@0.68.0
   * 83797  npm exec @agentclientprotocol/claude-agent-acp@0.68.0
   * ```
   * The lock was a single `clientRef`, and that value is filled in only **after** the
   * process is launched and the events attached. Called once more in between, both
   * pass. The session number is then the later one while the lines go back and forth
   * on the earlier, dying with `Session not found`, and the first process becomes a
   * ghost nobody shuts down.
   */
  it('띄우는 중에 또 불려도 세션은 하나만 연다', async () => {
    render(<AcpChatPanel runtimeId="claude-acp" runtimeLabel="Claude Agent" vaultRoot="/vault" />);

    // Wait until the first handshake goes out — that moment is 「launching」.
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    const initializes = bridge.sent.filter((m) => m.method === 'initialize').length;
    expect(initializes, '띄우는 중에 악수가 두 번 나가면 프로세스가 둘이다').toBe(1);

    replyTo('initialize', { protocolVersion: 1 });
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
    // There has to be only one session too.
    expect(bridge.sent.filter((m) => m.method === 'session/new')).toHaveLength(1);
  });

  it('매 렌더 새 배열이 와도 다시 띄우지 않는다', async () => {
    /*
     * That was one of this defect's triggers — a parent rebuilding `mcpServers` every
     * render changes the hook's `start` identity, and the effect watching it re-runs.
     * The caller was fixed too (useMemo), but **being blocked here is the contract**.
     */
    const { rerender } = render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Agent"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
      />,
    );
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));

    for (let i = 0; i < 3; i += 1) {
      rerender(
        <AcpChatPanel
          runtimeId="claude-acp"
          runtimeLabel="Claude Agent"
          vaultRoot="/vault"
          mcpServers={[{ name: 'atlas-vault' }]}
        />,
      );
    }
    expect(bridge.sent.filter((m) => m.method === 'initialize')).toHaveLength(1);
  });
});

describe('작성 칸 — 안내가 쓰는 글을 가리지 않는다', () => {
  /*
   * Owner report from the real thing, 2026-08-16: *"The text I type overlaps the text on the box?"*
   *
   * A defect I created. Trying to keep 「the row from shifting」, the hint was layered
   * over the text position — and that position is exactly where a long sentence
   * passes. A hint meant to disappear once learned was covering what had to be read.
   */
  it('손이 갔고 **비어 있을 때만** 안내를 띄운다', async () => {
    await bootSession();
    const box = screen.getByRole('textbox');

    // No hand there yet → absent.
    expect(screen.queryByTestId('acp-chat-hint')).toBeNull();
    expect(box).toHaveAttribute('placeholder', 'composerPlaceholder');

    fireEvent.focus(box);
    expect(screen.getByTestId('acp-chat-hint')).toBeInTheDocument();
    expect(
      box,
      '빈 작성 칸에서 placeholder 와 단축키 안내가 같은 줄을 차지한다',
    ).toHaveAttribute('placeholder', '');

    // One character makes it disappear — no chance to overlap.
    fireEvent.change(box, { target: { value: '가' } });
    expect(
      screen.queryByTestId('acp-chat-hint'),
      '글자가 있는데 안내가 남아 있으면 그 위에 겹쳐 그려진다',
    ).toBeNull();

    // Clearing it brings it back.
    fireEvent.change(box, { target: { value: '' } });
    expect(screen.getByTestId('acp-chat-hint')).toBeInTheDocument();

    fireEvent.blur(box);
    expect(screen.queryByTestId('acp-chat-hint')).toBeNull();
    expect(box).toHaveAttribute('placeholder', 'composerPlaceholder');
  });

  it('머리의 아이콘 버튼은 이름을 갖고, 작지 않다', async () => {
    /*
     * An icon-only button has no visible name. The accessible name is enforced by the
     * type (`IconButton.label`), but for **someone looking at the screen** the tooltip
     * plays that role.
     */
    await bootSession();
    // Close exists only where `onClose` was passed — only the always-present ones are checked here.
    for (const id of ['acp-chat-new']) {
      const button = screen.getByTestId(id);
      expect(button, id).toHaveAccessibleName();
      /*
       * The icon-control ramp is 24 / 28 / 32 and `lg` is the top. This is the panel's
       * primary chrome, so it uses the top — growing further would mean extending the
       * ramp, and that is not decided alone in this place (the 「System」 seat's call).
       */
      expect(button.className, `${id}: 크기가 한 단 내려갔다`).toContain('h-8 w-8');
    }
  });
});

describe('대화 패널 — 떠 있는 것은 떠 있어야 한다', () => {
  /*
   * Owner report from the real thing, 2026-08-16: *"It comes out together like this and can't be told apart."*
   *
   * With the past-conversations list as a flex child, opening it **pushed** the
   * conversation down and the list looked like part of the conversation. Putting
   * something that should float into the flow makes it not a popover but just another row.
   */
  function replyToList() {
    const call = [...bridge.sent].reverse().find((m) => m.method === 'session/list');
    if (!call) return false;
    emit({
      jsonrpc: '2.0',
      id: call.id,
      result: {
        sessions: [
          { sessionId: 's-old', cwd: '/vault', title: '어제 하던 정리', updatedAt: '2026-08-15T09:00:00Z' },
        ],
      },
    });
    return true;
  }

  it('목록은 흐름을 밀지 않는다 — 떠서 덮는다', async () => {
    await bootSession();
    await waitFor(() => expect(replyToList()).toBe(true));
    fireEvent.click(await screen.findByTestId('acp-chat-history'));

    const list = await screen.findByTestId('acp-chat-history-list');
    // Some ancestor has to be out of the flow (`absolute`).
    const floating = list.closest('.absolute');
    expect(floating, '목록이 흐름 안에 있으면 열 때 대화가 밀려난다').not.toBeNull();
  });

  it('막이 있고, 아무 데나 누르면 닫힌다', async () => {
    await bootSession();
    await waitFor(() => expect(replyToList()).toBe(true));
    fireEvent.click(await screen.findByTestId('acp-chat-history'));

    const scrim = await screen.findByTestId('acp-chat-history-scrim');
    fireEvent.click(scrim);
    await waitFor(() => expect(screen.queryByTestId('acp-chat-history-scrim')).toBeNull());
  });

  it('언제 한 대화인지 보여 준다 — 이미 받아 온 값을 버리지 않는다', async () => {
    await bootSession();
    await waitFor(() => expect(replyToList()).toBe(true));
    fireEvent.click(await screen.findByTestId('acp-chat-history'));

    const item = await screen.findByTestId('acp-chat-history-item');
    expect(item.textContent).toContain('어제 하던 정리');
    // The time is the basis for choosing among conversations with similar titles.
    expect(item.textContent, '날짜가 없으면 무엇을 고를지 알 수 없다').toMatch(/2026/);
  });
});

describe('대화 패널 — 내 질문과 답이 갈린다', () => {
  it('두 번째 질문부터는 차례 경계가 그어진다', async () => {
    await bootSession();
    const box = screen.getByRole('textbox');

    fireEvent.change(box, { target: { value: '첫 질문' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() => expect(screen.getByText('첫 질문')).toBeInTheDocument());
    // A boundary drawn with nothing above it is not a boundary but decoration.
    expect(document.querySelectorAll('[data-turn-start]')).toHaveLength(0);

    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { update: { sessionUpdate: 'agent_message_chunk', content: { text: '답' } } },
    });
    // The next message can only be sent once the turn ends — the composer locks while it runs.
    replyTo('session/prompt', { stopReason: 'end_turn' });
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'),
    );

    fireEvent.change(box, { target: { value: '둘째 질문' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));

    await waitFor(() =>
      expect(document.querySelectorAll('[data-turn-start]'), '차례가 바뀌었는데 경계가 없다').toHaveLength(1),
    );
  });
});

describe('대화 패널 — 오류는 사람의 말로 말하고 다음 할 일을 준다', () => {
  it('로그인이 풀린 것을 알아보고, 원문은 접어 둔다', async () => {
    /*
     * Owner's screen, 2026-08-16: this position was pasting the whole JSON-RPC error.
     * *"How is a user supposed to understand this?"*
     */
    await bootSession();
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '안녕' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() =>
      expect(bridge.sent.some((m) => m.method === 'session/prompt')).toBe(true),
    );

    const call = [...bridge.sent].reverse().find((m) => m.method === 'session/prompt');
    emit({
      jsonrpc: '2.0',
      id: call?.id,
      error: {
        code: -32603,
        message:
          'Internal error: Failed to authenticate: OAuth session expired and could not be refreshed',
        data: { errorKind: 'authentication_failed' },
      },
    });

    const alert = await screen.findByTestId('acp-chat-error');
    // Which branch it was read as stays on screen — so it can be checked from outside.
    expect(alert.dataset.trouble).toBe('auth');
    // The human-readable title and **what to do** come from that branch's key.
    expect(alert.textContent).toContain('trouble.auth.title');
    expect(alert.textContent).toContain('trouble.auth.hint');
    // The original is not discarded but folded away.
    const details = alert.querySelector('details');
    expect(details).toBeTruthy();
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.textContent).toContain('authentication_failed');
  });

  it('같은 실패를 두 번 말하지 않는다 — 어댑터가 메시지로도 보낸 원문은 안 그린다', async () => {
    /*
     * Measured in the installed app, 2026-08-17. The check above looked only at **the
     * card**, so it never saw that the adapter sends the same thing as a
     * `session/update` message too. On screen the English original stood **before**
     * the card.
     */
    await bootSession();
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '안녕' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() =>
      expect(bridge.sent.some((m) => m.method === 'session/prompt')).toBe(true),
    );

    const echo = 'Failed to authenticate: OAuth session expired and could not be refreshed';
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: echo },
        },
      },
    });
    await screen.findByText(echo);

    const call = [...bridge.sent].reverse().find((m) => m.method === 'session/prompt');
    emit({
      jsonrpc: '2.0',
      id: call?.id,
      error: {
        code: -32603,
        message: `Internal error: ${echo}`,
        data: { errorKind: 'authentication_failed' },
      },
    });

    const alert = await screen.findByTestId('acp-chat-error');
    // The original survives only inside the folded "Details".
    expect(alert.textContent).toContain('authentication_failed');
    // That line is no longer in the transcript.
    const transcript = screen.getByTestId('acp-chat-panel');
    const outsideAlert = [...transcript.querySelectorAll('*')].filter(
      (el) => el.textContent === echo && !alert.contains(el),
    );
    expect(outsideAlert, '영문 원문이 카드 밖에 또 있다').toHaveLength(0);
  });

  it('깨진 npx 캐시로 죽은 것을 알아본다 — 오류 문자열이 아무 말도 안 해도 (2026-08-19 실기계)', async () => {
    /*
     * Exactly the owner's screen: the error was only `acp session closed` and every
     * clue was in stderr. If that combination ends as `unknown` (「tell us if this keeps
     * happening」) there is nothing the user can do — reading it as the install branch
     * is what produces the real action, 「a new conversation = the app clears it and
     * downloads again」.
     */
    render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Code"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
      />,
    );
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    // The three measured stderr lines.
    bridge.stderr?.('npm error code ENOENT');
    bridge.stderr?.('npm error path /Users/me/.npm/_npx/8757e2301903ae53/package.json');
    bridge.stderr?.("npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open '/Users/me/.npm/_npx/8757e2301903ae53/package.json'");
    // npx dies → the initialize wait ends as `acp session closed`.
    bridge.exit?.(1);

    const alert = await screen.findByTestId('acp-chat-error');
    expect(alert.dataset.trouble).toBe('install');
    expect(alert.textContent).toContain('trouble.install.title');
    expect(alert.textContent).toContain('trouble.install.hint');
    // The original and the stderr clues survive inside the folded "Details".
    const details = alert.querySelector('details');
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.textContent).toContain('acp session closed');
    expect(details?.textContent).toContain('_npx/8757e2301903ae53');
  });

  it('카드가 시킨 그 행동을 카드가 준다 — 「다시 시도」가 실제로 새 세션을 띄운다', async () => {
    /*
     * Owner's installed app, 2026-08-24: *"if this is normal I still would not know what to do —
     * give me what to do, bigger and better made"*. Five of the six kinds ended their sentence with
     * 「press New chat」, and 「New chat」 was a pencil icon up in the header. An error surface whose
     * next step lives somewhere else is a dead end.
     */
    render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Code"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
      />,
    );
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    const handshakes = () => bridge.sent.filter((m) => m.method === 'initialize').length;
    const before = handshakes();
    bridge.stderr?.('npm error enoent Could not read package.json');
    bridge.exit?.(1);

    const alert = await screen.findByTestId('acp-chat-error');
    const retry = alert.querySelector<HTMLButtonElement>('[data-testid="acp-chat-error-retry"]');
    expect(retry, '오류 카드가 「다시 시도」를 주지 않는다').not.toBeNull();
    fireEvent.click(retry as HTMLButtonElement);
    await waitFor(() =>
      expect(
        handshakes(),
        '「다시 시도」가 새 악수를 시작하지 않았다',
      ).toBeGreaterThan(before),
    );
  });
});

describe('첫 내려받기 — 「켜는 중」만으로는 부족하다 (2026-08-19)', () => {
  it('받는 중이라는 사실과 실측 진행(MB)을 말하고, 준비되면 거둔다', async () => {
    render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Code"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
      />,
    );
    // Starting (before the handshake) — Rust announces the first download.
    await waitFor(() => expect(bridge.notice).toBeTruthy());
    bridge.notice?.('npx-first-run-download');

    const card = await screen.findByTestId('acp-starting');
    expect(card.textContent).toContain('firstRun.title');
    expect(card.textContent).toContain('firstRun.body');
    // No progress yet — **nothing is invented.**
    expect(screen.queryByTestId('acp-first-run-progress')).toBeNull();

    // A number is stated only once the measured growth of the cache directory arrives.
    bridge.notice?.('npx-download-progress:12');
    await waitFor(() =>
      expect(screen.getByTestId('acp-first-run-progress').textContent).toContain(
        'firstRun.progress:{"mb":12}',
      ),
    );

    // Once the handshake finishes and it is ready, the download indicator disappears.
    replyTo('initialize', { protocolVersion: 1 });
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
    replyTo('session/new', { sessionId: 's-1' });
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'),
    );
    expect(screen.queryByTestId('acp-starting')).toBeNull();
  });

  it('첫 알림을 놓쳐도 진행 알림만으로 표시를 만든다 — 구독 전에 나간 알림은 유실될 수 있다', async () => {
    render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Code"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
      />,
    );
    await waitFor(() => expect(bridge.notice).toBeTruthy());
    // Progress notices arrive without a preceding `npx-first-run-download`.
    bridge.notice?.('npx-download-progress:7');
    await screen.findByTestId('acp-starting');
    expect(screen.getByTestId('acp-first-run-progress').textContent).toContain(
      'firstRun.progress:{"mb":7}',
    );
  });

  it('내려받기가 없는 평범한 시작도 화면 가운데서 기다린다 — 우측 상단 칩 하나로는 부족하다', async () => {
    /*
     * ⚠️ This test used to assert the opposite: *"a start with no download draws nothing extra."*
     * Owner, 2026-08-24, of the top-right 「connecting」 badge: *"when it first opens it would be
     * good to have a spinner in the middle of the screen… large enough to actually see."* The
     * centred block existed but only while npx was fetching, so the common case — an ordinary
     * start — left the body empty and the panel looked finished while it was still opening.
     */
    render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Code"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
      />,
    );
    const waiting = await screen.findByTestId('acp-starting');
    expect(waiting.textContent).toContain('starting.title');
    // No download, so nothing claims one — and no invented megabytes.
    expect(waiting.textContent).not.toContain('firstRun.title');
    expect(screen.queryByTestId('acp-first-run-progress')).toBeNull();
    // The 「ask me anything」 hint must not invite input into a tool that cannot answer yet.
    expect(screen.queryByTestId('acp-chat-empty')).toBeNull();
  });

  it('준비되면 기다림 표시는 사라진다', async () => {
    await bootSession();
    expect(screen.queryByTestId('acp-starting')).toBeNull();
  });

  /*
   * ⚠️ A door may open with a first turn (decision, 2026-08-24). The first-run card's 「make a map
   * from my code」 button presses this: the app cannot run the analysis itself — it never calls
   * MCP — so it hands the work to the agent. The sentence must wait for `ready`, because a prompt
   * sent into a starting session is swallowed and the person watches a door do nothing.
   */
  it('문이 실은 첫 말은 세션이 준비된 뒤에, 한 번만 나간다', async () => {
    render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Code"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
        openingRequest={{ text: 'Build a first ontology for /repo.', nonce: 7 }}
      />,
    );
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    const promptsWhileStarting = () =>
      bridge.sent.filter((m) => m.method === 'session/prompt').length;
    expect(promptsWhileStarting(), '아직 시작 중인데 보냈다 — 삼켜진다').toBe(0);

    replyTo('initialize', { protocolVersion: 1 });
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
    replyTo('session/new', { sessionId: 's-1' });

    await waitFor(() => expect(promptsWhileStarting()).toBe(1));
    const sent = bridge.sent.find((m) => m.method === 'session/prompt') as
      | { params?: { prompt?: Array<{ text?: string }> } }
      | undefined;
    expect(sent?.params?.prompt?.[0]?.text).toBe('Build a first ontology for /repo.');

    // The same nonce must not fire again on a later render — one press, one turn.
    replyTo('session/prompt', { stopReason: 'end_turn' });
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'),
    );
    expect(promptsWhileStarting()).toBe(1);
  });
  it('holds a queued request for a different scope and acknowledges only a real turn start', async () => {
    const view = await bootSession();
    const consumed = vi.fn();
    const openingRequest = { text: 'Review the captured scope.', nonce: 41, scopeKey: 'vault-A:profile-A' };
    view.rerenderPanel({ openingRequest, requestScopeKey: 'vault-B:profile-B', onOpeningRequestSent: consumed });
    expect(bridge.sent.filter((row) => row.method === 'session/prompt')).toHaveLength(0);
    expect(consumed).not.toHaveBeenCalled();
    await screen.findByText('openingScopeChanged');
    view.rerenderPanel({ openingRequest, requestScopeKey: openingRequest.scopeKey, onOpeningRequestSent: consumed });
    await waitFor(() => expect(bridge.sent.filter((row) => row.method === 'session/prompt')).toHaveLength(1));
    expect(consumed).toHaveBeenCalledExactlyOnceWith(41);
    view.rerenderPanel({ openingRequest: null, requestScopeKey: openingRequest.scopeKey, onOpeningRequestSent: consumed });
    replyTo('session/prompt', { stopReason: 'end_turn' });
    await waitFor(() => expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'));
    cleanup(); bridge.sent = []; bridge.listener = null;
    await bootSession({ openingRequest: null, requestScopeKey: openingRequest.scopeKey, onOpeningRequestSent: consumed });
    expect(bridge.sent.filter((row) => row.method === 'session/prompt')).toHaveLength(0);
  });
});

describe('권한 카드 — 놓칠 수 없어야 한다', () => {
  it('카드가 뜨면 **초점이 그 안으로** 온다 — 거절 쪽으로', async () => {
    /*
     * Review 2026-08-16: this card declared `role="alertdialog"` while doing none of
     * what that role promises (interrupting, moving focus). For someone who cannot see
     * the screen, the moment the agent stopped was complete silence.
     *
     * Focus goes to **reject**, not allow — a hand pressing any key to move past must
     * not land on the irreversible side.
     */
    bridge.verdict = 'ask';
    await bootSession();
    emit(permissionRequest('/somewhere/else/notes.md'));

    const card = await screen.findByTestId('acp-permission-card');
    await waitFor(() =>
      expect(card.contains(document.activeElement), '초점이 카드 밖에 있다').toBe(true),
    );
    expect(document.activeElement).toBe(screen.getByTestId('acp-permission-reject'));
    // The other thing the role promises — a body that reads out what is being asked.
    expect(card.getAttribute('aria-describedby')).toBe('acp-permission-body');
  });
});

describe('빈 대화의 추천 — 이 폴더에 대한 것만 그린다', () => {
  /**
   * What the model (`chat-suggestions.ts`) suggests is pinned by its own test. What is
   * pinned here is **whether the screen actually draws it and seats the sentence in
   * the composer on click**. A green model with a screen that does not draw it means
   * nothing happens.
   */
  it('도크 첫 프레임부터 완성된 빈 대화를 그리고, 연결만 뒤에서 기다린다', () => {
    render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Agent"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
        sessionEnabled={false}
        suggestions={[{ kind: 'explain', params: { count: 80 } }]}
      />,
    );

    expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'starting');
    expect(screen.getByTestId('acp-connection-spinner')).toBeTruthy();
    expect(screen.getByTestId('acp-chat-empty')).toBeTruthy();
    expect(screen.getByTestId('acp-chat-suggestion-explain')).toBeTruthy();
    expect(screen.getByTestId('acp-chat-composer')).toBeTruthy();
    expect(bridge.sent.some((message) => message.method === 'initialize')).toBe(false);
  });

  it('추천을 받으면 그려지고, 누르면 입력칸에 문장이 앉는다', async () => {
    render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Agent"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
        suggestions={[
          { kind: 'island', params: { first: 'capabilities/invoice', count: 2 } },
          { kind: 'explain', params: { count: 80 } },
        ]}
      />,
    );
    // The same content is visible before the session starts. Here we proceed to the actual ready state
    // to re-establish the subsequent click/input contract.
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    replyTo('initialize', { protocolVersion: 1 });
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
    replyTo('session/new', { sessionId: 's-1' });

    const island = await screen.findByTestId('acp-chat-suggestion-island');
    // **This folder's real name** has to be in the bubble — without it, it is an
    // example sentence that would fit any app, which is decoration, not a suggestion.
    expect(island.textContent).toContain('capabilities/invoice');

    fireEvent.click(island);

    // `acp-chat-composer` is **the box wrapping** the input — grabbing it leaves
    // `value` undefined, so any assertion passes. Grab the element that has the real
    // value.
    const composer = screen
      .getByTestId('acp-chat-composer')
      .querySelector('textarea') as HTMLTextAreaElement;
    expect(composer, '작성 칸을 못 찾았다 — 이 단언은 무엇도 재지 못한다').toBeTruthy();
    await waitFor(() =>
      expect((composer as HTMLTextAreaElement).value).toContain('capabilities/invoice'),
    );
    // It only sits down and is **not sent** — the user has to be able to edit and send
    // (the same contract as `prefillRequest`).
    expect(bridge.sent.some((m) => m.method === 'session/prompt')).toBe(false);
  });

  it('추천이 없으면 그 칸 자체가 없다 — 빈 상자를 그리지 않는다', async () => {
    await bootSession();
    expect(screen.getByTestId('acp-chat-empty')).toBeTruthy();
    expect(screen.queryByTestId('acp-chat-suggestions')).toBeNull();
  });

  it('소스 연결 추천은 에이전트 문장으로 바꾸지 않고 앱의 연결 행동으로 보낸다', async () => {
    const onSuggestionAction = vi.fn(() => true);
    await bootSession({
      suggestions: [{ kind: 'connectSource', params: { count: 1 } }],
      onSuggestionAction,
    });
    fireEvent.click(screen.getByTestId('acp-chat-suggestion-connectSource'));

    expect(onSuggestionAction).toHaveBeenCalledWith({
      kind: 'connectSource',
      params: { count: 1 },
    });
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});

describe('완료된 대화의 추천 — 답변에서 다음 행동으로 잇는다', () => {
  async function completeTurn() {
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '첫 온톨로지를 만들어 줘' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() => expect(screen.getByText('첫 온톨로지를 만들어 줘')).toBeInTheDocument());
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { text: '첫 온톨로지가 준비됐어요.' },
        },
      },
    });
    await waitFor(() => expect(screen.getByText('첫 온톨로지가 준비됐어요.')).toBeInTheDocument());
  }

  it('답변이 끝난 뒤에만 추천을 붙이고, 눌러도 자동 전송하지 않는다', async () => {
    await bootSession({ suggestions: [{ kind: 'explain', params: { count: 12 } }] });
    await completeTurn();

    expect(screen.queryByTestId('acp-chat-post-turn-suggestions')).toBeNull();
    replyTo('session/prompt', { stopReason: 'end_turn' });

    const endcap = await screen.findByTestId('acp-chat-post-turn-suggestions');
    const answer = screen.getByText('첫 온톨로지가 준비됐어요.');
    expect(
      Boolean(answer.compareDocumentPosition(endcap) & Node.DOCUMENT_POSITION_FOLLOWING),
      '다음 행동이 최신 답변보다 앞에 그려졌다',
    ).toBe(true);
    expect(endcap).toHaveTextContent('suggest.followUpHeading');

    const promptsBeforeChoice = bridge.sent.filter((message) => message.method === 'session/prompt').length;
    fireEvent.click(screen.getByTestId('acp-chat-suggestion-explain'));
    expect(screen.getByRole('textbox')).toHaveValue('suggest.explain.prompt:{"count":12}');
    expect(screen.getByRole('textbox')).toHaveFocus();
    expect(bridge.sent.filter((message) => message.method === 'session/prompt')).toHaveLength(
      promptsBeforeChoice,
    );
  });

  it('같은 대화에서 볼트 상태가 갱신되면 끝낸 행동을 버리고 최신 다음 행동으로 바꾼다', async () => {
    const initialSuggestions = [{ kind: 'bootstrap', params: { count: 5 } }] as const;
    const { rerenderPanel } = await bootSession({ suggestions: initialSuggestions });
    await completeTurn();
    replyTo('session/prompt', { stopReason: 'end_turn' });
    await screen.findByTestId('acp-chat-suggestion-bootstrap');

    const promptsBeforeChoice = bridge.sent.filter(
      (message) => message.method === 'session/prompt',
    ).length;
    rerenderPanel({
      suggestions: [
        { kind: 'evidence', params: { count: 1, first: 'capabilities/payments' } },
        { kind: 'explain', params: { count: 6 } },
      ],
    });

    await waitFor(() =>
      expect(screen.queryByTestId('acp-chat-suggestion-bootstrap')).toBeNull(),
    );
    expect(screen.getByTestId('acp-chat-suggestion-evidence')).toBeInTheDocument();
    expect(screen.getByText('첫 온톨로지가 준비됐어요.')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('acp-chat-suggestion-evidence'));
    expect(screen.getByRole('textbox')).toHaveValue(
      'suggest.evidence.prompt:{"count":1,"first":"capabilities/payments"}',
    );
    expect(screen.getByRole('textbox')).toHaveFocus();
    expect(bridge.sent.filter((message) => message.method === 'session/prompt')).toHaveLength(
      promptsBeforeChoice,
    );
  });

  it('답변 전 바닥에 있으면 긴 답변과 추천 끝까지 따라가되, 직접 위로 올리면 멈춘다', async () => {
    await bootSession({ suggestions: [{ kind: 'explain', params: { count: 12 } }] });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '긴 답변을 줘' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() => expect(screen.getByText('긴 답변을 줘')).toBeInTheDocument());

    const transcript = screen.getByTestId('acp-chat-transcript');
    let contentHeight = 400;
    Object.defineProperties(transcript, {
      clientHeight: { configurable: true, get: () => 200 },
      scrollHeight: {
        configurable: true,
        get: () =>
          contentHeight
          + (screen.queryByTestId('acp-chat-post-turn-suggestions') ? 120 : 0),
      },
      scrollTop: { configurable: true, writable: true, value: 200 },
    });
    fireEvent.scroll(transcript);

    contentHeight = 1_000;
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { text: '아주 긴 첫 조각' },
        },
      },
    });
    await screen.findByText('아주 긴 첫 조각');
    await waitFor(() => expect(transcript.scrollTop).toBe(1_000));

    contentHeight = 1_200;
    replyTo('session/prompt', { stopReason: 'end_turn' });
    await screen.findByTestId('acp-chat-post-turn-suggestions');
    await waitFor(() => expect(transcript.scrollTop).toBe(1_320));

    transcript.scrollTop = 300;
    fireEvent.scroll(transcript);
    contentHeight = 1_400;
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { text: ' 위로 읽는 동안 온 둘째 조각' },
        },
      },
    });
    await screen.findByText('아주 긴 첫 조각 위로 읽는 동안 온 둘째 조각');
    expect(transcript.scrollTop).toBe(300);
  });

  it('사용자가 쓰거나 권한을 검토하는 동안은 추천이 물러난다', async () => {
    await bootSession({ suggestions: [{ kind: 'explain', params: { count: 12 } }] });
    await completeTurn();
    replyTo('session/prompt', { stopReason: 'end_turn' });
    await screen.findByTestId('acp-chat-post-turn-suggestions');

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '내가 직접 쓸 말' } });
    await waitFor(() => expect(screen.queryByTestId('acp-chat-post-turn-suggestions')).toBeNull());

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    await screen.findByTestId('acp-chat-post-turn-suggestions');

    emit(permissionRequest('/somewhere/else/notes.md', 91));
    await screen.findByTestId('acp-permission-card');
    await waitFor(() => expect(screen.queryByTestId('acp-chat-post-turn-suggestions')).toBeNull());
  });

  it('이전 답변을 새 무응답 turn의 다음 행동처럼 붙이지 않는다', async () => {
    await bootSession({ suggestions: [{ kind: 'explain', params: { count: 12 } }] });
    await completeTurn();
    replyTo('session/prompt', { stopReason: 'end_turn' });
    await screen.findByTestId('acp-chat-post-turn-suggestions');

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '두 번째 질문' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() => expect(screen.getByText('두 번째 질문')).toBeInTheDocument());
    replyTo('session/prompt', { stopReason: 'end_turn' });
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'),
    );

    await waitFor(() => expect(screen.queryByTestId('acp-chat-post-turn-suggestions')).toBeNull());
  });

  it('새 turn이 실패하면 이전 추천보다 오류와 복구 경로를 우선한다', async () => {
    await bootSession({ suggestions: [{ kind: 'explain', params: { count: 12 } }] });
    await completeTurn();
    replyTo('session/prompt', { stopReason: 'end_turn' });
    await screen.findByTestId('acp-chat-post-turn-suggestions');

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '두 번째 질문' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    const call = [...bridge.sent].reverse().find((message) => message.method === 'session/prompt');
    emit({ jsonrpc: '2.0', id: call?.id, error: { code: -1, message: 'adapter died' } });

    await screen.findByTestId('acp-chat-error');
    const exiting = screen.getByTestId('acp-chat-post-turn-suggestions');
    expect(exiting).toHaveAttribute('data-surface-state', 'exiting');
    expect(exiting).toHaveAttribute('inert');
    await waitFor(() =>
      expect(screen.queryByTestId('acp-chat-post-turn-suggestions')).toBeNull(),
    );
  });

  it('사용자 질문 없이 온 에이전트 문장을 완료 turn으로 꾸미지 않는다', async () => {
    await bootSession({ suggestions: [{ kind: 'explain', params: { count: 12 } }] });
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { text: '먼저 온 에이전트 문장' },
        },
      },
    });
    await waitFor(() => expect(screen.getByText('먼저 온 에이전트 문장')).toBeInTheDocument());
    expect(screen.queryByTestId('acp-chat-post-turn-suggestions')).toBeNull();
  });

  it('앱 이동 행동은 post-turn에서 빼고 프롬프트 선택은 앱 callback 없이 작성칸으로 보낸다', async () => {
    const onSuggestionAction = vi.fn((suggestion: { kind: string }) => suggestion.kind === 'connectSource');
    await bootSession({
      suggestions: [
        { kind: 'connectSource', params: { count: 1 } },
        { kind: 'explain', params: { count: 12 } },
      ],
      onSuggestionAction,
    });
    await completeTurn();
    replyTo('session/prompt', { stopReason: 'end_turn' });

    await screen.findByTestId('acp-chat-post-turn-suggestions');
    expect(screen.queryByTestId('acp-chat-suggestion-connectSource')).toBeNull();
    fireEvent.click(screen.getByTestId('acp-chat-suggestion-explain'));
    expect(onSuggestionAction).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveValue('suggest.explain.prompt:{"count":12}');
    expect(screen.getByRole('textbox')).toHaveFocus();
  });
});

describe('답변 속 노드 이름 — 지도와 잇는다', () => {
  /**
   * What the model (`link-slugs.ts`) picks out is pinned by its own test. What is
   * pinned here is **whether the marks really appear inside the answer, and whether
   * hovering sends that name out to the map**.
   */
  async function agentSays(text: string, extra: Record<string, unknown> = {}) {
    const hovered: (string | null)[] = [];
    render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Agent"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
        knownSlugs={new Set(['capabilities/invoice', 'domains/payment'])}
        onHoverSlug={(s) => hovered.push(s)}
        {...extra}
      />,
    );
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    replyTo('initialize', { protocolVersion: 1 });
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
    replyTo('session/new', { sessionId: 's-1' });
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'),
    );
    // In the real order — a person asks and the agent answers.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '봐줘' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() => expect(screen.getByText('봐줘')).toBeInTheDocument());
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { update: { sessionUpdate: 'agent_message_chunk', content: { text } } },
    });
    // The live bubble reveals through requestAnimationFrame. Wait for the full
    // sentence before returning so a test never holds a slug span that the next
    // reveal frame replaces between lookup and pointer dispatch.
    await waitFor(
      () => expect(document.querySelector('[data-acp-entry="agent"]')).toHaveTextContent(text),
      { timeout: 5_000 },
    );
    return hovered;
  }

  it('아는 이름에 표시가 달리고, 올리면 그 이름이 나간다', async () => {
    const hovered = await agentSays('먼저 capabilities/invoice 를 봤어요.');

    const mark = await screen.findByTestId('acp-chat-slug');
    expect(mark.getAttribute('data-slug')).toBe('capabilities/invoice');

    fireEvent.pointerEnter(mark);
    expect(hovered.at(-1), '마우스를 올렸는데 지도에 아무것도 안 나갔다').toBe(
      'capabilities/invoice',
    );
    fireEvent.pointerLeave(mark);
    // It must be cleared on leave — otherwise the highlight stays on.
    expect(hovered.at(-1), '마우스가 벗어났는데 강조가 안 꺼진다').toBeNull();
  });

  it('모르는 이름에는 표시를 달지 않는다 — 눌러도 아무 데도 안 가는 링크를 만들지 않는다', async () => {
    await agentSays('src/features/acp-session/model/x.ts 를 고쳤어요.');
    await waitFor(() => expect(document.querySelectorAll('[data-acp-entry="agent"]').length).toBe(1));
    expect(screen.queryAllByTestId('acp-chat-slug')).toHaveLength(0);
  });

  it('아는 이름을 안 넘기면 아무것도 안 단다 — 볼트를 모르면 짐작하지 않는다', async () => {
    await agentSays('먼저 capabilities/invoice 를 봤어요.', { knownSlugs: undefined });
    await waitFor(() => expect(document.querySelectorAll('[data-acp-entry="agent"]').length).toBe(1));
    expect(screen.queryAllByTestId('acp-chat-slug')).toHaveLength(0);
  });
});

describe('도구 줄 — 어느 노드를 만졌는지 말한다', () => {
  /**
   * It used to say only "Read a concept" without naming the target.
   * The value was arriving in `rawInput` and the session was discarding it.
   */
  it('도구가 만진 노드를 적고, 올리면 지도로 나간다', async () => {
    const hovered: (string | null)[] = [];
    render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Agent"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
        knownSlugs={new Set(['capabilities/invoice'])}
        onHoverSlug={(s) => hovered.push(s)}
      />,
    );
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    replyTo('initialize', { protocolVersion: 1 });
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
    replyTo('session/new', { sessionId: 's-1' });
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-1',
          title: 'mcp__atlas-vault__get_concept',
          kind: 'read',
          status: 'pending',
          rawInput: { slug: 'capabilities/invoice' },
        },
      },
    });

    const mark = await screen.findByTestId('acp-chat-slug');
    expect(mark.getAttribute('data-slug')).toBe('capabilities/invoice');
    fireEvent.pointerEnter(mark);
    expect(hovered.at(-1)).toBe('capabilities/invoice');
  });

  it('모르는 노드를 만지면 적지 않는다 — 없는 것을 가리키지 않는다', async () => {
    render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Agent"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
        knownSlugs={new Set(['capabilities/invoice'])}
      />,
    );
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    replyTo('initialize', { protocolVersion: 1 });
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
    replyTo('session/new', { sessionId: 's-1' });
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-2',
          title: 'mcp__atlas-vault__get_concept',
          kind: 'read',
          status: 'pending',
          rawInput: { slug: 'capabilities/does-not-exist' },
        },
      },
    });
    await waitFor(() =>
      expect(document.querySelectorAll('[data-acp-entry="tool"]').length).toBe(1),
    );
    expect(screen.queryAllByTestId('acp-chat-slug')).toHaveLength(0);
  });
});

describe('도구 호출 — 지도를 정확한 대상으로 움직인다', () => {
  it('get_concept 입력을 실재 노드 포커스로 한 번만 전달한다', async () => {
    const onMapIntent = vi.fn();
    await bootSession({
      knownSlugs: new Set(['capabilities/order']),
      onMapIntent,
    });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '주문 찾아줘' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));

    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'focus-1',
          title: 'mcp__atlas-vault__get_concept',
          kind: 'read',
          status: 'pending',
          rawInput: { slug: 'capabilities/order' },
        },
      },
    });

    await waitFor(() =>
      expect(onMapIntent).toHaveBeenCalledWith({
        kind: 'focus',
        slug: 'capabilities/order',
        toolCallId: 'focus-1',
      }),
    );
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'focus-1',
          status: 'completed',
        },
      },
    });
    await waitFor(() => expect(onMapIntent).toHaveBeenCalledTimes(1));
  });

  it('find_path의 두 끝점을 경로 의도로 전달하고 답변 문장은 해석하지 않는다', async () => {
    const onMapIntent = vi.fn();
    await bootSession({
      knownSlugs: new Set(['capabilities/cart', 'capabilities/order']),
      onMapIntent,
    });
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '장바구니와 주문 연결 보여줘' },
    });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { text: 'capabilities/cart → capabilities/order 경로입니다.' },
        },
      },
    });
    expect(onMapIntent).not.toHaveBeenCalled();

    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'path-1',
          title: 'mcp__atlas-vault__find_path',
          kind: 'read',
          status: 'pending',
          rawInput: { from: 'capabilities/cart', to: 'capabilities/order' },
        },
      },
    });

    await waitFor(() =>
      expect(onMapIntent).toHaveBeenCalledWith({
        kind: 'path',
        from: 'capabilities/cart',
        to: 'capabilities/order',
        toolCallId: 'path-1',
      }),
    );
  });
});

describe('Ontology DNA 발표 — 같은 ACP turn을 장면으로 본다', () => {
  it('지도 callback 없이도 분석 안에서 열리고 지도 이동은 별도 선택으로 남는다', async () => {
    const onDraftPresenceChange = vi.fn();
    const onPresentationOpenMap = vi.fn();
    const slugs = ['ontology-atlas', 'domains/agent-integration', 'capabilities/mcp-server'];
    await bootSession({
      contextLabel: '분석 · 흐름',
      knownSlugs: new Set(slugs),
      knownRelations: new Set(),
      presentationIntent: 'business-flow',
      presentationRequest: '분석 안에서 설명해줘',
      onDraftPresenceChange,
      onPresentationOpenMap,
    });
    expect(screen.getByTestId('acp-chat-context')).toHaveTextContent('분석 · 흐름');
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '분석 안에서 설명해줘' },
    });
    await waitFor(() => expect(onDraftPresenceChange).toHaveBeenLastCalledWith(true));
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() => expect(onDraftPresenceChange).toHaveBeenLastCalledWith(false));

    act(() => {
      slugs.forEach((slug, index) => emit({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          update: {
            sessionUpdate: 'tool_call',
            toolCallId: `analysis-read-${index + 1}`,
            title: 'mcp__atlas-vault__get_concept',
            kind: 'read',
            status: 'completed',
            rawInput: { slug, body: 'full' },
          },
        },
      }));
      emit({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: {
              text: [
                '### 제품',
                'ontology-atlas 설명.',
                '',
                '### 책임',
                'domains/agent-integration 설명.',
                '',
                '### 구현',
                'capabilities/mcp-server 설명.',
              ].join('\n'),
            },
          },
        },
      });
    });
    act(() => replyTo('session/prompt', { stopReason: 'end_turn' }));

    fireEvent.click(await screen.findByTestId('acp-presentation-open'));
    const presentation = await screen.findByTestId('acp-presentation');
    expect(within(presentation).getByTestId('acp-presentation-citation').tagName).toBe('SPAN');
    fireEvent.click(within(presentation).getByTestId('acp-presentation-open-map'));
    expect(onPresentationOpenMap).toHaveBeenCalledWith('ontology-atlas', 'analysis-read-1');
  });

  it('source-hidden full reads가 끝난 답변만 발표로 열고 장면마다 같은 노드를 포커스한다', async () => {
    const onMapIntent = vi.fn();
    const onPresentationVisibilityChange = vi.fn();
    const slugs = [
      'ontology-atlas',
      'domains/agent-integration',
      'capabilities/mcp-server',
    ];
    await bootSession({
      knownSlugs: new Set(slugs),
      knownRelations: new Set(),
      presentationIntent: 'business-flow',
      presentationRequest: 'DNA를 설명해줘',
      onPresentationVisibilityChange,
      onMapIntent,
    });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'DNA를 설명해줘' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));

    act(() => {
      slugs.forEach((slug, index) => {
        emit({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            update: {
              sessionUpdate: 'tool_call',
              toolCallId: `read-${index + 1}`,
              title: 'mcp__atlas-vault__get_concept',
              kind: 'read',
              status: 'completed',
              rawInput: { slug, body: 'full' },
            },
          },
        });
      });
      emit({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: {
              text: [
                '### 왜 존재하나요?',
                'ontology-atlas 는 제품 의미를 설명합니다.',
                '',
                '### 누가 책임지나요?',
                'domains/agent-integration 이 연결 경계를 책임집니다.',
                '',
                '### 어떻게 구현되나요?',
                'capabilities/mcp-server 가 구현하며 완전성은 unknown 입니다.',
              ].join('\n'),
            },
          },
        },
      });
    });
    act(() => replyTo('session/prompt', { stopReason: 'end_turn' }));

    const open = await screen.findByTestId('acp-presentation-open');
    fireEvent.click(open);
    const presentation = screen.getByTestId('acp-presentation');
    expect(presentation).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(presentation));
    expect(onPresentationVisibilityChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByTestId('acp-chat-transcript')).toHaveAttribute('inert');
    expect(within(presentation).getByText('왜 존재하나요?')).toBeInTheDocument();
    expect(onMapIntent).toHaveBeenLastCalledWith({
      kind: 'focus',
      slug: 'ontology-atlas',
      toolCallId: 'read-1',
    });

    fireEvent.keyDown(presentation, { key: 'ArrowRight' });
    expect(within(presentation).getByText('누가 책임지나요?')).toBeInTheDocument();
    expect(onMapIntent).toHaveBeenLastCalledWith({
      kind: 'focus',
      slug: 'domains/agent-integration',
      toolCallId: 'read-2',
    });

    fireEvent.click(within(presentation).getByRole('button', { name: 'backToChat' }));
    await waitFor(() => expect(screen.queryByTestId('acp-presentation')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(open));
    expect(onPresentationVisibilityChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(open);
    const reopened = await screen.findByTestId('acp-presentation');
    fireEvent.keyDown(reopened, { key: 'ArrowRight' });
    fireEvent.click(screen.getByTestId('acp-presentation-ask'));
    await waitFor(() => expect(screen.queryByTestId('acp-presentation')).toBeNull());
    const composer = screen.getByRole('textbox');
    expect(composer).toHaveValue(
      'presentation.askPrompt:{"title":"누가 책임지나요?"}',
    );
    await waitFor(() => expect(document.activeElement).toBe(composer));
    expect(onPresentationVisibilityChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByTestId('acp-chat-send'));
    act(() => {
      emit({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { text: '해당 장면을 같은 근거로 더 설명했습니다.' },
          },
        },
      });
    });
    act(() => replyTo('session/prompt', { stopReason: 'end_turn' }));
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'),
    );
    await waitFor(() => expect(screen.queryByTestId('acp-presentation-open')).toBeNull());
    expect(screen.queryByTestId('acp-presentation-blocked')).toBeNull();
  });

  it('비-Atlas 도구가 섞인 turn은 이름 붙은 상태 설명으로 막고 발표 문을 열지 않는다', async () => {
    await bootSession({
      knownSlugs: new Set(['ontology-atlas']),
      knownRelations: new Set(),
      presentationIntent: 'business-flow',
      presentationRequest: '정확한 Flow 요청',
      onMapIntent: vi.fn(),
    });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '정확한 Flow 요청' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));

    act(() => {
      emit({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          update: {
            sessionUpdate: 'tool_call',
            toolCallId: 'source-read',
            title: 'Read src/secret.ts',
            kind: 'read',
            status: 'completed',
            rawInput: { file_path: 'src/secret.ts' },
          },
        },
      });
      emit({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          update: {
            sessionUpdate: 'tool_call',
            toolCallId: 'atlas-read',
            title: 'mcp__atlas-vault__get_concept',
            kind: 'read',
            status: 'completed',
            rawInput: { slug: 'ontology-atlas', body: 'full' },
          },
        },
      });
      emit({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: {
              text: [
                '### 1',
                'ontology-atlas 설명.',
                '',
                '### 2',
                'ontology-atlas 설명.',
                '',
                '### 3',
                'ontology-atlas 설명.',
              ].join('\n'),
            },
          },
        },
      });
    });
    act(() => replyTo('session/prompt', { stopReason: 'end_turn' }));

    const blocked = await screen.findByTestId('acp-presentation-blocked');
    expect(blocked).toHaveAttribute('role', 'status');
    expect(blocked).toHaveTextContent('presentation.blockReason.source_hidden_unproven');
    expect(screen.queryByTestId('acp-presentation-open')).toBeNull();
  });
});

describe('답하다 죽은 것과 다 끝난 것은 다른 말이다', () => {
  /**
   * Either way, it used to read only "Finished" in a small chip. Dying halfway
   * through an answer looked identical to a clean finish, so the user assumed that was
   * the whole answer.
   */
  it('차례가 도는 중에 죽으면 그렇게 말한다', async () => {
    await bootSession();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '봐줘' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'thinking'),
    );

    bridge.exit?.(1);

    /*
     * ⚠️ The final state is `error`, not `exited` — the in-flight call is rejected
     * alongside and that side wins (measured). So it is **not decided by state**; it
     * checks whether the screen said so. What matters to the user is not the state's
     * name but the sentence 「what you received is all of it」.
     */
    await waitFor(() => {
      const said = [...document.querySelectorAll('[data-acp-entry="notice"]')].map((n) =>
        n.getAttribute('data-notice'),
      );
      expect(said, '답하다 죽었는데 화면이 아무 말도 안 한다').toContain('died-mid-turn');
    });
  });

  it('names the mode the tool moved this conversation into', async () => {
    /*
     * The sentence has to point at something the person can find in the tool itself, so the mode id
     * travels into the copy verbatim. Without the mode in the interpolation the line reads as a
     * general warning and the reader has no way to tell which mode to leave.
     *
     * `mcpServers` here carries no `OATLAS_WRITE_CONSENT`, which is the real shape for a
     * config-isolated runtime — so the variant without the server-checkpoint promise is the one
     * that must render.
     */
    render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Code"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
      />,
    );
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    replyTo('initialize', { protocolVersion: 1 });
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
    replyTo('session/new', {
      sessionId: 's-1',
      modes: {
        currentModeId: 'acceptEdits',
        availableModes: [
          { id: 'default', name: 'Manual', _meta: { kind: 'standard' } },
          { id: 'acceptEdits', name: 'Accept edits', _meta: { kind: 'standard' } },
        ],
      },
    });

    await waitFor(() => {
      const said = [...document.querySelectorAll('[data-acp-entry="notice"]')].map((n) =>
        n.getAttribute('data-notice'),
      );
      expect(said, 'the conversation opened without the gate and said nothing').toContain(
        'mode-moved',
      );
    });
    expect(screen.getByText('notice.modeMoved:{"mode":"acceptEdits"}')).toBeInTheDocument();
    // The server-checkpoint promise is not made where the checkpoint is switched off.
    expect(screen.queryByText(/notice\.modeMovedServerGate/)).toBeNull();
    // And `gate-off` keeps its own job rather than being borrowed for this.
    expect(screen.queryByText('notice.gateOff')).toBeNull();
  });

  it('차례가 안 도는 중에 죽으면 그 말은 안 한다 — 없는 사건을 지어내지 않는다', async () => {
    await bootSession();
    bridge.exit?.(0);
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'exited'),
    );
    const said = [...document.querySelectorAll('[data-acp-entry="notice"]')].map((n) =>
      n.getAttribute('data-notice'),
    );
    expect(said).not.toContain('died-mid-turn');
  });
});

/**
 * For the in-app agent to **register its own name in the vault**, the screen has to
 * know "a turn is running right now" (owner instruction, 2026-08-17).
 *
 * ⚠️ **Not for the whole time a session is open.** While the heartbeat is fresh the
 * screen lights the "Agent Active" indicator on the rail. If that
 * lights when nothing was asked, the screen is stating something that did not happen,
 * and this panel already keeps that discipline (*"If you mark it 'Read' before sending …"* —
 * marking it "read" before sending …).
 */
describe('대화 패널 — 차례가 도는 동안만 알린다', () => {
  it('보내면 켜지고, 답이 끝나면 꺼진다', async () => {
    const seen: Array<{ state: string; summary: string | null } | null> = [];
    render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Code"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
        onTurnActivityChange={(activity) => seen.push(activity)}
      />,
    );
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    replyTo('initialize', { protocolVersion: 1 });
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
    replyTo('session/new', { sessionId: 's-1' });
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'),
    );

    // Nothing has been asked yet — it must never have lit.
    expect(seen.some(Boolean), '세션만 열었는데 활동 중이라고 말한다').toBe(false);

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '안녕' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() => expect(seen.at(-1)).toMatchObject({ state: 'planning', summary: '안녕' }));

    const call = [...bridge.sent].reverse().find((m) => m.method === 'session/prompt');
    emit({ jsonrpc: '2.0', id: call?.id, result: { stopReason: 'end_turn' } });
    await waitFor(() => expect(seen.at(-1)).toBeNull());
  });

  it('패널이 사라지면 꺼 준다 — 켠 채로 남기지 않는다', async () => {
    const seen: Array<{ state: string } | null> = [];
    const view = render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Code"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
        onTurnActivityChange={(activity) => seen.push(activity)}
      />,
    );
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    view.unmount();
    expect(seen.at(-1)).toBeNull();
  });
});

/**
 * The `/` menu has to be **selectable** (three owner reports, 2026-08-17):
 * "Keyboard navigation doesn't work" · "No hover effect when hovering with the mouse,
 * so you can't tell where you are" · "Clicking the background should close it but doesn't."
 */
describe('작성 칸 — `/` 메뉴', () => {
  async function openMenu() {
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 's-1',
        update: {
          sessionUpdate: 'available_commands_update',
          availableCommands: [
            { name: 'alpha', description: '첫째' },
            { name: 'beta', description: '둘째' },
          ],
        },
      },
    });
    const box = screen.getAllByRole('textbox')[0];
    fireEvent.change(box, { target: { value: '/' } });
    await screen.findByTestId('acp-chat-slash-menu');
    return box;
  }

  it('온 명령만 보여 준다', async () => {
    await openMenu();
    const menu = screen.getByTestId('acp-chat-slash-menu');
    expect(menu.textContent).toContain('/alpha');
    expect(menu.textContent).toContain('/beta');
  });

  it('아무것도 안 오면 `/` 를 쳐도 안 열린다 — 없는 기능을 지어내지 않는다', async () => {
    await bootSession();
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '/' } });
    expect(screen.queryByTestId('acp-chat-slash-menu')).toBeNull();
  });

  it('키보드로 옮기고 Enter 로 고른다', async () => {
    const box = await openMenu();
    const selected = () =>
      [...screen.getByTestId('acp-chat-slash-menu').querySelectorAll('[role="option"]')].findIndex(
        (el) => el.getAttribute('aria-selected') === 'true',
      );
    expect(selected()).toBe(0);
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(selected(), '아래로 못 옮긴다').toBe(1);
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(selected()).toBe(0);
    fireEvent.keyDown(box, { key: 'Enter' });
    expect((box as HTMLTextAreaElement).value).toBe('/alpha ');
  });

  it('짚은 줄이 화면에 표시된다 — 안 그러면 어디 있는지 모른다', async () => {
    await openMenu();
    const options = screen.getByTestId('acp-chat-slash-menu').querySelectorAll('[role="option"]');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(options[1].getAttribute('aria-selected')).toBe('false');
  });

  it('바깥을 누르면 닫힌다', async () => {
    await openMenu();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByTestId('acp-chat-slash-menu')).toBeNull());
  });

  it('닫은 뒤 다시 치면 열린다 — 세션 내내 잠기지 않는다', async () => {
    const box = await openMenu();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByTestId('acp-chat-slash-menu')).toBeNull());
    fireEvent.change(box, { target: { value: '/a' } });
    await screen.findByTestId('acp-chat-slash-menu');
  });

  it('Esc 로도 닫힌다', async () => {
    const box = await openMenu();
    fireEvent.keyDown(box, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('acp-chat-slash-menu')).toBeNull());
  });
});
