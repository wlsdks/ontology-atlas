import { describe, expect, it, vi } from 'vitest';

import {
  createAcpClient,
  toPermissionRequest,
  type AcpPermissionRequest,
  type AcpTransport,
} from './acp-client';

/** 줄을 오갈 수 있는 가짜 통로. 진짜 프로세스 없이 프로토콜을 잰다. */
function fakeTransport() {
  const sent: Array<Record<string, unknown>> = [];
  let listener: ((line: string) => void) | null = null;
  const transport: AcpTransport = {
    send: (line) => {
      sent.push(JSON.parse(line));
    },
    subscribe: (onLine) => {
      listener = onLine;
      return () => {
        listener = null;
      };
    },
  };
  return {
    transport,
    sent,
    /** 에이전트가 우리에게 보낸 줄. */
    emit(payload: unknown) {
      listener?.(JSON.stringify(payload));
    },
    emitRaw(line: string) {
      listener?.(line);
    },
    /** 우리가 보낸 마지막 요청에 답한다. */
    reply(result: unknown) {
      const last = [...sent].reverse().find((m) => typeof m.id === 'number');
      listener?.(JSON.stringify({ jsonrpc: '2.0', id: last?.id, result }));
    },
  };
}

/** 실측(2026-08-16)에서 실제로 받은 권한 요청의 모양. */
function permissionRequest(filePath: string, id = 7) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'session/request_permission',
    params: {
      sessionId: 's1',
      options: [
        { kind: 'reject_once', name: 'Deny', optionId: 'reject' },
        { kind: 'allow_once', name: 'Allow Once', optionId: 'allow' },
        {
          kind: 'allow_always',
          name: 'Always Allow',
          optionId: 'allow_always',
          _meta: {
            permission: {
              changes: [
                {
                  type: 'policy_rule',
                  ruleBehavior: 'allow',
                  description: '이 디렉터리 전체를 세션 내내 허용',
                },
              ],
            },
          },
        },
      ],
      toolCall: {
        toolCallId: 'tool-1',
        title: `Write ${filePath}`,
        kind: 'edit',
        rawInput: { file_path: filePath },
      },
    },
  };
}

function outcomeOf(sent: Array<Record<string, unknown>>, id: number) {
  const answer = sent.find((m) => m.id === id && 'result' in m);
  return (answer?.result as { outcome?: { outcome?: string; optionId?: string } })?.outcome;
}

const insideVault = async () => 'allow-inside-vault' as const;
const alwaysAsk = async () => 'ask' as const;

describe('ACP 클라이언트 — 우리가 선언한 것만 답한다', () => {
  it('선언하지 않은 능력이 오면 침묵하지 않고 「없다」고 답한다', async () => {
    // 침묵하면 상대가 영원히 기다린다. 그 증상은 사용자에게 「멈췄다」로만 보인다.
    const t = fakeTransport();
    const notices: string[] = [];
    createAcpClient(t.transport, {
      verdict: alwaysAsk,
      askUser: async () => null,
      onProtocolNotice: (m) => notices.push(m),
    });

    t.emit({ jsonrpc: '2.0', id: 42, method: 'fs/write_text_file', params: { path: '/x' } });
    await vi.waitFor(() => expect(t.sent.some((m) => m.id === 42)).toBe(true));

    const answer = t.sent.find((m) => m.id === 42) as { error?: { code?: number } };
    expect(answer.error?.code).toBe(-32601);
    expect(notices).toContain('declined:fs/write_text_file');
  });

  it('initialize 는 파일·터미널 능력을 선언하지 않는다', () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });
    void client.initialize();
    const sent = t.sent.find((m) => m.method === 'initialize') as {
      params?: { clientCapabilities?: Record<string, unknown> };
    };
    expect(sent.params?.clientCapabilities).toEqual({});
  });
});

describe('ACP 클라이언트 — 권한 정책', () => {
  it('볼트 안이면 앱이 대신 허용한다 (매번 물으면 대화가 성립하지 않는다)', async () => {
    const t = fakeTransport();
    const askUser = vi.fn(async () => null);
    createAcpClient(t.transport, { verdict: insideVault, askUser });

    t.emit(permissionRequest('/vault/notes.md'));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());

    expect(outcomeOf(t.sent, 7)).toEqual({ outcome: 'selected', optionId: 'allow' });
    expect(askUser).not.toHaveBeenCalled();
  });

  it('볼트 밖이면 사용자에게 묻고, 답을 그대로 전한다', async () => {
    const t = fakeTransport();
    const askUser = vi.fn(async (_request: AcpPermissionRequest) => 'allow');
    createAcpClient(t.transport, { verdict: alwaysAsk, askUser });

    t.emit(permissionRequest('/somewhere/else/notes.md'));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());

    expect(askUser).toHaveBeenCalledTimes(1);
    expect(askUser.mock.calls[0][0]).toMatchObject({
      toolKind: 'edit',
      filePath: '/somewhere/else/notes.md',
    });
    expect(outcomeOf(t.sent, 7)).toEqual({ outcome: 'selected', optionId: 'allow' });
  });

  it('사용자가 답하지 않으면 거절이다 — 안 물어본 것을 허용으로 세지 않는다', async () => {
    const t = fakeTransport();
    createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });

    t.emit(permissionRequest('/outside/notes.md'));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());

    expect(outcomeOf(t.sent, 7)).toEqual({ outcome: 'selected', optionId: 'reject' });
  });

  it('묻다가 실패해도 거절이다', async () => {
    const t = fakeTransport();
    createAcpClient(t.transport, {
      verdict: alwaysAsk,
      askUser: async () => {
        throw new Error('화면이 닫혔다');
      },
    });

    t.emit(permissionRequest('/outside/notes.md'));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());
    expect(outcomeOf(t.sent, 7)).toMatchObject({ optionId: 'reject' });
  });

  it('앱이 `allow_always` 를 대신 고르지 않는다', async () => {
    /*
     * 실측: 그 선택지의 `_meta.permission` 에 「이 디렉터리 전체를 세션 내내
     * 허용」하는 규칙이 딸려 온다. 경계를 넓히는 결정은 사용자만 한다.
     */
    const t = fakeTransport();
    createAcpClient(t.transport, { verdict: insideVault, askUser: async () => null });

    t.emit(permissionRequest('/vault/notes.md'));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());
    expect(outcomeOf(t.sent, 7)?.optionId).not.toBe('allow_always');
  });

  it('화면이 그 요청에 없는 선택지를 돌려주면 거절로 떨어진다', async () => {
    // 낡은 요청의 값을 돌려주는 화면 버그가 엉뚱한 것을 허용하게 두지 않는다.
    const t = fakeTransport();
    createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => 'not-an-option' });

    t.emit(permissionRequest('/outside/notes.md'));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());
    expect(outcomeOf(t.sent, 7)).toMatchObject({ optionId: 'reject' });
  });

  it('경로를 모르면 묻는다 — 판단할 수 없는 것을 통과시키지 않는다', async () => {
    const t = fakeTransport();
    const askUser = vi.fn(async () => null);
    // 볼트 안이라고 답하는 판정을 줘도, 경로가 없으면 판정 자체가 무의미하다.
    createAcpClient(t.transport, {
      verdict: async (filePath) => (filePath ? 'allow-inside-vault' : 'ask'),
      askUser,
    });

    const request = permissionRequest('/vault/notes.md', 11) as {
      params: { toolCall: { rawInput: Record<string, unknown> } };
    };
    request.params.toolCall.rawInput = {}; // 경로 없음
    t.emit(request);

    await vi.waitFor(() => expect(askUser).toHaveBeenCalled());
  });

  it('거절 선택지조차 없으면 취소로 답한다 (답을 안 하면 상대가 멈춘다)', async () => {
    const t = fakeTransport();
    createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });

    t.emit({
      jsonrpc: '2.0',
      id: 9,
      method: 'session/request_permission',
      params: { options: [{ kind: 'allow_once', optionId: 'allow', name: 'Allow' }], toolCall: {} },
    });
    await vi.waitFor(() => expect(outcomeOf(t.sent, 9)).toBeTruthy());
    expect(outcomeOf(t.sent, 9)).toEqual({ outcome: 'cancelled' });
  });
});

describe('ACP 클라이언트 — 요청/응답과 잡음', () => {
  it('session/new 는 sessionId 를 돌려주고, 없으면 실패한다', async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });

    const ok = client.newSession({ cwd: '/vault' });
    t.reply({ sessionId: 's-1', modes: { currentModeId: 'default' } });
    await expect(ok).resolves.toMatchObject({ sessionId: 's-1' });

    const bad = client.newSession({ cwd: '/vault' });
    t.reply({});
    await expect(bad).rejects.toThrow(/sessionId/);
  });

  it('session/update 는 화면으로 흘리고 답하지 않는다', async () => {
    const t = fakeTransport();
    const updates: Array<Record<string, unknown>> = [];
    createAcpClient(t.transport, {
      verdict: alwaysAsk,
      askUser: async () => null,
      onUpdate: (u) => updates.push(u),
    });

    t.emit({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { sessionId: 's1', update: { sessionUpdate: 'agent_message_chunk' } },
    });
    expect(updates).toEqual([{ sessionUpdate: 'agent_message_chunk' }]);
    expect(t.sent).toHaveLength(0);
  });

  it('JSON 이 아닌 줄은 버리되 조용히 버리지 않는다', () => {
    const t = fakeTransport();
    const notices: string[] = [];
    createAcpClient(t.transport, {
      verdict: alwaysAsk,
      askUser: async () => null,
      onProtocolNotice: (m) => notices.push(m),
    });

    t.emitRaw('npm warn exec 어댑터를 받는 중…');
    t.emitRaw('   ');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('unparsable:');
  });

  it('dispose 하면 기다리던 호출이 실패하고 더는 줄을 먹지 않는다', async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });
    const waiting = client.initialize();
    client.dispose();
    await expect(waiting).rejects.toThrow(/closed/);

    const before = t.sent.length;
    t.emit({ jsonrpc: '2.0', id: 1, method: 'fs/read_text_file', params: {} });
    expect(t.sent).toHaveLength(before);
  });
});

describe('toPermissionRequest — 제목이 아니라 경로를 본다', () => {
  it('구조화된 file_path 를 뽑고, 짝이 안 맞는 선택지는 버린다', () => {
    const parsed = toPermissionRequest({
      options: [
        { kind: 'allow_once', optionId: 'a', name: 'Allow' },
        { kind: 'reject_once' }, // optionId 없음 — 못 쓴다
        { optionId: 'x' }, // kind 없음 — 못 쓴다
      ],
      toolCall: { title: 'Write notes.md', kind: 'edit', rawInput: { file_path: '/vault/notes.md' } },
    });
    expect(parsed.filePath).toBe('/vault/notes.md');
    expect(parsed.toolKind).toBe('edit');
    expect(parsed.options).toEqual([{ optionId: 'a', kind: 'allow_once', name: 'Allow' }]);
  });

  it('모양이 달라도 터지지 않는다 — 어댑터가 바뀌어도 대화가 죽지 않아야 한다', () => {
    expect(toPermissionRequest({})).toEqual({
      title: null,
      // 도구 이름도 모르면 null 이다 — MCP 도구 자동 허용 판정이 이 값을 본다.
      toolName: null,
      toolKind: null,
      filePath: null,
      options: [],
    });
  });
});
