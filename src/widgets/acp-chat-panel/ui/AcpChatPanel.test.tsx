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
