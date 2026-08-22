import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  render(
    <AcpChatPanel
      runtimeId="claude-acp"
      runtimeLabel="Claude Code"
      vaultRoot="/vault"
      mcpServers={[{ name: 'atlas-vault' }]}
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
}

function permissionRequest(filePath: string, id = 77) {
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
      toolCall: { toolCallId: 'tc1', title: `Write ${filePath}`, kind: 'edit', rawInput: { file_path: filePath } },
    },
  };
}

function answerFor(id: number) {
  const answer = bridge.sent.find((m) => m.id === id && 'result' in m);
  return (answer?.result as { outcome?: { outcome?: string; optionId?: string } })?.outcome;
}

/** The work detail is collapsed by default. Checks that measure a tool row expand it explicitly first. */
async function openLatestWorkGroup() {
  const groups = await screen.findAllByTestId('acp-chat-work-group');
  const group = groups.at(-1)!;
  if (group.getAttribute('aria-expanded') !== 'true') fireEvent.click(group);
  await waitFor(() => expect(group).toHaveAttribute('aria-expanded', 'true'));
  return group;
}

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

  it('도구 줄은 부른 뒤에 생기고, 상태는 알려 준 대로만 바뀐다', async () => {
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: { sessionUpdate: 'tool_call', toolCallId: 'tc1', title: 'Read notes.md', kind: 'read', status: 'pending' },
      },
    });
    await openLatestWorkGroup();
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

    fireEvent.click(screen.getByTestId('acp-permission-allow'));
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
    fireEvent.click(screen.getByTestId('acp-permission-allow'));

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
     * The rationale was 「that server was launched against the vault path, so it cannot
     * touch anything outside」, and that is not true: `absorb_document` edits the source
     * file in place relative to the **repository root**, not the vault. That breaks
     * this screen's promise 「폴더 밖은 먼저 물어본다」 (it asks before going outside the
     * folder) without a single card.
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

  it('볼트 안이면 카드를 안 띄우고 앱이 대신 허용한다', async () => {
    bridge.verdict = 'allow-inside-vault';
    await bootSession();
    emit(permissionRequest('/vault/notes.md'));

    await waitFor(() => expect(answerFor(77)).toBeTruthy());
    expect(bridge.verdictCalls).toEqual([
      { sessionId: 'acp-1-999', filePath: '/vault/notes.md' },
    ]);
    expect(answerFor(77)).toEqual({ outcome: 'selected', optionId: 'allow' });
    expect(screen.queryByTestId('acp-permission-card')).toBeNull();
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

    fireEvent.click(screen.getByTestId('acp-permission-allow'));
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
     * On the real thing it came out like this: ``이 폴더(`my-ontology-2`)는 …`` —
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
    await openLatestWorkGroup();

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
    await openLatestWorkGroup();
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
   * Owner report from the real thing, 2026-08-16: *"박스 위에 글자에 입력한 게
   * 겹치는데?"* (the text I type overlaps the text on the box).
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

    fireEvent.focus(box);
    expect(screen.getByTestId('acp-chat-hint')).toBeInTheDocument();

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
       * ramp, and that is not decided alone in this place (the 「체계」 seat's call).
       */
      expect(button.className, `${id}: 크기가 한 단 내려갔다`).toContain('h-8 w-8');
    }
  });
});

describe('대화 패널 — 떠 있는 것은 떠 있어야 한다', () => {
  /*
   * Owner report from the real thing, 2026-08-16: *"이렇게 같이 나와서 구분도 안
   * 되고"* (it comes out together like this and can't be told apart).
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
     * *"이렇게 보여주면 사용자가 어떻게 알겠어."* (how is a user supposed to
     * understand this?)
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
    // The original survives only inside the folded 「자세히」 (details).
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
    // The original and the stderr clues survive inside the folded 「자세히」 (details).
    const details = alert.querySelector('details');
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.textContent).toContain('acp session closed');
    expect(details?.textContent).toContain('_npx/8757e2301903ae53');
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

    const card = await screen.findByTestId('acp-first-run-download');
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
    expect(screen.queryByTestId('acp-first-run-download')).toBeNull();
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
    await screen.findByTestId('acp-first-run-download');
    expect(screen.getByTestId('acp-first-run-progress').textContent).toContain(
      'firstRun.progress:{"mb":7}',
    );
  });

  it('내려받기가 없는 시작에는 아무것도 더 그리지 않는다', async () => {
    await bootSession();
    expect(screen.queryByTestId('acp-first-run-download')).toBeNull();
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
    // Before the session stands (`starting`), the empty-conversation guidance is not
    // drawn at all — and the suggestions live inside it. Take it to the state a real
    // user sees.
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
   * It used to say only 「개념을 읽었어요」 (read a concept) without naming the target.
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

    await openLatestWorkGroup();

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
    await openLatestWorkGroup();
    await waitFor(() =>
      expect(document.querySelectorAll('[data-acp-entry="tool"]').length).toBe(1),
    );
    expect(screen.queryAllByTestId('acp-chat-slug')).toHaveLength(0);
  });
});

describe('답하다 죽은 것과 다 끝난 것은 다른 말이다', () => {
  /**
   * Either way, it used to read only 「끝남」 (finished) in a small chip. Dying halfway
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
 * know 「a turn is running right now」 (owner instruction, 2026-08-17).
 *
 * ⚠️ **Not for the whole time a session is open.** While the heartbeat is fresh the
 * screen lights the 「에이전트 활동 중」 (agent active) indicator on the rail. If that
 * lights when nothing was asked, the screen is stating something that did not happen,
 * and this panel already keeps that discipline (*"전송 전에 「읽음」으로 찍으면 …"* —
 * marking it 「read」 before sending …).
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
 * "키보드로 이동이 안된다" (keyboard movement doesn't work) · "마우스 올려도 호버
 * 효과가 없어서 어딘지 구분도 안 되고" (no hover effect, so you can't tell where you
 * are) · "바닥 클릭하면 닫혀야하는데 안닫힘" (clicking the background should close it
 * but doesn't).
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
