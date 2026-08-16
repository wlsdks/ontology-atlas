import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * 가짜 다리 — 진짜 프로세스 없이 프로토콜 왕복을 흉내 낸다.
 *
 * `emit` 이 에이전트가 보낸 줄이고, `sent` 가 우리가 보낸 줄이다. 그래서 이
 * 검사는 「화면이 무엇을 그리나」와 「에이전트에게 무엇을 답하나」를 **함께**
 * 잰다 — 권한 카드는 그 둘이 맞물릴 때만 관문이 된다.
 */
const bridge = vi.hoisted(() => {
  const state = {
    available: true,
    sent: [] as Array<Record<string, unknown>>,
    listener: null as ((line: string) => void) | null,
    verdict: 'ask' as 'ask' | 'allow-inside-vault',
    stopped: [] as string[],
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
  acpPermissionVerdict: async () => bridge.verdict,
  listenToAcpSession: async (
    _id: string,
    handlers: { onMessage?: (line: string) => void },
  ) => {
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

import { AcpChatPanel } from './AcpChatPanel';

/** 에이전트가 한 줄 보낸다. */
function emit(payload: unknown) {
  bridge.listener?.(JSON.stringify(payload));
}

/** 우리가 보낸 요청 중 그 메서드의 마지막 것에 답한다. */
function replyTo(method: string, result: unknown) {
  const call = [...bridge.sent].reverse().find((m) => m.method === method);
  emit({ jsonrpc: '2.0', id: call?.id, result });
}

async function bootSession() {
  render(<AcpChatPanel runtimeId="claude-acp" runtimeLabel="Claude Code" vaultRoot="/vault" />);
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

afterEach(() => {
  cleanup();
  bridge.available = true;
  bridge.sent = [];
  bridge.listener = null;
  bridge.verdict = 'ask';
  bridge.stopped = [];
});

describe('대화 패널 — 일어난 일만 그린다', () => {
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

    // 조각이 여러 개 와도 말풍선은 하나다 — 한 문장이 쪼개져서 온다.
    await waitFor(() => expect(screen.getByText('네, 볼게요.')).toBeInTheDocument());
    expect(screen.getAllByText(/네, 볼게요\./)).toHaveLength(1);
  });

  it('생각과 말을 다른 것으로 그린다 — 중간 과정을 결론으로 읽지 않게', async () => {
    await bootSession();
    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { update: { sessionUpdate: 'agent_thought_chunk', content: { text: '어디부터 볼까' } } },
    });
    await waitFor(() =>
      expect(document.querySelector('[data-acp-entry="thought"]')).toBeInTheDocument(),
    );
    expect(document.querySelector('[data-acp-entry="agent"]')).toBeNull();
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
    // 줄이 늘어나지 않는다 — 같은 도구 호출이다.
    expect(document.querySelectorAll('[data-acp-entry="tool"]')).toHaveLength(1);
  });
});

describe('대화 패널 — 권한 카드가 실제로 막는다', () => {
  /**
   * ⚠️ **실측이 아니었으면 못 잡았을 결함** (2026-08-16).
   *
   * 진짜 세션을 한 바퀴 돌려 보니 에이전트가 지도에 **아무것도 못 썼다** —
   * 우리 관문이 우리 자신의 MCP 도구를 막고 있었다. MCP 도구 호출에는
   * `file_path` 가 없어서 「경로를 모름 → 물어봄」으로 떨어졌고, 그 서버는
   * 볼트 경로로 우리가 띄운 것이라 애초에 밖을 건드릴 수가 없는데도 그랬다.
   *
   * 단위 검사는 전부 통과하고 있었다. 파일 경로가 있는 요청만 넣어 봤기
   * 때문이다 — **없는 입력은 검사도 없었다.**
   */
  function mcpPermissionRequest(toolName: string, id = 78) {
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
        // 실측 그대로: `rawInput` 에 경로가 없고 이름이 `title` 에 온다.
        toolCall: { toolCallId: 'tc9', title: toolName, kind: 'other', rawInput: { summary: true } },
      },
    };
  }

  it('우리가 꽂아 준 볼트 도구는 경로가 없어도 막지 않는다', async () => {
    await bootSession();
    emit(mcpPermissionRequest('mcp__atlas-vault__add_concept'));

    await waitFor(() => expect(answerFor(78)).toEqual({ outcome: 'selected', optionId: 'allow' }));
    // 카드를 띄우지 않는다 — 볼트 안 파일과 같은 근거로 자동 허용이다.
    expect(screen.queryByTestId('acp-permission-card')).toBeNull();
  });

  it('남의 MCP 도구는 경로가 없으면 그대로 묻는다', async () => {
    await bootSession();
    emit(mcpPermissionRequest('mcp__some-other-server__write_file', 79));

    // 이름이 우리 서버가 아니면 자동 허용의 근거가 없다 — 물어봐야 한다.
    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());
    expect(answerFor(79)).toBeUndefined();
  });

  it('이름을 흉내 낸 도구는 통과하지 못한다', async () => {
    await bootSession();
    // 접두사만 비슷한 것(`atlas-vault-evil`)이 통과하면 판정이 무의미해진다.
    emit(mcpPermissionRequest('mcp__atlas-vault-evil__write_file', 80));

    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());
    expect(answerFor(80)).toBeUndefined();
  });

  it('볼트 안이면 카드를 안 띄우고 앱이 대신 허용한다', async () => {
    bridge.verdict = 'allow-inside-vault';
    await bootSession();
    emit(permissionRequest('/vault/notes.md'));

    await waitFor(() => expect(answerFor(77)).toBeTruthy());
    expect(answerFor(77)).toEqual({ outcome: 'selected', optionId: 'allow' });
    expect(screen.queryByTestId('acp-permission-card')).toBeNull();
  });

  it('볼트 밖이면 카드를 띄우고, 답하기 전에는 아무 답도 보내지 않는다', async () => {
    await bootSession();
    emit(permissionRequest('/somewhere/else.md'));

    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());
    // 이 순간이 관문이다 — 사용자가 고르기 전까지 에이전트는 답을 못 받는다.
    expect(answerFor(77)).toBeUndefined();
    // 경로를 줄이지 않고 그대로 보여 준다 — 그게 판단의 근거다.
    expect(screen.getByTestId('acp-permission-path')).toHaveTextContent('/somewhere/else.md');
  });

  it('「안 할래요」를 누르면 거절이 전해지고 카드가 사라진다', async () => {
    await bootSession();
    emit(permissionRequest('/somewhere/else.md'));
    await waitFor(() => expect(screen.getByTestId('acp-permission-card')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('acp-permission-reject'));
    await waitFor(() => expect(answerFor(77)).toEqual({ outcome: 'selected', optionId: 'reject' }));
    /*
     * 카드는 **즉시** 사라지지 않는다 — 퇴장 애니메이션이 도는 동안 남아 있다.
     * 그동안 다시 누를 수 있으면 답을 두 번 보내게 되므로, 그 창에서는
     * `inert` 로 막혀 있어야 한다(`Surface` 의 계약). 사라지는 것 자체는
     * 시간이 지나면 일어나므로 여기서는 **막혀 있는가**를 잰다.
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
    // 한 번의 클릭이 경계를 통째로 넓히는 선택지다. 다른 둘과 같은 크기로 두면
    // 사람은 가장 편한 것을 고른다.
    await bootSession();
    emit(permissionRequest('/somewhere/else.md'));
    await screen.findByTestId('acp-permission-card');

    const always = screen.getByTestId('acp-permission-allow-always');
    const allow = screen.getByTestId('acp-permission-allow');
    expect(always.className).not.toEqual(allow.className);
    // 주 행동 버튼들과 다른 묶음에 있다.
    expect(always.parentElement).not.toBe(allow.parentElement);
  });
});

describe('대화 패널 — 대화방처럼 관리한다', () => {
  /** `session/list` 응답을 흉내 낸다. 다른 폴더 것을 섞어 둔다 — 실제가 그렇다. */
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
    // 열지 않은 폴더의 제목이 화면에 있으면 그게 결함이다.
    expect(screen.queryByText('남의 폴더 작업')).toBeNull();
  });

  it('지난 대화를 고르면 그것을 이어 받는다', async () => {
    await bootSession();
    await waitFor(() => expect(replyToList()).toBe(true));
    fireEvent.click(await screen.findByTestId('acp-chat-history'));
    const before = bridge.sent.filter((m) => m.method === 'initialize').length;
    fireEvent.click((await screen.findAllByTestId('acp-chat-history-item'))[0]);

    /*
     * 대화를 갈아타면 **프로세스부터 다시 띄운다** — 그래서 악수(`initialize`)가
     * 한 번 더 있고, 그것에 답해야 그다음이 온다. 이 왕복을 흉내 내지 않으면
     * 검사가 「안 왔다」고 말하는데 실제로는 우리가 답을 안 준 것이다.
     */
    await waitFor(() =>
      expect(bridge.sent.filter((m) => m.method === 'initialize').length).toBe(before + 1),
    );
    replyTo('initialize', { protocolVersion: 1 });

    // 그리고 새로 만드는 게 아니라 그 대화를 **이어 받는다**.
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
    // 늘 비어 있는 버튼을 처음 쓰는 사람에게 보여 줄 이유가 없다.
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
    // 새로 여는 것이지 이어 받는 것이 아니다.
    expect(bridge.sent.filter((m) => m.method === 'session/load')).toHaveLength(0);
  });
});

describe('대화 패널 — 못 하는 일은 정직하게', () => {
  it('세션이 끝나면 상태로 말하고 작성 칸을 잠근다', async () => {
    await bootSession();
    // 어댑터가 죽으면 exit 이벤트가 온다. 여기서는 프로토콜 오류로 대신한다.
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
     * 실물에서 이렇게 나왔다: ``이 폴더(`my-ontology-2`)는 …`` — 백틱째로.
     * 이 저장소에는 이미 렌더러가 있는데 이 화면만 안 쓰고 있었다.
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
    // 백틱은 사라지고 코드 조각이 된다.
    expect(body.querySelector('code')?.textContent).toBe('payment');
    expect(body.textContent).not.toContain('`');
    // 목록도 목록으로 그려진다.
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
    // 함수 이름이 화면에 남아 있으면 고친 것이 아니다.
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
