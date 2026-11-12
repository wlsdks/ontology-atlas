import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TURN_SILENCE_LIMIT_MS } from '@/features/acp-session/model/turn-liveness';
import { READ_ONLY_TOOL_INSTRUCTION } from '@/features/acp-session';
import type { TaskBaselineCaptureResult } from '@/features/acp-session';

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
    /** Notices from the Rust side — the first-download indicator arrives this way. */
    notice: null as ((message: string) => void) | null,
    /** stderr diagnostics — the clues to a corrupt npx cache arrive this way (measured). */
    stderr: null as ((line: string) => void) | null,
    activeSessionId: null as string | null,
    /** How many times the panel asked for an agent process (`acp_start`). */
    starts: 0,
    /** `acp_start` never settles — an agent launch that hangs. */
    hangStart: false,
  };
  return state;
});

vi.mock('@/shared/lib/agent-chat/tauri-acp', () => ({
  isAcpBridgeAvailable: () => bridge.available,
  startAcpSession: () => {
    bridge.starts += 1;
    return bridge.hangStart ? new Promise<string>(() => {}) : Promise.resolve('acp-1-999');
  },
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
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  // The permission card reads a write guard's epoch through the locale's own date format. A mock
  // missing this throws inside the card, so every case that renders one fails on a blank body
  // rather than on what it was asserting.
  useFormatter: () => ({
    dateTime: (value: Date) => value.toISOString(),
  }),
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import {
  AcpChatPanel,
  type AcpOntologyRelationPreview,
} from './AcpChatPanel';
import type { AcpWorkReceipt } from '@/shared/lib/meaning-transition/acp-work-receipt';

/** The agent sends one line. */
function emit(payload: unknown) {
  const message = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown> : null;
  const params = message?.params && typeof message.params === 'object' && !Array.isArray(message.params)
    ? message.params as Record<string, unknown> : null;
  if (message?.method === 'session/update' && params
    && !Object.prototype.hasOwnProperty.call(params, 'sessionId') && bridge.activeSessionId) {
    bridge.listener?.(JSON.stringify({ ...message, params: { ...params, sessionId: bridge.activeSessionId } }));
    return;
  }
  bridge.listener?.(JSON.stringify(payload));
}

/** Answer the last request we sent with that method. */
function replyTo(method: string, result: unknown) {
  const call = [...bridge.sent].reverse().find((m) => m.method === method);
  if ((method === 'session/new' || method === 'session/load') && result && typeof result === 'object'
    && !Array.isArray(result) && typeof (result as Record<string, unknown>).sessionId === 'string') {
    bridge.activeSessionId = (result as Record<string, unknown>).sessionId as string;
  }
  emit({ jsonrpc: '2.0', id: call?.id, result });
}

/** `mcpServers` must be passed: vault tool auto-allow switches on only when it is wired in. */
async function bootSession(
  props: Partial<ComponentProps<typeof AcpChatPanel>> = {},
  modes?: Record<string, unknown>,
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
  replyTo('session/new', { sessionId: 's-1', ...(modes ? {modes} : {}) });
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

async function startUserTurn(text: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  fireEvent.click(screen.getByTestId('acp-chat-send'));
  await waitFor(() =>
    expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'thinking'),
  );
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
  bridge.activeSessionId = null;
  bridge.starts = 0;
  bridge.hangStart = false;
});

describe('chat panel: draws only what happened', () => {
  it('renders an empty panel and a streamed turn without newer backward-search array methods', async () => {
    const last = Object.getOwnPropertyDescriptor(Array.prototype, 'findLast')!;
    const lastIndex = Object.getOwnPropertyDescriptor(Array.prototype, 'findLastIndex')!;
    Object.defineProperty(Array.prototype, 'findLast', { ...last, value: undefined });
    Object.defineProperty(Array.prototype, 'findLastIndex', { ...lastIndex, value: undefined });
    try {
      await bootSession();
      await startUserTurn('A legacy-compatible request');
      act(() => {
        emit({ jsonrpc: '2.0', method: 'session/update', params: { update: { sessionUpdate: 'tool_call', toolCallId: 'read-1', title: 'Read node', kind: 'read', status: 'completed' } } });
        emit({ jsonrpc: '2.0', method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Legacy-compatible answer.' } } } });
      });
      expect(await screen.findByText('Legacy-compatible answer.')).toBeInTheDocument();
      act(() => replyTo('session/prompt', { stopReason: 'end_turn' }));
      await waitFor(() => expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'));
    } finally {
      Object.defineProperty(Array.prototype, 'findLast', last);
      Object.defineProperty(Array.prototype, 'findLastIndex', lastIndex);
    }
  });

  it('forwards and awaits task baseline capture before prompting the agent', async () => {
    let release!: (value: TaskBaselineCaptureResult) => void;
    const captureTaskBaseline = vi.fn(() => new Promise<TaskBaselineCaptureResult>((resolve) => { release = resolve; }));
    await bootSession({ captureTaskBaseline });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Review this task' } });
    fireEvent.click(screen.getByRole('button', { name: 'send' }));
    await waitFor(() => expect(captureTaskBaseline).toHaveBeenCalledTimes(1));
    expect(bridge.sent.some((message) => message.method === 'session/prompt')).toBe(false);
    release({ status: 'unavailable', capturedAt: 'now', vaultId: '/vault', scope: { requestedSlugs: [], capturedSlugs: [] }, counts: { requested: 0, captured: 0, bytes: 0 }, sourceUnavailableReasons: [], reasons: ['empty_scope'], documents: [], meaningBasis: null, sourceBasis: null });
    await waitFor(() => expect(bridge.sent.some((message) => message.method === 'session/prompt')).toBe(true));
  });
  it('a work mode that was never measured does not look safe', async () => {
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

  it('the model and work mode do not become a fixed width that collides with the empty box or the stop button', async () => {
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
    /*
     * Not `flex-1`: a `basis-0 flex-1` slot is served last, so the runtime name takes its full width
     * and clips the mode's word. Content-sized serves the control first; `min-w-0` lets it yield to send.
     */
    expect(choices).toHaveClass('flex', 'min-w-0');
    expect(choices).not.toHaveClass('flex-1');
    expect(choices).not.toHaveClass('shrink-0');
    // `className` lands on the Select's own wrapper; the trigger inside it is `w-full`.
    // A quiet picker is content-sized with a floor, never an equal slot that could swell.
    const modeWrapper = screen.getByTestId('acp-chat-mode').closest('.relative')!;
    expect(modeWrapper.className).toContain('min-w-[3rem]');
    expect(modeWrapper.className).toContain('shrink');
    expect(modeWrapper.className).toContain('max-w-[16rem]');
    /*
     * The name is the elastic one, and below the width that holds both it leaves. The class
     * carries both halves of that rule; which width it lands at is measured in the rendered
     * sweep, not here — jsdom has no layout.
     */
    const runtimeName = screen.getByTestId('acp-chat-runtime-label');
    expect(runtimeName.className).toContain('shrink-[99]');
    expect(runtimeName.className).toContain('@min-[286px]/composer:inline');
    expect(screen.queryByTestId('acp-chat-runtime')).toBeNull();
    expect(screen.getByTestId('acp-chat-runtime-label')).toHaveTextContent('Claude Code · GPT-5.6-Sol (low)');
    expect(screen.getByTestId('acp-chat-mode')).toHaveTextContent('mode');

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '계속해 줘' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() => expect(screen.getByTestId('acp-chat-stop')).toBeInTheDocument());
    expect(screen.getByTestId('acp-chat-choices')).toBeInTheDocument();
  });

  /** The whole request stays one disclosure away; the transcript opens on the readable sentence only. */
  it('a request the app built stands as only a readable sentence, and the full text stays once expanded', async () => {
    await bootSession();
    const composed = [
      '이 온톨로지의 뜻과 경계를 검토해 줘.',
      'Scope: {"projectSlug":"storefront"}.',
      'Keep the answer useful as plain Markdown.',
    ].join('\n');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: composed } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));

    const bubble = await waitFor(() => document.querySelector('[data-acp-entry="user"]')!);
    expect(bubble).toHaveAttribute('data-user-request', 'app-composed');
    expect(bubble).toHaveTextContent('이 온톨로지의 뜻과 경계를 검토해 줘.');
    expect(bubble).not.toHaveTextContent('Scope: {"projectSlug"');
    // Verbatim and in one piece behind the disclosure, which stands outside the quotation.
    const fold = screen.getByTestId('acp-chat-request-full');
    expect(bubble.contains(fold)).toBe(false);
    fireEvent.click(fold);
    expect(document.getElementById(fold.getAttribute('aria-controls')!)).toHaveTextContent('Scope: {"projectSlug":"storefront"}.');
  });

  it('line breaks a person typed stay line breaks in the bubble', async () => {
    await bootSession();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '첫째 줄\n둘째 줄' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    const bubble = await waitFor(() => document.querySelector('[data-acp-entry="user"]')!);
    expect(bubble).toHaveAttribute('data-user-request', 'typed');
    expect(screen.queryByTestId('acp-chat-request-full')).toBeNull();
    expect(bubble.className).toContain('whitespace-pre-wrap');
  });

  it('once the session stands it becomes ready, and what was sent and received each stay', async () => {
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

  /*
   * The answer column is 260px at the dock floor, so a long command sits behind `overflow-x`
   * and needs a copy control.
   */
  it('a command in an answer can be taken whole, even if it looks cut off', async () => {
    const written: string[] = [];
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => { written.push(text); return Promise.resolve(); } },
    });
    await bootSession();
    const command = 'pnpm atlas compile --page wiki/architecture.md --force --locale ko';
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: { sessionUpdate: 'agent_message_chunk', content: { text: `Run it:\n\n\`\`\`bash\n${command}\n\`\`\`` } },
      },
    });

    const chip = await screen.findByTestId('acp-chat-code-copy');
    fireEvent.click(chip);
    // What is copied is the command as drawn, not the markdown fence around it.
    await waitFor(() => expect(written).toEqual([`${command}\n`]));
    await waitFor(() => expect(chip.textContent).toBe('codeCopied'));
  });

  it('a table gets no copy chip, because it is for reading and not a command', async () => {
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: { sessionUpdate: 'agent_message_chunk', content: { text: '| 항목 | 값 |\n| --- | --- |\n| 소스 | 없음 |' } },
      },
    });
    await screen.findByTestId('acp-chat-markdown-table');
    expect(screen.queryByTestId('acp-chat-code-copy')).toBeNull();
  });

  it('draws the GFM table from the agent as a table with cell borders and horizontal scroll even in a narrow panel', async () => {
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

  it('draws thinking and speech as different things, so the intermediate process is not read as the conclusion', async () => {
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

  it('a call waiting on the person stays still and says so, while a running one sweeps', async () => {
    bridge.verdict = 'allow-inside-vault';
    await bootSession();
    await startUserTurn('go');
    for (const [toolCallId, title, kind] of [
      ['tc-run', 'mcp__atlas-vault__list_concepts', 'read'],
      ['tc1', 'Write /vault/notes.md', 'edit'],
    ]) {
      emit({
        jsonrpc: '2.0',
        method: 'session/update',
        params: { update: { sessionUpdate: 'tool_call', toolCallId, title, kind, status: 'pending' } },
      });
    }
    emit(permissionRequest('/vault/notes.md', 77, 'edit'));
    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());

    const rows = [...document.querySelectorAll<HTMLElement>('[data-acp-entry="tool"]')];
    const waiting = rows.find((row) => row.getAttribute('data-tool-phase') === 'awaiting');
    const running = rows.find((row) => row.getAttribute('data-tool-phase') === 'running');
    expect(waiting).toBeDefined();
    expect(running).toBeDefined();
    expect(waiting!.querySelectorAll('.acp-working-shimmer')).toHaveLength(0);
    expect(waiting!.querySelector('[data-testid="acp-chat-tool-outcome"]')).toHaveTextContent('status.awaiting');
    expect(running!.querySelector('[data-tool-label-text]')).toHaveClass('acp-working-shimmer');
    // The composer agrees: waiting on the person, not working.
    expect(screen.getByTestId('acp-status-words')).not.toHaveClass('acp-working-shimmer');
  });

  it('an active work group sweeps its title, and a finished one does not', async () => {
    await bootSession();
    await startUserTurn('go');
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { update: { sessionUpdate: 'agent_thought_chunk', content: { text: 'planning' } } },
    });
    await waitFor(() =>
      expect(document.querySelector('[data-acp-entry="work-group"]')).toHaveAttribute('data-work-active', 'true'),
    );
    const title = () => screen.getByTestId('acp-chat-work-group').querySelector('.acp-working-shimmer');
    expect(title()).toHaveTextContent('workGroupActive');

    act(() => replyTo('session/prompt', { stopReason: 'end_turn' }));
    await waitFor(() =>
      expect(document.querySelector('[data-acp-entry="work-group"]')).toHaveAttribute('data-work-active', 'false'),
    );
    expect(title()).toBeNull();
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
    // A tool call only ever arrives inside a live turn, and a row reads 「running」 only there.
    await startUserTurn('go');
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
    // A tool call only ever arrives inside a live turn, and a row reads 「running」 only there.
    await startUserTurn('go');
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

  it('sweeps the words of a running call and stills them once it lands', async () => {
    await bootSession();
    await startUserTurn('go');
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-sweep',
          title: 'mcp__atlas-vault__list_concepts',
          kind: 'read',
          status: 'in_progress',
        },
      },
    });
    await waitFor(() =>
      expect(document.querySelector('[data-acp-entry="tool"] [data-tool-running]')).toBeInTheDocument(),
    );
    const row = () => document.querySelector('[data-acp-entry="tool"]')!;
    expect(row().querySelector('[data-tool-label-text]')).toHaveClass('acp-working-shimmer');
    expect(screen.getByTestId('acp-chat-tool-outcome')).toHaveClass('acp-working-shimmer');
    // The composer's status is the same live state, said in the same way.
    expect(screen.getByTestId('acp-status-words')).toHaveClass('acp-working-shimmer');

    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tc-sweep',
          status: 'completed',
          rawOutput: [{ type: 'text', text: JSON.stringify({ total: 3 }) }],
        },
      },
    });
    await waitFor(() => expect(row()).toHaveAttribute('data-tool-outcome', '3'));
    expect(row().querySelectorAll('.acp-working-shimmer')).toHaveLength(0);

    act(() => replyTo('session/prompt', { stopReason: 'end_turn' }));
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'),
    );
    expect(screen.getByTestId('acp-status-words')).not.toHaveClass('acp-working-shimmer');
  });

  /**
   * A cancelled adapter simply stops reporting, so a row left open by Stop must not keep claiming
   * it is running.
   */
  it('an open tool line in a stopped turn does not insist it is still running', async () => {
    await bootSession();
    await startUserTurn('go');
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-open',
          title: 'mcp__atlas-vault__list_concepts',
          kind: 'read',
          status: 'pending',
        },
      },
    });
    await waitFor(() =>
      expect(document.querySelector('[data-acp-entry="tool"] [data-tool-running]')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId('acp-chat-stop'));
    act(() => replyTo('session/prompt', { stopReason: 'cancelled' }));
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'),
    );
    const row = document.querySelector('[data-acp-entry="tool"]')!;
    expect(row.querySelector('[data-tool-running]')).toBeNull();
    expect(row.getAttribute('data-tool-outcome')).toBe('unfinished');
    // Translations are stubbed to their keys here, so the row's own word is the assertion.
    expect(row).toHaveTextContent('toolOutcome.unfinished');
    expect(row).not.toHaveTextContent('toolOutcome.running');
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
     * The seam replaces the run's rule: the row is pulled out by the run's border plus padding and pays
     * the same padding back, so the red hairline lands on the grey one.
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

  /* Only repetition collapses: identical calls are one fact stated several times; the row says how many. */
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

describe('chat panel: the permission card really blocks', () => {
  /** An MCP tool call has no `file_path`; the absent-input case needs its own test. */
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

  it('sends a single relation change proposal to the map at once and links it in solid steps from approval to tool completion', async () => {
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

    // Wait for the card itself: `previews` updates before the permission card mounts on a later render.
    fireEvent.click(await screen.findByTestId('acp-permission-allow'));
    await waitFor(() =>
      expect(previews.at(-1)).toEqual({
        sourceSlug: 'capabilities/contextual-editing',
        targetSlug: 'domains/graph-modeling',
        relationType: 'depends_on',
        phase: 'committing',
      }),
    );
    /*
     * The claim is an order, not a duration: the answer must not be sent until the commit motion is
     * entered, so an answer still absent here proves the guard held.
     */
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

  it('rejecting a relation change withdraws the map proposal at once, without solid steps', async () => {
    const previews: Array<AcpOntologyRelationPreview | null> = [];
    await bootSession({
      onOntologyRelationPreviewChange: (preview) => previews.push(preview),
    });
    await startUserTurn('관계 변경을 검토해줘');
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

  it('rejects the old proposal and preserves an unrelated draft when preparing a correction without sending it', async () => {
    await bootSession();
    await startUserTurn('Keep the refund exception');
    emit(mcpPermissionRequest('mcp__atlas-vault__patch_concept', 191, {
      slug: 'capabilities/refund', expected_mtime: 100, body: 'Incorrect unconditional refund',
    }));
    await screen.findByTestId('task-review-correct');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My unrelated draft' } });
    const promptsBefore = bridge.sent.filter((row) => row.method === 'session/prompt').length;
    fireEvent.click(screen.getByTestId('task-review-correct'));
    await waitFor(() => expect(answerFor(191)).toEqual({ outcome: 'selected', optionId: 'reject' }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('My unrelated draft\n\npermission.correctionDraft:');
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('capabilities/refund');
    expect(bridge.sent.filter((row) => row.method === 'session/prompt')).toHaveLength(promptsBefore);
  });

  it('keeps the rejected proposal immutable and binds a user-sent correction to a distinct request', async () => {
    await bootSession();
    await startUserTurn('Keep the refund exception');
    const original = { slug: 'capabilities/refund', expected_mtime: 100, body: 'Incorrect unconditional refund' };
    emit(mcpPermissionRequest('mcp__atlas-vault__patch_concept', 291, original));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Existing draft' } });
    fireEvent.click(await screen.findByTestId('task-review-correct'));
    await waitFor(() => expect(answerFor(291)).toEqual({ outcome: 'selected', optionId: 'reject' }));
    expect(original.body).toBe('Incorrect unconditional refund');
    expect(screen.queryByTestId('task-review-meaning-accept')).not.toBeInTheDocument();

    act(() => replyTo('session/prompt', { stopReason: 'end_turn' }));
    await waitFor(() => expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'));
    const composer = screen.getByRole('textbox');
    expect((composer as HTMLTextAreaElement).value).toContain('Existing draft');
    await startUserTurn('Correct it: refund only after capture.');
    expect(bridge.sent.filter((row) => row.method === 'session/prompt')).toHaveLength(2);

    emit(mcpPermissionRequest('mcp__atlas-vault__patch_concept', 292, {
      slug: 'capabilities/refund', expected_mtime: 100, body: 'Refund only after capture.',
    }));
    // Re-query rather than holding the first node: the panel re-renders as the replacement
    // request settles, and under a loaded parallel run that node is detached by the time the
    // matcher reads it (the same flake as the deferred-request test above).
    await waitFor(() => expect(screen.getByTestId('acp-permission-allow')).toBeInTheDocument());
    expect(answerFor(292)).toBeUndefined();
    expect(answerFor(291)).toEqual({ outcome: 'selected', optionId: 'reject' });
    // The review card's own controls arrive with the card, not with the permission buttons.
    fireEvent.click(await screen.findByTestId('task-review-depth-details'));
    await waitFor(() =>
      expect(screen.getByTestId('acp-ontology-change-review')).toHaveTextContent('Refund only after capture.'),
    );
    expect(screen.queryByTestId('task-review-meaning-accept')).not.toBeInTheDocument();
  });

  it('defers and resumes the same live request without answering it', async () => {
    await bootSession();
    await startUserTurn('Review the refund exception');
    emit(mcpPermissionRequest('mcp__atlas-vault__patch_concept', 192, {
      slug: 'capabilities/refund', expected_mtime: 100, body: 'Review later',
    }));
    fireEvent.click(await screen.findByTestId('task-review-defer'));
    expect(screen.getByTestId('acp-permission-deferred')).toBeInTheDocument();
    expect(screen.queryByTestId('acp-permission-allow')).not.toBeInTheDocument();
    expect(answerFor(192)).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'permission.resumeReview' }));
    expect(screen.getByTestId('acp-permission-allow')).toBeInTheDocument();
    expect(answerFor(192)).toBeUndefined();
    fireEvent.click(screen.getByTestId('acp-permission-reject'));
    await waitFor(() => expect(answerFor(192)).toEqual({ outcome: 'selected', optionId: 'reject' }));
  });

  it('a turn stopped before the agent said anything leaves one line under the request, and the next turn clears it', async () => {
    await bootSession();
    await startUserTurn('Read the wiki');
    expect(screen.queryByTestId('acp-turn-stopped')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('acp-chat-stop'));
    act(() => replyTo('session/prompt', { stopReason: 'cancelled' }));
    await waitFor(() => expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'));
    expect(await screen.findByTestId('acp-turn-stopped')).toHaveTextContent('stoppedBeforeAnswer');
    await startUserTurn('Read it again');
    expect(screen.queryByTestId('acp-turn-stopped')).not.toBeInTheDocument();
  });

  it('a turn stopped after the agent had answered says nothing extra', async () => {
    await bootSession();
    await startUserTurn('Read the wiki');
    emit({ method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Reading…' } } } });
    fireEvent.click(screen.getByTestId('acp-chat-stop'));
    act(() => replyTo('session/prompt', { stopReason: 'cancelled' }));
    await waitFor(() => expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'));
    expect(screen.queryByTestId('acp-turn-stopped')).not.toBeInTheDocument();
  });

  it('cancels a deferred request and does not defer a later request with the same tool call id', async () => {
    await bootSession();
    await startUserTurn('Review the first request');
    emit(mcpPermissionRequest('mcp__atlas-vault__patch_concept', 193, {
      slug: 'capabilities/refund', expected_mtime: 100, body: 'First',
    }));
    fireEvent.click(await screen.findByTestId('task-review-defer'));
    fireEvent.click(screen.getByTestId('acp-chat-stop'));
    await waitFor(() => expect(answerFor(193)).toEqual({ outcome: 'selected', optionId: 'reject' }));
    act(() => replyTo('session/prompt', { stopReason: 'cancelled' }));
    await waitFor(() => expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'));
    await startUserTurn('Review the replacement request');
    emit(mcpPermissionRequest('mcp__atlas-vault__patch_concept', 194, {
      slug: 'capabilities/refund', expected_mtime: 100, body: 'Replacement',
    }));
    /* Re-query on each poll: the panel re-renders as the replacement settles and detaches the node. */
    await waitFor(() => expect(screen.getByTestId('acp-permission-allow')).toBeInTheDocument());
    expect(screen.queryByTestId('acp-permission-deferred')).not.toBeInTheDocument();
    expect(answerFor(194)).toBeUndefined();
  });

  /**
   * jsdom has no layout, so this pins the structure: the panel caps the card's height, the card scrolls
   * only its reading matter, and the decision row sits after that scroller.
   */
  /**
   * ⚠️ **A turn blocked on this card is not thinking.** Measured in the rendered panel, both
   * catalogues: with the card on screen the footer read 「Thinking」 and its clock kept counting,
   * beside a Stop button, while the agent had produced nothing since it asked and could produce
   * nothing until the person answered. The panel was reporting its own wait as the agent's work.
   * The session's own state is untouched — `data-acp-status` is still `thinking` — and only the
   * word a person reads changes.
   */
  it('says in words that it is waiting and leaves the session state alone', async () => {
    await bootSession();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '관계를 정리해줘' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));

    const panel = screen.getByTestId('acp-chat-panel');
    const badge = document.querySelector('[data-acp-status-badge]') as HTMLElement;
    expect(badge.getAttribute('data-acp-status-badge')).toBe('thinking');

    emit(
      mcpPermissionRequest('mcp__atlas-vault__add_relation', 98, {
        from: 'capabilities/a',
        to: 'domains/b',
        type: 'relates',
        why: '같은 흐름이라서',
      }),
    );
    await screen.findByTestId('acp-permission-card');

    await waitFor(() => {
      expect(
        (document.querySelector('[data-acp-status-badge]') as HTMLElement).getAttribute('data-acp-status-badge'),
      ).toBe('awaiting');
    });
    expect(document.querySelector('[data-acp-status-badge]')!.textContent).toContain('status.awaiting');
    // The protocol state is what it was; only the sentence changed.
    expect(panel.getAttribute('data-acp-status')).toBe('thinking');
  });

  it('the two answer buttons stay outside the scroll area even when the permission card gets long', async () => {
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
    expect(card.closest('[data-surface-state]')?.className).toContain('max-h-[70%]');
  });

  it('sends the human decision on an ontology write and the final tool state out as a work receipt', async () => {
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
    // Wait for the card itself: `previews` updates before the permission card mounts on a later render.
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

  it('a rejected change closes at once with a not-executed receipt', async () => {
    const receipts: AcpWorkReceipt[] = [];
    await bootSession({ onWorkReceipt: (receipt) => receipts.push(receipt) });
    await startUserTurn('새 개념 제안을 검토해줘');
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

  it('multiple relation requests show every row and send only the one chosen row to the map', async () => {
    const previews: Array<AcpOntologyRelationPreview | null> = [];
    await bootSession({
      onOntologyRelationPreviewChange: (preview) => previews.push(preview),
    });
    await startUserTurn('여러 관계 제안을 검토해줘');
    emit(
      mcpPermissionRequest('mcp__atlas-vault__add_relations', 90, {
        relations: [
          { from: 'capabilities/a', to: 'domains/one', type: 'depends_on', why: '첫 이유' },
          { from: 'capabilities/b', to: 'domains/two', type: 'contains', why: '둘째 이유' },
        ],
      }),
    );
    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('task-review-depth-details'));
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
    fireEvent.click(screen.getByTestId('task-review-depth-summary'));
    const summary = screen.getByTestId('task-review-summary');
    expect(summary).toHaveTextContent('capabilities/b');
    expect(summary).toHaveTextContent('contains');
    expect(summary).toHaveTextContent('domains/two');
    expect(summary).toHaveTextContent('둘째 이유');
    expect(screen.getByTestId('task-review-batch-remaining')).toHaveTextContent('1');
  });

  it('a bulk ontology build is allowed in one go only after every concept proposal has been shown', async () => {
    await bootSession();
    await startUserTurn('저장소 온톨로지를 구축해줘');
    emit(
      mcpPermissionRequest('mcp__atlas-vault__add_concepts', 91, {
        concepts: [
          { slug: 'domains/orders', kind: 'domain', title: 'Orders' },
          { slug: 'capabilities/create-order', kind: 'capability', title: 'Create Order', domain: 'domains/orders' },
        ],
      }),
    );

    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());
    expect(answerFor(91), 'ACP must not keep running before the whole proposal has been reviewed').toBeUndefined();
    fireEvent.click(screen.getByTestId('task-review-depth-details'));
    const rows = screen.getAllByTestId('acp-ontology-change-item');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('domains/orders');
    expect(rows[1]).toHaveTextContent('capabilities/create-order');

    fireEvent.click(screen.getByTestId('acp-permission-allow'));
    await waitFor(() => expect(answerFor(91)).toEqual({ outcome: 'selected', optionId: 'allow' }));
  });

  it('opens a queued second write as a new card with focus on its title', async () => {
    await bootSession();
    await startUserTurn('rename two concepts');
    const patch = (id: number, toolCallId: string, slug: string) => {
      const request = mcpPermissionRequest('mcp__atlas-vault__patch_concept', id, { slug, frontmatter: { title: `${slug} renamed` } });
      return { ...request, params: { ...request.params, toolCall: { ...request.params.toolCall, toolCallId } } };
    };
    emit(patch(101, 'tc-first', 'capabilities/first'));
    emit(patch(102, 'tc-second', 'capabilities/second'));

    await waitFor(() => expect(screen.getByTestId('task-review-scope')).toHaveTextContent('capabilities/first'));
    const first = screen.getByTestId('acp-permission-card');
    fireEvent.click(screen.getByTestId('acp-permission-allow'));
    await waitFor(() => expect(answerFor(101)).toEqual({ outcome: 'selected', optionId: 'allow' }));

    await waitFor(() => expect(screen.getByTestId('task-review-scope')).toHaveTextContent('capabilities/second'));
    const second = screen.getByTestId('acp-permission-card');
    expect(second).not.toBe(first);
    expect(second).not.toHaveAttribute('inert');
    expect(screen.queryByTestId('acp-permission-answered')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(second.querySelector('#acp-permission-title')));
    expect(answerFor(102)).toBeUndefined();
  });

  it('a read tool of the vault we installed is not blocked even without a path', async () => {
    await bootSession();
    emit(mcpPermissionRequest('mcp__atlas-vault__list_concepts'));

    await waitFor(() => expect(answerFor(78)).toEqual({ outcome: 'selected', optionId: 'allow' }));
    // A read does not raise the card — a person is not blocked on every lookup mid-conversation.
    expect(screen.queryByTestId('acp-permission-card')).toBeNull();
  });

  it('a write tool of our vault shows the change proposal even without a path and waits for the answer', async () => {
    await bootSession();
    await startUserTurn('새 개념을 추가해줘');
    emit(
      mcpPermissionRequest('mcp__atlas-vault__add_concept', 83, {
        slug: 'capabilities/contextual-editing',
        kind: 'capability',
        title: 'Contextual Meaning Editing',
        domain: 'domains/graph-modeling',
      }),
    );

    fireEvent.click(await screen.findByTestId('task-review-depth-details'));
    await waitFor(() => expect(screen.getByTestId('acp-ontology-change-review')).toBeInTheDocument());
    expect(answerFor(83), 'the ACP session must not continue before a person answers').toBeUndefined();
    expect(screen.getByText('capabilities/contextual-editing')).toBeInTheDocument();
    expect(screen.getByText('Contextual Meaning Editing')).toBeInTheDocument();
    expect(screen.queryByTestId('acp-permission-allow-always')).toBeNull();
  });

  it('**even our own tool is asked about when the path is outside the vault**, because the name is not a pass', async () => {
    /*
     * `absorb_document` edits the source file relative to the repository root, not the vault, so a name
     * starting with `mcp__atlas-vault__` must not skip the path check.
     */
    bridge.verdict = 'ask';
    await bootSession();
    await startUserTurn('외부 문서를 흡수해줘');
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
        /* The argument is `filePath`, the name our MCP server actually uses; `file_path` would pass vacuously. */
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

  it('a tool that scans a folder is also asked about when outside the vault, because the argument name is `rootPath`', async () => {
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

  it('a third-party MCP tool with no path is asked about as is', async () => {
    await bootSession();
    emit(mcpPermissionRequest('mcp__some-other-server__write_file', 79));

    // A name that is not our server has no basis for auto-allow — it has to ask.
    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());
    expect(answerFor(79)).toBeUndefined();
  });

  it('a tool that imitates our name does not get through', async () => {
    await bootSession();
    // If something merely prefix-similar (`atlas-vault-evil`) passed, the decision would be meaningless.
    emit(mcpPermissionRequest('mcp__atlas-vault-evil__write_file', 80));

    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());
    expect(answerFor(80)).toBeUndefined();
  });

  it('a **read** inside the vault shows no card and the app allows it on behalf of the user', async () => {
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

  it('even inside the vault an **edit** shows the card, because path safety and change approval are different questions', async () => {
    // Path containment must not auto-allow the edit tool on vault Markdown; that bypasses write review.
    bridge.verdict = 'allow-inside-vault';
    await bootSession();
    emit(permissionRequest('/vault/notes.md', 77, 'edit'));

    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());
    expect(answerFor(77)).toBeUndefined();

    fireEvent.click(screen.getByTestId('acp-permission-reject'));
    await waitFor(() => expect(answerFor(77)).toEqual({ outcome: 'selected', optionId: 'reject' }));
  });

  it('a door pressed into a broken session restarts it and then sends', async () => {
    const view = await bootSession();
    bridge.exit?.(1);
    await waitFor(() =>
      expect(['error', 'exited']).toContain(screen.getByTestId('acp-chat-panel').getAttribute('data-acp-status')),
    );
    const initializesBefore = bridge.sent.filter((m) => m.method === 'initialize').length;

    view.rerenderPanel({ openingRequest: { text: 'Check the wiki again.', nonce: 3 } });

    await waitFor(() =>
      expect(bridge.sent.filter((m) => m.method === 'initialize').length).toBe(initializesBefore + 1),
    );
    replyTo('initialize', { protocolVersion: 1 });
    await waitFor(() => expect(bridge.sent.filter((m) => m.method === 'session/new').length).toBeGreaterThan(1));
    replyTo('session/new', { sessionId: 's-2' });
    await waitFor(() => {
      const prompt = [...bridge.sent].reverse().find((m) => m.method === 'session/prompt');
      expect(JSON.stringify(prompt?.params ?? {})).toContain('Check the wiki again.');
    });
  });

  it('the auto-allowed receipt carries its two doors: open the page, and ask next time', async () => {
    /* Both doors on the receipt are the page's, not the panel's: the panel only relays the path. */
    const openPage = vi.fn();
    const askNext = vi.fn();
    await bootSession({
      autoDecide: () => 'wiki/handover.md',
      noticeActions: { openPage, askNext },
    });
    emit(permissionRequest('/vault/wiki/handover.md', 91, 'edit'));

    await waitFor(() => expect(answerFor(91)).toEqual({ outcome: 'selected', optionId: 'allow' }));
    expect(screen.queryByTestId('acp-permission-card')).toBeNull();
    const notice = document.querySelector('[data-acp-entry="notice"][data-notice="auto-allowed"]');
    expect(notice, 'the receipt did not appear where the card would have stood').not.toBeNull();

    fireEvent.click(screen.getByTestId('acp-notice-open-page'));
    expect(openPage).toHaveBeenCalledWith('wiki/handover.md');
    fireEvent.click(screen.getByTestId('acp-notice-ask-next'));
    expect(askNext).toHaveBeenCalledTimes(1);
  });

  it('without the doors the receipt is a sentence alone — a surface that cannot open a page does not promise to', async () => {
    await bootSession({ autoDecide: () => 'wiki/handover.md' });
    emit(permissionRequest('/vault/wiki/handover.md', 92, 'edit'));
    await waitFor(() => expect(answerFor(92)).toEqual({ outcome: 'selected', optionId: 'allow' }));
    expect(screen.queryByTestId('acp-notice-open-page')).toBeNull();
    expect(screen.queryByTestId('acp-notice-ask-next')).toBeNull();
  });

  /*
   * `use-rounds-runner` answers `autoDecide` with `{ reject }` outside a round's scope; the notice must
   * say it refused rather than fall through to `notice.gateOff`.
   */
  it('an automatic rejection says it rejected and names what it blocked', async () => {
    await bootSession({ autoDecide: () => ({ reject: 'wiki/out-of-scope.md' }) });
    emit(permissionRequest('/vault/wiki/out-of-scope.md', 93, 'edit'));

    await waitFor(() => expect(document.querySelector('[data-acp-entry="notice"]')).not.toBeNull());
    const notice = document.querySelector('[data-acp-entry="notice"]')!;
    // The card never stood: the screen had already decided.
    expect(screen.queryByTestId('acp-permission-card')).toBeNull();
    // It names what it blocked…
    expect(notice.textContent).toContain('wiki/out-of-scope.md');
    // …and it is not the unrelated sentence about the folder gate being off.
    expect(notice.textContent).not.toContain('notice.gateOff');
    expect(notice.textContent).toContain('notice.autoRefused');
  });

  it('outside the vault it shows the card and sends no answer before one is given', async () => {
    await bootSession();
    emit(permissionRequest('/somewhere/else.md'));

    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());
    // This moment is the checkpoint — the agent gets no answer until the user chooses.
    expect(answerFor(77)).toBeUndefined();
    // The path is shown in full, untruncated — that is the basis for the judgement.
    expect(screen.getByTestId('acp-permission-path')).toHaveTextContent('/somewhere/else.md');
  });

  it('pressing decline delivers the rejection and the card disappears', async () => {
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
      expect(card.closest('[inert]'), 'the exiting card can still be pressed').not.toBeNull();
    }
    await waitFor(() => expect(screen.queryByTestId('acp-permission-card')).toBeNull());
  });

  it('pressing allow once allows only that one time', async () => {
    await bootSession();
    emit(permissionRequest('/somewhere/else.md'));
    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());

    // Wait for the card itself: `previews` updates before the permission card mounts on a later render.
    fireEvent.click(await screen.findByTestId('acp-permission-allow'));
    await waitFor(() => expect(answerFor(77)).toEqual({ outcome: 'selected', optionId: 'allow' }));
  });

  it('the card has no close X, because if it can be dismissed without answering it is not a gate', async () => {
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

  it('allow for this whole folder does not carry the same weight as the primary action', async () => {
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

describe('chat panel: managed like a chat room', () => {
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

  it('with past conversations a list door appears, holding only conversations from this folder', async () => {
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

  it('closes with Esc, since every other surface in this app does', async () => {
    await bootSession();
    await waitFor(() => expect(replyToList()).toBe(true));
    fireEvent.click(await screen.findByTestId('acp-chat-history'));
    expect(await screen.findByTestId('acp-chat-history-scrim')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId('acp-chat-history-scrim')).toBeNull());
  });

  it('choosing a past conversation resumes it', async () => {
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

  it('with no past conversations no list door is made', async () => {
    await bootSession();
    const call = [...bridge.sent].reverse().find((m) => m.method === 'session/list');
    emit({ jsonrpc: '2.0', id: call?.id, result: { sessions: [] } });
    // No reason to show a first-time user a button that is always empty.
    await waitFor(() => expect(screen.getByTestId('acp-chat-new')).toBeInTheDocument());
    expect(screen.queryByTestId('acp-chat-history')).toBeNull();
  });

  it('new conversation clears the history and opens fresh', async () => {
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

describe('chat panel: honest about what it cannot do', () => {
  it('when the session ends it says so as a status and locks the composer', async () => {
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
   * `prompt` has no timeout, so a turn that stopped answering must not look like a long
   * one: these two check that the panel says so and points at the way out.
   */
  it('when a turn is quiet for long it says so plainly and points to the way out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await bootSession();
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '지도 만들어줘' } });
      fireEvent.click(screen.getByTestId('acp-chat-send'));
      // The agent never answers, and never says anything either.
      expect(screen.queryByTestId('acp-chat-turn-silent')).toBeNull();
      expect(screen.getByTestId('acp-answer-wait')).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(TURN_SILENCE_LIMIT_MS + 6_000);
      await waitFor(() =>
        expect(screen.getByTestId('acp-chat-turn-silent')).toBeInTheDocument(),
      );
      // The way out has to be on screen next to the words that name the problem.
      expect(screen.getByTestId('acp-chat-stop')).toBeInTheDocument();
      expect(screen.queryByTestId('acp-answer-wait')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a turn that keeps talking is never called stalled however long it runs', async () => {
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
            sessionId: 's-1',
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
  it('while an approval card is up it is not called stalled even when quiet', async () => {
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

  it('does not send an empty message', async () => {
    await bootSession();
    expect(screen.getByTestId('acp-chat-send')).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    expect(screen.getByTestId('acp-chat-send')).toBeDisabled();
  });

  it('ends the process when the screen goes away', async () => {
    await bootSession();
    cleanup();
    await waitFor(() => expect(bridge.stopped).toContain('acp-1-999'));
  });
});

describe('chat panel: a screen a person reads', () => {
  it('draws the answer from the agent as markdown, so backticks do not stay as characters', async () => {
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

  it('a tool line writes what happened, not the function name', async () => {
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

  it('an unknown tool shows only its name, with no plausible-sounding wording invented', async () => {
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

describe('chat panel: never starts two adapters', () => {
  /**
   * The lock was a single `clientRef`, set only after the process launches; a second call in between
   * would start another adapter and strand the first, so only one session may open.
   */
  it('opens only one session even when called again while starting', async () => {
    render(<AcpChatPanel runtimeId="claude-acp" runtimeLabel="Claude Agent" vaultRoot="/vault" />);

    // Wait until the first handshake goes out — that moment is 「launching」.
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    const initializes = bridge.sent.filter((m) => m.method === 'initialize').length;
    expect(initializes, 'two handshakes during startup would mean two processes').toBe(1);

    replyTo('initialize', { protocolVersion: 1 });
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
    // There has to be only one session too.
    expect(bridge.sent.filter((m) => m.method === 'session/new')).toHaveLength(1);
  });

  it('does not start again when a new array arrives on every render', async () => {
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

describe('composer: the hint does not cover what is being written', () => {
  it('shows the hint **only when touched and empty**', async () => {
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

  it('session control icon buttons have a name and are not small', async () => {
    /*
     * An icon-only button has no visible name. The accessible name is enforced by the
     * type (`IconButton.label`), but for **someone looking at the screen** the tooltip
     * plays that role.
     */
    await bootSession();
    // The panel draws no close button: the workbench that hosts it owns closing.
    expect(screen.queryByTestId('acp-chat-close')).toBeNull();
    for (const id of ['acp-chat-new']) {
      const button = screen.getByTestId(id);
      expect(button, id).toHaveAccessibleName();
      /*
       * The icon-control ramp is 24 / 28 / 32 and `lg` is the top. These are the session's
       * own controls, and they kept the top step when they moved down onto the composer row —
       * the send button beside them is 32px too, and one row of controls has one height.
       */
      expect(button.className, `${id}: the size dropped a step`).toContain('h-8 w-8');
    }
  });
});

describe('chat panel: what floats must float', () => {
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

  it('the list does not push the flow and floats over it instead', async () => {
    await bootSession();
    await waitFor(() => expect(replyToList()).toBe(true));
    fireEvent.click(await screen.findByTestId('acp-chat-history'));

    const list = await screen.findByTestId('acp-chat-history-list');
    // Some ancestor has to be out of the flow (`absolute`).
    const floating = list.closest('.absolute');
    expect(floating, 'a list inside the flow pushes the conversation away when opened').not.toBeNull();
  });

  it('has a scrim and closes when anywhere is pressed', async () => {
    await bootSession();
    await waitFor(() => expect(replyToList()).toBe(true));
    fireEvent.click(await screen.findByTestId('acp-chat-history'));

    const scrim = await screen.findByTestId('acp-chat-history-scrim');
    fireEvent.click(scrim);
    await waitFor(() => expect(screen.queryByTestId('acp-chat-history-scrim')).toBeNull());
  });

  it('shows when a conversation took place, without discarding a value already received', async () => {
    await bootSession();
    await waitFor(() => expect(replyToList()).toBe(true));
    fireEvent.click(await screen.findByTestId('acp-chat-history'));

    const item = await screen.findByTestId('acp-chat-history-item');
    expect(item.textContent).toContain('어제 하던 정리');
    // The time is the basis for choosing among conversations with similar titles.
    expect(item.textContent, 'without a date there is no telling which to pick').toMatch(/2026/);
  });
});

describe('chat panel: my question and the answer are separated', () => {
  it('a turn boundary is drawn from the second question on', async () => {
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
      expect(document.querySelectorAll('[data-turn-start]'), 'the turn changed but there is no boundary').toHaveLength(1),
    );
  });
});

describe('chat panel: errors are told in human words with a next step', () => {
  it('recognises that the login has lapsed and folds the original text away', async () => {
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

  it('does not report the same failure twice, and skips the original text the adapter also sent as a message', async () => {
    /*
     * The adapter also sends the error text as a `session/update` message;
     * it must not render outside the card.
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
        sessionId: 's-1',
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
    const transcript = screen.getByTestId('acp-chat-panel');
    const outsideAlert = [...transcript.querySelectorAll('*')].filter(
      (el) => el.textContent === echo && !alert.contains(el),
    );
    expect(outsideAlert, 'the English original appears again outside the card').toHaveLength(0);
  });

  it('recognises a death from a broken npx cache even when the error string says nothing (real machine, 2026-08-19)', async () => {
    /* The error is only `acp session closed` with the clue in stderr; it must read as the install branch. */
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

  it('the card provides the very action it asked for, and retry really starts a new session', async () => {
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
    expect(retry, 'the error card does not offer retry').not.toBeNull();
    fireEvent.click(retry as HTMLButtonElement);
    await waitFor(() =>
      expect(
        handshakes(),
        '「다시 시도」가 새 악수를 시작하지 않았다',
      ).toBeGreaterThan(before),
    );
  });

  describe.each([
    {
      name: 'a usage limit with one tool',
      message: 'session limit reached (429)',
      runtimes: [{ id: 'claude-acp', label: 'Claude Code' }],
      kind: 'limit',
      hint: 'trouble.limit.hintOnlyTool',
      retry: true,
      agentsLink: false,
      pickers: 0,
    },
    {
      name: 'a usage limit with two tools',
      message: 'session limit reached (429)',
      runtimes: [
        { id: 'claude-acp', label: 'Claude Code' },
        { id: 'codex-acp', label: 'Codex' },
      ],
      kind: 'limit',
      hint: 'trouble.limit.hint',
      retry: true,
      agentsLink: false,
      pickers: 1,
    },
    {
      name: 'a launch failure',
      message: 'spawn npx ENOENT',
      runtimes: [{ id: 'claude-acp', label: 'Claude Code' }],
      kind: 'launch',
      hint: 'trouble.launch.hint',
      retry: false,
      agentsLink: true,
      pickers: 0,
    },
    {
      name: 'a network failure',
      message: 'fetch failed: ECONNREFUSED',
      runtimes: [{ id: 'claude-acp', label: 'Claude Code' }],
      kind: 'network',
      hint: 'trouble.network.hint',
      retry: true,
      agentsLink: false,
      pickers: 0,
    },
  ])('the error card for $name', ({ message, runtimes, kind, hint, retry, agentsLink, pickers }) => {
    it('offers only the next steps it can take', async () => {
      await bootSession({ runtimes, onRuntimeChange: () => {} });
      fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'hi' } });
      fireEvent.click(screen.getByTestId('acp-chat-send'));
      await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/prompt')).toBe(true));
      const call = [...bridge.sent].reverse().find((m) => m.method === 'session/prompt');
      emit({ jsonrpc: '2.0', id: call?.id, error: { code: -32603, message } });

      const card = await screen.findByTestId('acp-chat-error');
      expect(card.dataset.trouble).toBe(kind);
      expect(within(card).getByText(hint, { exact: true })).toBeTruthy();
      if (hint !== 'trouble.limit.hintOnlyTool') {
        expect(within(card).queryByText('trouble.limit.hintOnlyTool', { exact: true })).toBeNull();
      }
      expect(within(card).queryAllByTestId('acp-chat-error-retry')).toHaveLength(retry ? 1 : 0);
      const door = within(card).queryAllByTestId('acp-chat-error-agents');
      expect(door).toHaveLength(agentsLink ? 1 : 0);
      if (agentsLink) expect(door[0]).toHaveAttribute('href', expect.stringMatching(/\/agents/));
      expect(screen.queryAllByTestId('acp-chat-runtime')).toHaveLength(pickers);
    });
  });
});

describe('first download: a starting indicator alone is not enough (2026-08-19)', () => {
  it('says that it is downloading with measured progress (MB) and withdraws it when ready', async () => {
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

  it('builds the indicator from progress notices alone even if the first notice was missed, since a notice sent before subscribing can be lost', async () => {
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

  it('previews the first asks, not yet pressable, while the tool opens, and the composer names the picked concept', async () => {
    render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Code"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
        suggestions={[{ kind: 'explain', params: { count: 80 } }]}
        composerSubject="Checkout"
      />,
    );
    await screen.findByTestId('acp-starting');
    const preview = screen.getByTestId('acp-starting-suggestion-explain');
    // A preview, not a disabled button: nothing in it can be pressed or focused.
    expect(preview.tagName).toBe('LI');
    expect(within(screen.getByTestId('acp-starting-suggestions')).queryAllByRole('button')).toHaveLength(0);
    // The live row is a different element; the preview must not answer for it.
    expect(screen.queryByTestId('acp-chat-suggestion-explain')).toBeNull();
    const composer = screen.getByTestId('acp-chat-composer').querySelector('textarea')!;
    expect(composer.getAttribute('placeholder')).toContain('composerPlaceholderSubject');
    expect(composer.getAttribute('placeholder')).toContain('Checkout');
  });

  it('an ordinary start with no download also waits in the middle of the screen, since one chip at the top right is not enough', async () => {
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
    expect(screen.getAllByTestId('brand-waiting-mark')).toHaveLength(1);
    // No download, so nothing claims one — and no invented megabytes.
    expect(waiting.textContent).not.toContain('firstRun.title');
    expect(screen.queryByTestId('acp-first-run-progress')).toBeNull();
    // The 「ask me anything」 hint must not invite input into a tool that cannot answer yet.
    expect(screen.queryByTestId('acp-chat-empty')).toBeNull();
  });

  it('shows one current-turn waiting character until answer text arrives, yielding to permission and cancellation', async () => {
    await bootSession();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'First question' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await screen.findByTestId('acp-answer-wait');
    expect(screen.getAllByTestId('brand-waiting-mark')).toHaveLength(1);

    act(() => emit({ jsonrpc: '2.0', method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk', content: { text: ' ' } } } }));
    expect(screen.getByTestId('acp-answer-wait')).toBeInTheDocument();
    act(() => emit({ jsonrpc: '2.0', method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk', content: { text: 'Here is the answer.' } } } }));
    await waitFor(() => expect(screen.queryByTestId('acp-answer-wait')).toBeNull());
    act(() => replyTo('session/prompt', { stopReason: 'end_turn' }));
    await waitFor(() => expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'));

    // A previous answer does not hide the next turn's wait.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Second question' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await screen.findByTestId('acp-answer-wait');
    act(() => emit(permissionRequest('/somewhere/else.md')));
    await screen.findByTestId('acp-permission-card');
    expect(screen.queryByTestId('acp-answer-wait')).toBeNull();
    fireEvent.click(screen.getByTestId('acp-permission-reject'));
    await screen.findByTestId('acp-answer-wait');
    fireEvent.click(screen.getByTestId('acp-chat-stop'));
    await waitFor(() => expect(screen.queryByTestId('acp-answer-wait')).toBeNull());
    // The adapter has not acknowledged Stop; the UI does not fabricate a terminal state.
    expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'thinking');
    act(() => replyTo('session/prompt', { stopReason: 'cancelled' }));
    await waitFor(() => expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Third question' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await screen.findByTestId('acp-answer-wait');
  });

  it('the waiting indicator disappears when ready', async () => {
    await bootSession();
    expect(screen.queryByTestId('acp-starting')).toBeNull();
    expect(screen.queryByTestId('brand-waiting-mark')).toBeNull();
  });

  /* A door's first turn waits for `ready`: a prompt sent into a starting session is swallowed. */
  it('the first words carried in by the door go out once, after the session is ready', async () => {
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
    expect(promptsWhileStarting(), 'sent while still starting, so it is swallowed').toBe(0);

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

describe('permission card: must be impossible to miss', () => {
  it('when the card appears **focus moves into it**, onto the reject side', async () => {
    /* Focus goes to reject, not allow, so a key press to move past cannot land on the irreversible side. */
    bridge.verdict = 'ask';
    await bootSession();
    emit(permissionRequest('/somewhere/else/notes.md'));

    const card = await screen.findByTestId('acp-permission-card');
    await waitFor(() =>
      expect(card.contains(document.activeElement), 'focus is outside the card').toBe(true),
    );
    expect(document.activeElement).toBe(screen.getByTestId('acp-permission-reject'));
    // The other thing the role promises — a body that reads out what is being asked.
    expect(card.getAttribute('aria-describedby')).toBe('acp-permission-body');
  });
});

describe('suggestions for an empty conversation: draws only what concerns this folder', () => {
  /**
   * What the model (`chat-suggestions.ts`) suggests is pinned by its own test. What is
   * pinned here is **whether the screen actually draws it and seats the sentence in
   * the composer on click**. A green model with a screen that does not draw it means
   * nothing happens.
   */
  it('draws a finished empty conversation from the first frame of the dock, with only the connection waiting behind', () => {
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
    // A suspended session has not begun work; its status word must not start a dance.
    expect(screen.queryByTestId('brand-waiting-mark')).toBeNull();
    expect(screen.getByTestId('acp-chat-empty')).toBeTruthy();
    expect(screen.getByTestId('acp-chat-suggestion-explain')).toBeTruthy();
    expect(screen.getByTestId('acp-chat-composer')).toBeTruthy();
    expect(bridge.sent.some((message) => message.method === 'initialize')).toBe(false);
  });

  it('suggestions are drawn when received, and pressing one puts the sentence in the input', async () => {
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
    expect(composer, 'the composer was not found, so this assertion measures nothing').toBeTruthy();
    await waitFor(() =>
      expect((composer as HTMLTextAreaElement).value).toContain('capabilities/invoice'),
    );
    // It only sits down and is **not sent** — the user has to be able to edit and send
    // (the same contract as `prefillRequest`).
    expect(bridge.sent.some((m) => m.method === 'session/prompt')).toBe(false);
  });

  it('with no suggestions that slot does not exist, and no empty box is drawn', async () => {
    await bootSession();
    expect(screen.getByTestId('acp-chat-empty')).toBeTruthy();
    expect(screen.queryByTestId('acp-chat-suggestions')).toBeNull();
  });

  it('a source-connection suggestion goes to the connect action of the app instead of becoming an agent sentence', async () => {
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

describe('suggestions for a finished conversation: connect the answer to the next action', () => {
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

  it('attaches suggestions only after the answer is done, and pressing one does not send automatically', async () => {
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

  it('when the vault state refreshes in the same conversation it drops the finished action and switches to the latest next action', async () => {
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

  describe('the transcript follows its end only while the person is there', () => {
    // jsdom has no layout: the box is stubbed and `layout()` reports growth as a browser would.
    async function streamingTranscript() {
      const observers = new Set<() => void>();
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(private readonly callback: () => void) {}
          observe() { observers.add(this.callback); }
          unobserve() {}
          disconnect() { observers.delete(this.callback); }
        },
      );
      await bootSession({ suggestions: [{ kind: 'explain', params: { count: 12 } }] });
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '긴 답변을 줘' } });
      fireEvent.click(screen.getByTestId('acp-chat-send'));
      await waitFor(() => expect(screen.getByText('긴 답변을 줘')).toBeInTheDocument());
      const transcript = screen.getByTestId('acp-chat-transcript');
      const box = { content: 400 };
      Object.defineProperties(transcript, {
        clientHeight: { configurable: true, get: () => 200 },
        scrollHeight: {
          configurable: true,
          get: () => box.content + (screen.queryByTestId('acp-chat-post-turn-suggestions') ? 120 : 0),
        },
        scrollTop: { configurable: true, writable: true, value: 200 },
      });
      fireEvent.scroll(transcript);
      const layout = () => act(() => { for (const callback of observers) callback(); });
      const chunk = async (text: string, content: number) => {
        box.content = content;
        emit({
          jsonrpc: '2.0',
          method: 'session/update',
          params: { update: { sessionUpdate: 'agent_message_chunk', content: { text } } },
        });
        await screen.findByText((_, node) => node?.getAttribute('data-acp-entry') === 'agent' && node.textContent?.includes(text.trim()) === true);
        layout();
      };
      return { transcript, box, layout, chunk };
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('follows a long answer and the suggestions to the end from the bottom, and stays put once the person scrolls up', async () => {
      const { transcript, box, layout, chunk } = await streamingTranscript();

      await chunk('아주 긴 첫 조각', 1_000);
      await waitFor(() => expect(transcript.scrollTop).toBe(800));

      box.content = 1_200;
      replyTo('session/prompt', { stopReason: 'end_turn' });
      await screen.findByTestId('acp-chat-post-turn-suggestions');
      layout();
      await waitFor(() => expect(transcript.scrollTop).toBe(1_120));

      transcript.scrollTop = 300;
      fireEvent.scroll(transcript);
      box.content = 1_400;
      layout();
      expect(transcript.scrollTop).toBe(300);
      expect(await screen.findByTestId('acp-chat-jump-latest')).toHaveTextContent('jumpToLatest');
    });

    it('stops at the first upward wheel turn, before the next chunk can pull the reader back', async () => {
      const { transcript, chunk } = await streamingTranscript();
      await chunk('첫 조각', 1_000);
      await waitFor(() => expect(transcript.scrollTop).toBe(800));

      fireEvent.wheel(transcript, { deltaY: -4 });
      transcript.scrollTop = 796;
      fireEvent.scroll(transcript);
      await chunk(' 둘째 조각', 1_040);
      await chunk(' 셋째 조각', 1_080);
      expect(transcript.scrollTop).toBe(796);
    });

    it('applies the wheel turn that stops the follow itself, and leaves later turns to the browser', async () => {
      const { transcript, chunk } = await streamingTranscript();
      await chunk('첫 조각', 1_000);
      await waitFor(() => expect(transcript.scrollTop).toBe(800));

      expect(fireEvent.wheel(transcript, { deltaY: -40 }), 'the stopping turn is taken over').toBe(false);
      expect(transcript.scrollTop).toBe(760);
      expect(fireEvent.wheel(transcript, { deltaY: -40 }), 'later turns stay native').toBe(true);
    });

    it('lets go of a touch released on a line that was replaced meanwhile', async () => {
      const { transcript, chunk } = await streamingTranscript();
      await chunk('첫 조각', 1_000);
      await waitFor(() => expect(transcript.scrollTop).toBe(800));
      const line = document.createElement('span');
      transcript.appendChild(line);
      fireEvent.touchStart(line);
      line.remove();
      fireEvent.touchEnd(line);

      await chunk(' 둘째 조각', 1_100);
      await waitFor(() => expect(transcript.scrollTop).toBe(900));
    });

    it('stops following when focus moves onto a control inside the transcript', async () => {
      const { transcript, chunk } = await streamingTranscript();
      await chunk('첫 조각', 1_000);
      await waitFor(() => expect(transcript.scrollTop).toBe(800));
      const control = document.createElement('button');
      transcript.appendChild(control);
      fireEvent.focusIn(control);

      await chunk(' 둘째 조각', 1_300);
      expect(transcript.scrollTop).toBe(800);
      expect(await screen.findByTestId('acp-chat-jump-latest')).toBeInTheDocument();
    });

    it('returns to the end and follows again when the person presses the door', async () => {
      const { transcript, chunk } = await streamingTranscript();
      await chunk('첫 조각', 1_000);
      await waitFor(() => expect(transcript.scrollTop).toBe(800));
      transcript.scrollTop = 100;
      fireEvent.scroll(transcript);
      await chunk(' 둘째 조각', 1_300);
      expect(transcript.scrollTop).toBe(100);

      fireEvent.click(await screen.findByTestId('acp-chat-jump-latest'));
      await waitFor(() => expect(transcript.scrollTop).toBe(1_100));
      await chunk(' 셋째 조각', 1_500);
      await waitFor(() => expect(transcript.scrollTop).toBe(1_300));
      await waitFor(() => expect(screen.queryByTestId('acp-chat-jump-latest')).toBeNull());
    });

    it('follows again once the person scrolls back down to the end themselves', async () => {
      const { transcript, chunk } = await streamingTranscript();
      await chunk('첫 조각', 1_000);
      await waitFor(() => expect(transcript.scrollTop).toBe(800));
      transcript.scrollTop = 500;
      fireEvent.scroll(transcript);
      await chunk(' 둘째 조각', 1_100);
      expect(transcript.scrollTop).toBe(500);

      transcript.scrollTop = 900;
      fireEvent.scroll(transcript);
      await chunk(' 셋째 조각', 1_300);
      await waitFor(() => expect(transcript.scrollTop).toBe(1_100));
    });
  });

  it('suggestions step back while the user writes or reviews a permission', async () => {
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

  it('does not attach a previous answer as the next action of a new unanswered turn', async () => {
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

  it('when a new turn fails, the error and recovery path take priority over the previous suggestion', async () => {
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

  it('does not dress up an agent sentence that arrived without a user question as a completed turn', async () => {
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

  it('app navigation actions are left out of post-turn, and a prompt choice goes to the composer without an app callback', async () => {
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

describe('node names in an answer: linked to the map', () => {
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

  it('a known name gets a mark, and hovering it sends that name out', async () => {
    const hovered = await agentSays('먼저 capabilities/invoice 를 봤어요.');

    const mark = await screen.findByTestId('acp-chat-slug');
    expect(mark.getAttribute('data-slug')).toBe('capabilities/invoice');

    fireEvent.pointerEnter(mark);
    expect(hovered.at(-1), 'hovered but nothing was sent to the map').toBe(
      'capabilities/invoice',
    );
    fireEvent.pointerLeave(mark);
    // It must be cleared on leave — otherwise the highlight stays on.
    expect(hovered.at(-1), 'the mouse left but the highlight did not turn off').toBeNull();
  });

  it('an unknown name gets no mark, so no link is made that goes nowhere when pressed', async () => {
    await agentSays('src/features/acp-session/model/x.ts 를 고쳤어요.');
    await waitFor(() => expect(document.querySelectorAll('[data-acp-entry="agent"]').length).toBe(1));
    expect(screen.queryAllByTestId('acp-chat-slug')).toHaveLength(0);
  });

  it('without the known names it marks nothing, and does not guess when it does not know the vault', async () => {
    await agentSays('먼저 capabilities/invoice 를 봤어요.', { knownSlugs: undefined });
    await waitFor(() => expect(document.querySelectorAll('[data-acp-entry="agent"]').length).toBe(1));
    expect(screen.queryAllByTestId('acp-chat-slug')).toHaveLength(0);
  });
});

describe('tool line: says which node was touched', () => {
  it('writes the node the tool touched, and hovering it goes out to the map', async () => {
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
    await waitFor(() => expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'));
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

  it('touching an unknown node writes nothing, so it never points at something that does not exist', async () => {
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
    await waitFor(() => expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'));
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

describe('tool call: moves the map to the exact target', () => {
  it('passes get_concept input once as a focus on a real node', async () => {
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

  it('passes the two endpoints of find_path as a path intent and does not interpret the answer sentence', async () => {
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

describe('Ontology DNA presentation: sees the same ACP turn as scenes', () => {
  it('opens inside the analysis without a map callback, and moving the map stays a separate choice', async () => {
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

  it('opens the presentation only for an answer after source-hidden full reads finish, and focuses the same node in every scene', async () => {
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

  it('a turn mixed with non-Atlas tools is blocked with a named status explanation and the presentation door stays closed', async () => {
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

describe('dying while answering and being fully finished are different statements', () => {
  it('dying while a turn is running says exactly that', async () => {
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
      expect(said, 'it died while answering but the screen says nothing').toContain('died-mid-turn');
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

  it.each([false, true])('states profile uncertainty with server consent %s', async (serverGate) => {
    render(<AcpChatPanel runtimeId="claude-acp" runtimeLabel="Claude Code" vaultRoot="/vault"
      mcpServers={[{ name: 'atlas-vault', env: serverGate ? [{ name: 'OATLAS_WRITE_CONSENT', value: 'on' }] : [] }]} />);
    await waitFor(() => expect(bridge.sent.some(m => m.method === 'initialize')).toBe(true));
    replyTo('initialize', { protocolVersion: 1 });
    await waitFor(() => expect(bridge.sent.some(m => m.method === 'session/new')).toBe(true));
    replyTo('session/new', { sessionId: 's-1', modes: {
      currentModeId: 'permission-profile:local', availableModes: [{ id: 'default', name: 'Manual' }],
    } });
    const key = serverGate ? 'notice.profileModeMovedServerGate' : 'notice.profileModeMoved';
    await waitFor(() => expect(screen.getByText(`${key}:{"mode":"permission-profile:local"}`)).toBeInTheDocument());
    expect(screen.queryByText(/notice\.modeMoved/)).toBeNull();
  });

  it('dying while no turn is running does not say that, so no event is invented', async () => {
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

/** Activity is reported only while a turn runs; reporting it when idle would state a falsehood. */
describe('chat panel: announces only while a turn is running', () => {
  it('passes structured input only while the tool is actually called and clears it afterward', async () => {
    const seen: Array<{ id: string; toolKind: string | null; rawInput: unknown } | null> = [];
    await bootSession({ onTurnToolActivityChange: (activity) => seen.push(activity) });

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '읽어 줘' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'read-1',
          title: 'Read plan',
          kind: 'read',
          status: 'pending',
          rawInput: { path: 'sources/plan.md' },
        },
      },
    });
    await waitFor(() =>
      expect(seen.at(-1)).toMatchObject({
        id: 'read-1',
        toolKind: 'read',
        rawInput: { path: 'sources/plan.md' },
      }),
    );

    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { update: { sessionUpdate: 'tool_call_update', toolCallId: 'read-1', status: 'completed' } },
    });
    await waitFor(() => expect(seen.at(-1)).toBeNull());
  });

  it('a finished tool row is handed to observation once and at once, regardless of a later turn cancellation', async () => {
    const observed: Array<{ id: string; status: string; toolKind: string }> = [];
    await bootSession({ onTerminalToolObservation: (event) => observed.push(event) });

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '읽어 줘' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'read-now',
          title: 'Read now',
          kind: 'read',
          status: 'pending',
          rawInput: { path: 'sources/plan.md' },
        },
      },
    });
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { update: { sessionUpdate: 'tool_call_update', toolCallId: 'read-now', status: 'completed' } },
    });
    await waitFor(() => expect(observed).toEqual([
      expect.objectContaining({ id: 'read-now', status: 'completed', toolKind: 'read' }),
    ]));

    // Adapters can repeat a terminal update. It is one observed tool, not two receipts.
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { update: { sessionUpdate: 'tool_call_update', toolCallId: 'read-now', status: 'cancelled' } },
    });
    await waitFor(() => expect(observed).toHaveLength(1));
  });

  it('drains the last completed read when its update and turn end share a React batch', async () => {
    const observed: Array<{ id: string; status: string }> = [];
    await bootSession({ onTerminalToolObservation: (event) => observed.push(event) });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Read once' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await act(async () => {
      emit({ jsonrpc: '2.0', method: 'session/update', params: { update: {
        sessionUpdate: 'tool_call', toolCallId: 'last-read', title: 'Read', kind: 'read',
        status: 'completed', rawInput: { path: 'sources/plan.md' },
      } } });
      replyTo('session/prompt', { stopReason: 'end_turn' });
    });
    expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready');
    expect(observed).toEqual([expect.objectContaining({ id: 'last-read', status: 'completed' })]);
  });

  it('turns on when sent and off when the answer ends', async () => {
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
    expect(seen.some(Boolean), 'says it is active though only the session was opened').toBe(false);

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '안녕' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() => expect(seen.at(-1)).toMatchObject({ state: 'planning', summary: '안녕' }));

    const call = [...bridge.sent].reverse().find((m) => m.method === 'session/prompt');
    emit({ jsonrpc: '2.0', id: call?.id, result: { stopReason: 'end_turn' } });
    await waitFor(() => expect(seen.at(-1)).toBeNull());
  });

  it('turns it off when the panel disappears, rather than leaving it on', async () => {
    const seen: Array<{ state: string } | null> = [];
    const toolSeen: Array<{ id: string } | null> = [];
    const view = render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Code"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
        onTurnActivityChange={(activity) => seen.push(activity)}
        onTurnToolActivityChange={(activity) => toolSeen.push(activity)}
      />,
    );
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    view.unmount();
    expect(seen.at(-1)).toBeNull();
    expect(toolSeen.at(-1)).toBeNull();
  });
});

describe('composer: the `/` menu', () => {
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

  it('shows only the commands that arrived', async () => {
    await openMenu();
    const menu = screen.getByTestId('acp-chat-slash-menu');
    expect(menu.textContent).toContain('/alpha');
    expect(menu.textContent).toContain('/beta');
  });

  it('when nothing arrives typing `/` does not open it, so no nonexistent feature is invented', async () => {
    await bootSession();
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '/' } });
    expect(screen.queryByTestId('acp-chat-slash-menu')).toBeNull();
  });

  it('moves with the keyboard and chooses with Enter', async () => {
    const box = await openMenu();
    const selected = () =>
      [...screen.getByTestId('acp-chat-slash-menu').querySelectorAll('[role="option"]')].findIndex(
        (el) => el.getAttribute('aria-selected') === 'true',
      );
    expect(selected()).toBe(0);
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(selected(), 'cannot move down').toBe(1);
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(selected()).toBe(0);
    fireEvent.keyDown(box, { key: 'Enter' });
    expect((box as HTMLTextAreaElement).value).toBe('/alpha ');
  });

  it('the highlighted line is shown on screen, otherwise no one knows where it is', async () => {
    await openMenu();
    const options = screen.getByTestId('acp-chat-slash-menu').querySelectorAll('[role="option"]');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(options[1].getAttribute('aria-selected')).toBe('false');
  });

  it('closes when outside is pressed', async () => {
    await openMenu();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByTestId('acp-chat-slash-menu')).toBeNull());
  });

  it('typing again after closing reopens it, so it is not locked for the whole session', async () => {
    const box = await openMenu();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByTestId('acp-chat-slash-menu')).toBeNull());
    fireEvent.change(box, { target: { value: '/a' } });
    await screen.findByTestId('acp-chat-slash-menu');
  });

  it('also closes with Esc', async () => {
    const box = await openMenu();
    fireEvent.keyDown(box, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('acp-chat-slash-menu')).toBeNull());
  });
});

describe('reopening the panel — the folder\'s latest conversation, not a blank one', () => {
  /** Boots with `resumeLatest`, answering `session/list` with these rows. */
  async function bootResuming(sessions: unknown[]) {
    const view = render(
      <AcpChatPanel
        runtimeId="claude-acp"
        runtimeLabel="Claude Code"
        vaultRoot="/vault"
        mcpServers={[{ name: 'atlas-vault' }]}
        resumeLatest
      />,
    );
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    replyTo('initialize', { protocolVersion: 1 });
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/list')).toBe(true));
    replyTo('session/list', { sessions });
    return view;
  }

  it('loads the newest conversation in this folder and never opens a new one', async () => {
    await bootResuming([
      { sessionId: 's-old', cwd: '/vault', title: 'Yesterday', updatedAt: '2026-09-06T09:00:00.000Z' },
      { sessionId: 's-new', cwd: '/vault', title: 'Last night', updatedAt: '2026-09-07T23:40:00.000Z' },
    ]);
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/load')).toBe(true));
    const load = bridge.sent.find((m) => m.method === 'session/load');
    expect((load?.params as { sessionId?: string }).sessionId).toBe('s-new');
    replyTo('session/load', { sessionId: 's-new' });
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'),
    );
    expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(false);
  });

  it('reaches the other conversations at once — the history door does not wait for a turn', async () => {
    await bootResuming([
      { sessionId: 's-old', cwd: '/vault', title: 'Yesterday', updatedAt: '2026-09-06T09:00:00.000Z' },
      { sessionId: 's-new', cwd: '/vault', title: 'Last night', updatedAt: '2026-09-07T23:40:00.000Z' },
    ]);
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/load')).toBe(true));
    replyTo('session/load', { sessionId: 's-new' });
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'),
    );
    fireEvent.click(screen.getByTestId('acp-chat-history'));
    const rows = await screen.findAllByTestId('acp-chat-history-item');
    // Newest first, so the row a person reads as "the one I was in" is the one that opened.
    expect(rows.map((row) => row.getAttribute('data-session-id'))).toEqual(['s-new', 's-old']);
  });

  it('opens a new conversation when this folder has none — a first run is not a failure', async () => {
    await bootResuming([]);
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
    expect(bridge.sent.some((m) => m.method === 'session/load')).toBe(false);
    replyTo('session/new', { sessionId: 's-1' });
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'),
    );
  });

  it('opens a new conversation when the adapter refuses to load the old one', async () => {
    await bootResuming([
      { sessionId: 's-gone', cwd: '/vault', title: 'Deleted since', updatedAt: '2026-09-07T23:40:00.000Z' },
    ]);
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/load')).toBe(true));
    const load = bridge.sent.find((m) => m.method === 'session/load');
    emit({ jsonrpc: '2.0', id: load?.id, error: { code: -32603, message: 'no such session' } });
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
    replyTo('session/new', { sessionId: 's-1' });
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'),
    );
  });

  it('leaves a conversation from another folder alone', async () => {
    await bootResuming([
      { sessionId: 's-elsewhere', cwd: '/other', title: 'Another repository', updatedAt: '2026-09-07T23:40:00.000Z' },
    ]);
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
    expect(bridge.sent.some((m) => m.method === 'session/load')).toBe(false);
  });

  it('means new when a person presses New conversation', async () => {
    await bootResuming([
      { sessionId: 's-new', cwd: '/vault', title: 'Last night', updatedAt: '2026-09-07T23:40:00.000Z' },
    ]);
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/load')).toBe(true));
    replyTo('session/load', { sessionId: 's-new' });
    await waitFor(() =>
      expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'ready'),
    );
    bridge.sent = [];
    fireEvent.click(screen.getByTestId('acp-chat-new'));
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    replyTo('initialize', { protocolVersion: 1 });
    // The automatic resume steps aside: no list is consulted and no old conversation is loaded.
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
    expect(bridge.sent.some((m) => m.method === 'session/load')).toBe(false);
  });
});

describe('chat panel: a seated request stands as only a readable sentence, and the attached instruction follows unchanged', () => {
  const LEAD = 'Explain this Analysis tab from the current ontology evidence only.';
  const DETAIL = [
    READ_ONLY_TOOL_INSTRUCTION.en,
    '',
    'query_ontology({operation:"maintenance_plan"}) → explain the top three priorities',
    '',
    'Explain what a person should judge first and what the ontology cannot confirm.',
  ].join('\n');
  const SEATED = `${LEAD}\n${DETAIL}`;

  const seat = () => bootSession({ prefillRequest: { text: SEATED, nonce: 1 } });

  it('hides unrelated starting suggestions while a prepared draft waits and restores them when cleared', async () => {
    await bootSession({ prefillRequest: { text: SEATED, nonce: 1 }, suggestions: [{ kind: 'explain', params: { count: 12 } }] });
    expect(screen.queryByTestId('acp-chat-suggestions')).toBeNull();
    expect(screen.queryByTestId('acp-starting-suggestions')).toBeNull();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    expect(screen.getByTestId('acp-chat-suggestions')).toBeInTheDocument();
    expect(bridge.sent.some((m) => m.method === 'session/prompt')).toBe(false);
  });

  it('retains the complete folded evidence across a draft-store remount without sending it', async () => {
    let saved = {text:'',prefillNonce:null as number|null};
    const draftStore = { read: () => saved, write: (value: typeof saved) => { saved = value; } };
    await bootSession({ prefillRequest: { text: SEATED, nonce: 1 }, draftStore });
    await waitFor(() => expect(saved.text).toBe(SEATED));
    cleanup();bridge.sent.length=0;
    await bootSession({ draftStore });
    expect(screen.getByRole('textbox')).toHaveValue(LEAD);
    fireEvent.click(screen.getByTestId('acp-chat-seated-detail'));
    expect(screen.getByTestId('acp-chat-seated-detail-text').textContent).toBe(DETAIL.trim());
    expect(bridge.sent.some((m) => m.method === 'session/prompt')).toBe(false);
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/prompt')).toBe(true));
    const prompt = bridge.sent.filter((m) => m.method === 'session/prompt').at(-1)!;
    expect((prompt.params as { prompt: Array<{text?:string}> }).prompt[0].text).toBe(SEATED);
  });

  it.each(['edited', 'cleared', 'sent'] as const)('does not reapply a consumed prefill after a %s draft changes runtime', async (mode) => {
    let saved = {text:'',prefillNonce:null as number|null};
    const draftStore = { read: () => saved, write: (value: typeof saved) => { saved = value; } };
    const prefillRequest = { text: SEATED, nonce: 1 };
    await bootSession({ prefillRequest, draftStore });
    const expected = mode === 'edited' ? 'My revised question.' : '';
    if (mode === 'sent') {
      fireEvent.click(screen.getByTestId('acp-chat-send'));
      await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/prompt')).toBe(true));
    } else fireEvent.change(screen.getByRole('textbox'), { target: { value: expected } });
    await waitFor(() => expect(mode === 'edited' ? saved.text.startsWith(expected) : saved.text === '').toBe(true));
    cleanup();bridge.sent.length=0;
    const view=render(<AcpChatPanel runtimeId="codex-acp" runtimeLabel="Codex" vaultRoot="/vault" sessionEnabled={false} prefillRequest={prefillRequest} draftStore={draftStore}/>);
    expect(screen.getByRole('textbox')).toHaveValue(expected);
    expect(bridge.sent.some((m) => m.method === 'session/prompt')).toBe(false);
    view.rerender(<AcpChatPanel runtimeId="codex-acp" runtimeLabel="Codex" vaultRoot="/vault" sessionEnabled={false} prefillRequest={{text:'A fresh investigation.\n\nScope:\nnew evidence',nonce:2}} draftStore={draftStore}/>);
    expect(screen.getByRole('textbox')).toHaveValue('A fresh investigation.');
  });

  it('the box holds only the readable sentence, and the attached instruction shows unchanged once expanded', async () => {
    await seat();
    expect(screen.getByRole('textbox')).toHaveValue(LEAD);
    const summary = screen.getByTestId('acp-chat-seated-detail');
    expect(summary).toBeInTheDocument();
    fireEvent.click(summary);
    expect(screen.getByTestId('acp-chat-seated-detail-text')).toHaveTextContent('query_ontology');
    expect(screen.getByTestId('acp-chat-seated-detail-text').textContent).toBe(DETAIL.trim());
  });

  it('sending untouched goes out as the exact bytes the caller seated', async () => {
    await seat();
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/prompt')).toBe(true));
    const prompt = bridge.sent.filter((m) => m.method === 'session/prompt').at(-1)!;
    const params = prompt.params as { prompt: Array<{ text?: string }> };
    // Byte-identical, not a re-joined copy: a caller that recognises its own request by its text
    // (`presentationRequest`, `answerFold`) has to keep recognising it.
    expect(params.prompt[0].text).toBe(SEATED);
    expect(screen.queryByTestId('acp-chat-seated-detail')).toBeNull();
  });

  it('when the sentence is edited and sent, the attached instruction follows after the edited sentence unchanged', async () => {
    await seat();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Explain the top two only.' } });
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/prompt')).toBe(true));
    const prompt = bridge.sent.filter((m) => m.method === 'session/prompt').at(-1)!;
    const params = prompt.params as { prompt: Array<{ text?: string }> };
    expect(params.prompt[0].text).toBe(`Explain the top two only.\n\n${DETAIL.trim()}`);
  });

  it('clearing the box removes the attached instruction too, so an instruction without a sentence is never sent', async () => {
    await seat();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    expect(screen.queryByTestId('acp-chat-seated-detail')).toBeNull();
    fireEvent.click(screen.getByTestId('acp-chat-send'));
    expect(bridge.sent.some((m) => m.method === 'session/prompt')).toBe(false);
  });

  it('a short request with no machine half to fold seats whole, as before', async () => {
    const plain = 'Draw the business flow of this folder.';
    await bootSession({ prefillRequest: { text: plain, nonce: 1 } });
    expect(screen.getByRole('textbox')).toHaveValue(plain);
    expect(screen.queryByTestId('acp-chat-seated-detail')).toBeNull();
  });

  it('when a seated request is waiting, the empty conversation does not say to start from a blank page', async () => {
    await seat();
    const empty = screen.getByTestId('acp-chat-empty');
    // This harness echoes message keys, so the key is the fact to check, not the sentence.
    expect(empty.getAttribute('data-acp-empty')).toBe('seated');
    expect(empty.textContent).toBe('emptySeatedHint');
  });

  it('clearing the box makes it truly blank, so the original sentence returns', async () => {
    await seat();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    const empty = screen.getByTestId('acp-chat-empty');
    expect(empty.getAttribute('data-acp-empty')).toBe('open');
    expect(empty.textContent).toBe('emptyHint');
  });

  it('a dock with nothing seated uses the open invitation as is', async () => {
    await bootSession({});
    const empty = screen.getByTestId('acp-chat-empty');
    expect(empty.getAttribute('data-acp-empty')).toBe('open');
    expect(empty.textContent).toBe('emptyHint');
  });
});

describe('AcpChatPanel — a connection that never finishes starting', () => {
  const props = {
    runtimeId: 'claude-acp',
    runtimeLabel: 'Claude Code',
    vaultRoot: '/vault',
    mcpServers: [{ name: 'atlas-vault' }],
  } satisfies ComponentProps<typeof AcpChatPanel>;

  it('offers Stop while the tool starts, and stopping keeps the draft and offers Connect again', async () => {
    bridge.hangStart = true;
    render(<AcpChatPanel {...props} />);
    await waitFor(() => expect(bridge.starts).toBe(1));
    expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'starting');
    expect(screen.queryByTestId('acp-chat-stop')).toBeNull();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Summarise the budget page' } });
    fireEvent.click(screen.getByTestId('acp-chat-stop-connecting'));

    expect(await screen.findByTestId('acp-connect-stopped')).toHaveTextContent('connectStopped.title');
    expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status', 'stopped');
    expect(screen.queryByTestId('acp-starting')).toBeNull();
    expect(screen.queryByTestId('acp-chat-stop-connecting')).toBeNull();
    // Nothing was sent and nothing was lost: the draft is still in the box it was typed into.
    expect(screen.getByRole('textbox')).toHaveValue('Summarise the budget page');
    expect(screen.getByTestId('acp-chat-send')).toBeDisabled();
    // New chat is a way back too, now that nothing is starting.
    expect(screen.getByTestId('acp-chat-new')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('acp-connect-again'));
    await waitFor(() => expect(bridge.starts).toBe(2));
    expect(screen.queryByTestId('acp-connect-stopped')).toBeNull();
    expect(await screen.findByTestId('acp-starting')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Summarise the budget page');
  });

  it('stops the process a start had already launched', async () => {
    render(<AcpChatPanel {...props} />);
    // The process is up and the handshake is waiting on an answer that never comes.
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    fireEvent.click(screen.getByTestId('acp-chat-stop-connecting'));
    await waitFor(() => expect(bridge.stopped).toContain('acp-1-999'));
    expect(await screen.findByTestId('acp-connect-stopped')).toBeInTheDocument();
  });

  it('stays stopped when its host puts the dock away and opens it again', async () => {
    bridge.hangStart = true;
    const view = render(<AcpChatPanel {...props} sessionEnabled />);
    await waitFor(() => expect(bridge.starts).toBe(1));
    fireEvent.click(screen.getByTestId('acp-chat-stop-connecting'));
    await screen.findByTestId('acp-connect-stopped');

    // The Library's dock: shut (the session is disabled, the panel stays mounted), then opened.
    view.rerender(<AcpChatPanel {...props} sessionEnabled={false} />);
    view.rerender(<AcpChatPanel {...props} sessionEnabled />);

    expect(screen.getByTestId('acp-connect-stopped')).toBeInTheDocument();
    expect(bridge.starts).toBe(1);
  });

  it('connects again when a door brings a new request after the stop', async () => {
    bridge.hangStart = true;
    const view = render(<AcpChatPanel {...props} openingRequest={{ text: 'Compile the wiki', nonce: 1 }} />);
    await waitFor(() => expect(bridge.starts).toBe(1));
    fireEvent.click(screen.getByTestId('acp-chat-stop-connecting'));
    await screen.findByTestId('acp-connect-stopped');
    // The request that was waiting when Stop was pressed does not restart it on its own.
    expect(bridge.starts).toBe(1);

    view.rerender(<AcpChatPanel {...props} openingRequest={{ text: 'Check the page format', nonce: 2 }} />);
    await waitFor(() => expect(bridge.starts).toBe(2));
    expect(screen.queryByTestId('acp-connect-stopped')).toBeNull();
  });
});

describe('AcpChatPanel composer — IME composition', () => {
  it('holds every Enter that belongs to an IME composition and sends on the next plain Enter', async () => {
    await bootSession();
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: '결제 흐름을 요약해 줘' } });

    fireEvent.keyDown(box, { key: 'Enter', isComposing: true, keyCode: 229 });
    fireEvent.keyDown(box, { key: 'Enter', keyCode: 229 });
    fireEvent.compositionEnd(box, { data: '줘' });
    fireEvent.keyDown(box, { key: 'Enter', keyCode: 13 });
    expect(box.value).toBe('결제 흐름을 요약해 줘');

    fireEvent.keyDown(box, { key: 'Enter', keyCode: 13 });
    expect(box.value).toBe('');
    await waitFor(() => expect(bridge.sent.some((message) => message.method === 'session/prompt')).toBe(true));
  });
});

describe('guarded investigation opening request',()=>{
 const modes={currentModeId:'default',availableModes:[{id:'default',name:'Manual',_meta:{kind:'standard'}}]};
 it('sends exactly once after source revalidation and retains ordinary permission review',async()=>{
   const view=await bootSession({},modes);const consumed=vi.fn();const rejected=vi.fn();
   const revalidate=vi.fn(async()=>true);
   const openingRequest={text:'Investigate the selected evidence.',nonce:601,scopeKey:'scope-A',investigation:{runtimeId:'claude-acp',revalidate}};
   const props={openingRequest,requestScopeKey:'scope-A',onOpeningRequestSent:consumed,onOpeningRequestRejected:rejected};
   view.rerenderPanel(props);view.rerenderPanel(props);
   await waitFor(()=>expect(bridge.sent.filter(row=>row.method==='session/prompt')).toHaveLength(1));
   expect(revalidate).toHaveBeenCalledOnce();
   emit(permissionRequest('/vault/ontology/concept.md',901));
   await screen.findByTestId('acp-permission-allow');
   expect(answerFor(901)).toBeUndefined();
   fireEvent.click(screen.getByTestId('acp-permission-reject'));
   await waitFor(()=>expect(answerFor(901)).toEqual({outcome:'selected',optionId:'reject'}));
   replyTo('session/prompt',{stopReason:'end_turn'});
   await waitFor(()=>expect(consumed).toHaveBeenCalledExactlyOnceWith(601));
   expect(rejected).not.toHaveBeenCalled();
   view.rerenderPanel(props);
   expect(bridge.sent.filter(row=>row.method==='session/prompt')).toHaveLength(1);
 });
 it('consumes a scope mismatch so returning to that scope cannot send delayed work',async()=>{
   const view=await bootSession({},modes);const rejected=vi.fn();const revalidate=vi.fn(async()=>true);
   const openingRequest={text:'Old scope.',nonce:602,scopeKey:'scope-A',investigation:{runtimeId:'claude-acp',revalidate}};
   view.rerenderPanel({openingRequest,requestScopeKey:'scope-B',onOpeningRequestRejected:rejected});
   await waitFor(()=>expect(rejected).toHaveBeenCalledExactlyOnceWith(602));
   view.rerenderPanel({openingRequest,requestScopeKey:'scope-A',onOpeningRequestRejected:rejected});
   expect(revalidate).not.toHaveBeenCalled();expect(bridge.sent.filter(row=>row.method==='session/prompt')).toHaveLength(0);
 });
 it('refuses busy work instead of queueing another analysis',async()=>{
   const view=await bootSession({},modes);const rejected=vi.fn();
   await startUserTurn('Current work.');
   const openingRequest={text:'Unwanted queue.',nonce:603,investigation:{runtimeId:'claude-acp',revalidate:async()=>true}};
   view.rerenderPanel({openingRequest,onOpeningRequestRejected:rejected});
   await waitFor(()=>expect(rejected).toHaveBeenCalledExactlyOnceWith(603));
   replyTo('session/prompt',{stopReason:'end_turn'});
   await waitFor(()=>expect(screen.getByTestId('acp-chat-panel')).toHaveAttribute('data-acp-status','ready'));
   expect(bridge.sent.filter(row=>row.method==='session/prompt')).toHaveLength(1);
 });
 it('reports a stale source refusal without using ordinary send as fallback',async()=>{
   const view=await bootSession({},modes);const rejected=vi.fn();
   view.rerenderPanel({openingRequest:{text:'Stale source.',nonce:604,investigation:{runtimeId:'claude-acp',revalidate:async()=>false}},onOpeningRequestRejected:rejected});
   await waitFor(()=>expect(rejected).toHaveBeenCalledExactlyOnceWith(604));
   expect(bridge.sent.filter(row=>row.method==='session/prompt')).toHaveLength(0);
 });
 it('withdraws a pending investigation when the dock closes during source revalidation',async()=>{
   const view=await bootSession({},modes);const rejected=vi.fn();
   let release!:(current:boolean)=>void;
   const revalidate=vi.fn(()=>new Promise<boolean>(resolve=>{release=resolve;}));
   const openingRequest={text:'Withdrawn evidence.',nonce:605,investigation:{runtimeId:'claude-acp',revalidate}};
   view.rerenderPanel({openingRequest,onOpeningRequestRejected:rejected});
   await waitFor(()=>expect(revalidate).toHaveBeenCalledOnce());
   view.rerenderPanel({openingRequest:null,sessionEnabled:false,onOpeningRequestRejected:rejected});
   await act(async()=>{release(true);});
   await waitFor(()=>expect(rejected).toHaveBeenCalledExactlyOnceWith(605));
   expect(bridge.sent.filter(row=>row.method==='session/prompt')).toHaveLength(0);
 });
});

it('shows only live agent-reported plan counts and labels denominator changes',async()=>{
 await bootSession();
 const entry=(status='pending')=>({content:'Read a current condition.',priority:'high',status});
 emit({jsonrpc:'2.0',method:'session/update',params:{update:{sessionUpdate:'plan',entries:[entry('completed')]}}});
 expect(screen.queryByTestId('acp-reported-plan')).toBeNull();
 await startUserTurn('Investigate this question.');
 emit({jsonrpc:'2.0',method:'session/update',params:{update:{sessionUpdate:'plan',entries:[entry('completed'),entry(),entry()]}}});
 await waitFor(()=>expect(screen.getByTestId('acp-reported-plan')).toHaveTextContent('"done":1,"total":3'));
 emit({jsonrpc:'2.0',method:'session/update',params:{update:{sessionUpdate:'plan',entries:[entry('completed'),entry('completed')]}}});
 await waitFor(()=>expect(screen.getByTestId('acp-reported-plan')).toHaveTextContent('continuation.replanned'));
 expect(screen.getByTestId('acp-reported-plan')).toHaveTextContent('"done":2,"total":2');
});
