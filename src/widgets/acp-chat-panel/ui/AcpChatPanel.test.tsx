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

/**
 * ⚠️ `mcpServers` 를 **반드시** 넘긴다. 볼트 도구 자동 허용은 「우리가 정말
 * 꽂았을 때」만 켜진다(2026-08-16) — 안 넘기면 그 갈래가 아예 없는 세션을
 * 재게 되고, 그건 실제 앱과 다른 것을 재는 것이다.
 */
async function bootSession() {
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

  it('**우리 도구라도 볼트 밖 경로면 묻는다** — 이름이 통행증이 아니다', async () => {
    /*
     * 2026-08-16 검수에서 적발한 구멍이다. 종전에는 이름이 `mcp__atlas-vault__`
     * 로 시작하면 **경로 검사를 건너뛰고** 곧바로 허용했다. 근거는 「그 서버는
     * 볼트 경로로 띄웠으니 밖을 건드릴 수 없다」였는데, 그게 사실이 아니다:
     * `absorb_document` 는 볼트가 아니라 **저장소 루트**를 기준으로 원본 파일을
     * 제자리에서 고쳐 쓴다. 그러면 이 화면이 「폴더 밖은 먼저 물어본다」고 한
     * 약속이 카드 한 장 없이 깨진다.
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
         * ⚠️ 인자 이름은 **`filePath`** 다 — 우리 MCP 서버가 실제로 쓰는 이름
         * (`mcp/src/index.js` 에 `file_path` 는 0회, `filePath` 는 30회).
         * 종전 이 검사는 `file_path` 를 손으로 지어 넣었고, 그건 실제 서버가
         * 절대 만들지 않는 모양이라 **검사는 초록인데 화면은 뚫려 있었다.**
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
     * `analyze_repo_structure` · `index_project` · `infer_imports` 는 파일이
     * 아니라 **디렉터리**를 받는다. 판정은 결국 「이 경로가 볼트 안인가」이고,
     * 그 질문에는 폴더에도 답이 있다.
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

  it('Esc 로 닫힌다 — 이 앱의 다른 표면이 다 그러므로', async () => {
    /*
     * 실물 검수에서 걸린 자리다(2026-08-16): 목록을 열고 Esc 를 눌렀는데 그대로
     * 있었다. 뒤의 막을 누르는 길만 있으면, 키보드로 온 사람은 나갈 길이 없다.
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

describe('대화 패널 — 어댑터를 두 개 띄우지 않는다', () => {
  /**
   * ⚠️ **실물에서만 드러난 결함** (2026-08-16).
   *
   * 대화창 하나인데 어댑터 프로세스가 둘 떠 있었다:
   * ```
   * 83796  npm exec @agentclientprotocol/claude-agent-acp@0.68.0
   * 83797  npm exec @agentclientprotocol/claude-agent-acp@0.68.0
   * ```
   * 잠금이 `clientRef` 하나였는데 그 값은 프로세스를 띄우고 이벤트를 붙인
   * **뒤에야** 채워진다. 그 사이에 한 번 더 불리면 둘 다 통과한다. 그러면
   * 세션 번호는 나중 것인데 줄은 먼저 것으로 오가서 `Session not found` 로
   * 죽고, 먼저 뜬 프로세스는 아무도 안 끄는 유령이 된다.
   */
  it('띄우는 중에 또 불려도 세션은 하나만 연다', async () => {
    render(<AcpChatPanel runtimeId="claude-acp" runtimeLabel="Claude Agent" vaultRoot="/vault" />);

    // 첫 악수가 나갈 때까지 기다린다 — 이 시점이 「띄우는 중」이다.
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    const initializes = bridge.sent.filter((m) => m.method === 'initialize').length;
    expect(initializes, '띄우는 중에 악수가 두 번 나가면 프로세스가 둘이다').toBe(1);

    replyTo('initialize', { protocolVersion: 1 });
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
    // 세션도 하나뿐이어야 한다.
    expect(bridge.sent.filter((m) => m.method === 'session/new')).toHaveLength(1);
  });

  it('매 렌더 새 배열이 와도 다시 띄우지 않는다', async () => {
    /*
     * 이 결함의 방아쇠 하나가 그것이었다 — 부모가 `mcpServers` 를 매번 새로
     * 만들면 훅의 `start` 정체가 바뀌고 그것을 보는 effect 가 다시 돈다.
     * 부르는 쪽도 고쳤지만(useMemo), **여기서 막히는 것이 계약**이다.
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
   * 2026-08-16 소유자 실보고: *"박스 위에 글자에 입력한 게 겹치는데?"*
   *
   * 내가 만든 결함이다. 「줄이 안 흔들리게」 하려고 안내를 글자 자리 위에
   * 겹쳐 뒀는데, 그 자리가 곧 긴 문장이 지나가는 자리였다 — 배우고 나면
   * 사라져야 할 안내가 정작 읽을 것을 가렸다.
   */
  it('손이 갔고 **비어 있을 때만** 안내를 띄운다', async () => {
    await bootSession();
    const box = screen.getByRole('textbox');

    // 아직 손이 안 갔다 → 없다.
    expect(screen.queryByTestId('acp-chat-hint')).toBeNull();

    fireEvent.focus(box);
    expect(screen.getByTestId('acp-chat-hint')).toBeInTheDocument();

    // 한 글자라도 치면 사라진다 — 겹칠 일이 없어진다.
    fireEvent.change(box, { target: { value: '가' } });
    expect(
      screen.queryByTestId('acp-chat-hint'),
      '글자가 있는데 안내가 남아 있으면 그 위에 겹쳐 그려진다',
    ).toBeNull();

    // 다 지우면 다시 나온다.
    fireEvent.change(box, { target: { value: '' } });
    expect(screen.getByTestId('acp-chat-hint')).toBeInTheDocument();

    fireEvent.blur(box);
    expect(screen.queryByTestId('acp-chat-hint')).toBeNull();
  });

  it('머리의 아이콘 버튼은 이름을 갖고, 작지 않다', async () => {
    /*
     * 아이콘만 있는 버튼은 이름이 안 보인다. 접근성 이름은 타입이 강제하지만
     * (`IconButton.label`), **눈으로 보는 사람**에게는 툴팁이 그 역할을 한다.
     */
    await bootSession();
    // 닫기는 `onClose` 를 받은 자리에서만 생긴다 — 여기서는 항상 있는 것만 본다.
    for (const id of ['acp-chat-new']) {
      const button = screen.getByTestId(id);
      expect(button, id).toHaveAccessibleName();
      /*
       * 아이콘 컨트롤의 램프는 24 / 28 / 32 이고 `lg` 가 상한이다. 이 패널의
       * 주 크롬이므로 상한을 쓴다 — 더 키우려면 램프를 늘려야 하고, 그건
       * 이 자리에서 혼자 정할 일이 아니다(「체계」 자리의 몫).
       */
      expect(button.className, `${id}: 크기가 한 단 내려갔다`).toContain('h-8 w-8');
    }
  });
});

describe('대화 패널 — 떠 있는 것은 떠 있어야 한다', () => {
  /*
   * 2026-08-16 소유자 실보고: *"이렇게 같이 나와서 구분도 안 되고"*.
   *
   * 지난 대화 목록을 flex 자식으로 뒀더니, 열면 대화가 아래로 **밀려나고**
   * 목록이 대화의 일부처럼 보였다. 떠 있어야 할 것을 흐름에 두면 그건
   * 팝오버가 아니라 그냥 또 하나의 줄이다.
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
    // 조상 어딘가가 흐름에서 빠져 있어야 한다(`absolute`).
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
    // 제목만 비슷한 대화들 사이에서 고를 근거가 시각이다.
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
    // 위에 아무것도 없는데 경계를 그으면 그건 경계가 아니라 장식이다.
    expect(document.querySelectorAll('[data-turn-start]')).toHaveLength(0);

    emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { update: { sessionUpdate: 'agent_message_chunk', content: { text: '답' } } },
    });
    // 차례가 끝나야 다음 말을 보낼 수 있다 — 도는 중에는 작성 칸이 잠긴다.
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
     * 2026-08-16 소유자 화면: 이 자리가 JSON-RPC 오류를 통째로 붙여 놓고 있었다.
     * *"이렇게 보여주면 사용자가 어떻게 알겠어."*
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
    // 어느 갈래로 읽었는지가 화면에 남는다 — 밖에서 검사할 수 있게.
    expect(alert.dataset.trouble).toBe('auth');
    // 사람이 읽는 제목과 **할 일**을 그 갈래의 키로 낸다.
    expect(alert.textContent).toContain('trouble.auth.title');
    expect(alert.textContent).toContain('trouble.auth.hint');
    // 원문은 버리지 않되 접혀 있다.
    const details = alert.querySelector('details');
    expect(details).toBeTruthy();
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.textContent).toContain('authentication_failed');
  });
});

describe('권한 카드 — 놓칠 수 없어야 한다', () => {
  it('카드가 뜨면 **초점이 그 안으로** 온다 — 거절 쪽으로', async () => {
    /*
     * 2026-08-16 검수: 이 카드는 `role="alertdialog"` 를 선언하면서 그 역할이
     * 약속하는 것(가로막기 · 초점 이동)을 하나도 안 하고 있었다. 화면을 못 보는
     * 사람에게는 에이전트가 멈춰 선 그 순간이 완전한 침묵이었다.
     *
     * 허용이 아니라 **거절**로 데려간다 — 아무 키나 눌러 지나가는 손이 되돌릴
     * 수 없는 쪽에 닿으면 안 된다.
     */
    bridge.verdict = 'ask';
    await bootSession();
    emit(permissionRequest('/somewhere/else/notes.md'));

    const card = await screen.findByTestId('acp-permission-card');
    await waitFor(() =>
      expect(card.contains(document.activeElement), '초점이 카드 밖에 있다').toBe(true),
    );
    expect(document.activeElement).toBe(screen.getByTestId('acp-permission-reject'));
    // 역할이 약속하는 나머지 하나 — 무엇에 대한 물음인지 읽어 줄 본문.
    expect(card.getAttribute('aria-describedby')).toBe('acp-permission-body');
  });
});

describe('빈 대화의 추천 — 이 폴더에 대한 것만 그린다', () => {
  /**
   * 모델(`chat-suggestions.ts`)이 무엇을 권할지는 자기 테스트가 잠근다.
   * 여기서 잠그는 것은 **화면이 그것을 실제로 그리고, 눌렀을 때 입력칸에
   * 앉는가** 다. 모델만 초록이고 화면이 안 그리면 아무 일도 안 일어난다.
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
    // 세션이 서기 전(`starting`)에는 빈 대화 안내 자체가 안 그려진다 —
    // 추천도 그 안에 산다. 실제 사용자가 보는 상태까지 데려간다.
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'initialize')).toBe(true));
    replyTo('initialize', { protocolVersion: 1 });
    await waitFor(() => expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true));
    replyTo('session/new', { sessionId: 's-1' });

    const island = await screen.findByTestId('acp-chat-suggestion-island');
    // 이 폴더의 **실제 이름**이 버블에 있어야 한다 — 없으면 어느 앱에나 붙는
    // 예시 문장이고, 그건 추천이 아니라 장식이다.
    expect(island.textContent).toContain('capabilities/invoice');

    fireEvent.click(island);

    // `acp-chat-composer` 는 입력칸을 **감싸는 상자**다 — 그것을 잡으면
    // `value` 가 undefined 라 무엇을 단언해도 통과한다. 실제 값을 가진
    // 원소를 잡는다.
    const composer = screen
      .getByTestId('acp-chat-composer')
      .querySelector('textarea') as HTMLTextAreaElement;
    expect(composer, '작성 칸을 못 찾았다 — 이 단언은 무엇도 재지 못한다').toBeTruthy();
    await waitFor(() =>
      expect((composer as HTMLTextAreaElement).value).toContain('capabilities/invoice'),
    );
    // 앉기만 하고 **보내지는 않는다** — 사용자가 고쳐 보낼 수 있어야 한다
    // (`prefillRequest` 와 같은 계약).
    expect(bridge.sent.some((m) => m.method === 'session/prompt')).toBe(false);
  });

  it('추천이 없으면 그 칸 자체가 없다 — 빈 상자를 그리지 않는다', async () => {
    await bootSession();
    expect(screen.getByTestId('acp-chat-empty')).toBeTruthy();
    expect(screen.queryByTestId('acp-chat-suggestions')).toBeNull();
  });
});

describe('답변 속 노드 이름 — 지도와 잇는다', () => {
  /**
   * 모델(`link-slugs.ts`)이 무엇을 집을지는 자기 테스트가 잠근다. 여기서
   * 잠그는 것은 **답변 안에서 실제로 표시가 달리고, 마우스를 올리면 그
   * 이름이 지도 쪽으로 나가는가** 다.
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
    // 실제 순서대로 — 사람이 묻고 에이전트가 답한다.
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
    // 벗어나면 반드시 꺼야 한다 — 안 끄면 강조가 켜진 채로 남는다.
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
   * 종전에는 「개념을 읽었어요」라고만 하고 대상을 안 말했다. 값은
   * `rawInput` 으로 오고 있었는데 세션이 버리고 있었다.
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
