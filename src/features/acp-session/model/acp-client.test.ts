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

/** WebView가 내려가는 경합처럼 모든 IPC 전송이 거절되는 통로. */
function rejectingTransport() {
  let listener: ((line: string) => void) | null = null;
  const transport: AcpTransport = {
    send: () => Promise.reject(new Error('bridge down')),
    subscribe: (onLine) => {
      listener = onLine;
      return () => {
        listener = null;
      };
    },
  };
  return {
    transport,
    emit(payload: unknown) {
      listener?.(JSON.stringify(payload));
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

  it('판정이 실패해도 **답은 나간다** — 상대를 영원히 기다리게 하지 않는다', async () => {
    /*
     * 2026-08-16 검수에서 적발. 판정 IPC 가 거절되면(창이 내려가는 중 · 브리지
     * 오류) 이 요청에 아무 답도 안 나갔고, 어댑터는 영원히 멈춰 있었다.
     * 카드도 오류도 없이 대화가 죽는 모양이라 원인을 알 길도 없었다.
     */
    const t = fakeTransport();
    const askUser = vi.fn(async () => null);
    const notices: string[] = [];
    createAcpClient(t.transport, {
      verdict: async () => {
        throw new Error('bridge down');
      },
      askUser,
      onProtocolNotice: (m) => notices.push(m),
    });

    t.emit(permissionRequest('/vault/notes.md'));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());

    // 못 정하면 묻는 쪽으로 떨어지고, 사용자가 답을 안 했으므로 거절이다.
    expect(askUser).toHaveBeenCalledTimes(1);
    expect(outcomeOf(t.sent, 7)).toEqual({ outcome: 'selected', optionId: 'reject' });
    expect(notices.some((m) => m.startsWith('verdict-failed'))).toBe(true);
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

describe('ACP 클라이언트 — 답이 안 오면 언젠가 끝난다', () => {
  it.each([
    ['initialize', (client: ReturnType<typeof createAcpClient>) => client.initialize()],
    [
      'session/prompt',
      (client: ReturnType<typeof createAcpClient>) =>
        client.prompt('s-1', [{ type: 'text', text: '이 폴더를 훑어봐' }]),
    ],
  ])('%s 전송이 거절되면 timeout 없이 즉시 실패하고 늦은 답은 무시한다', async (method, run) => {
    const t = rejectingTransport();
    const notices: string[] = [];
    const client = createAcpClient(t.transport, {
      verdict: alwaysAsk,
      askUser: async () => null,
      onProtocolNotice: (message) => notices.push(message),
    });
    let failure: unknown;
    const settled = run(client).catch((error: unknown) => {
      failure = error;
    });

    await vi.waitFor(() => expect(notices).toContain('send-failed: Error: bridge down'));
    try {
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).toContain(`acp-send-failed: ${method}`);
      t.emit({ jsonrpc: '2.0', id: 1, result: { stopReason: 'late' } });
      expect(String(failure)).toContain(`acp-send-failed: ${method}`);
    } finally {
      client.dispose();
      await settled;
    }
  });

  it('악수에 답이 없으면 시간이 지나 실패한다 — 「켜는 중」에 붙박이지 않는다', async () => {
    /*
     * 2026-08-16 검수에서 적발. 어댑터가 뜨긴 했는데 답을 안 하는 상태(잘못된
     * 바이너리 · npx 가 무언가를 기다리는 중)에서 상태가 「켜는 중」에 붙박였고,
     * 그 상태에서는 「새 대화」도 잠겨 있어 패널을 닫는 것 말고 길이 없었다.
     */
    vi.useFakeTimers();
    try {
      const t = fakeTransport();
      const client = createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });
      // 타이머를 움직이기 전에 거절 관찰자를 붙인다. 늦게 붙이면 동작은 맞아도
      // Vitest가 그 사이의 거절을 unhandled rejection으로 판정한다.
      const timedOut = expect(client.initialize()).rejects.toThrow(/acp-timeout/);
      // 답을 한 줄도 안 준다.
      await vi.advanceTimersByTimeAsync(60_000);
      await timedOut;
    } finally {
      vi.useRealTimers();
    }
  });

  it('대화 한 턴에는 시간을 안 준다 — 오래 걸리는 것이 정상인 일이다', async () => {
    vi.useFakeTimers();
    try {
      const t = fakeTransport();
      const client = createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });
      let settled = false;
      void client.prompt('s-1', [{ type: 'text', text: '이 폴더를 훑어봐' }]).then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(settled, '오래 걸린다고 대화를 끊으면 안 된다').toBe(false);
      client.dispose();
    } finally {
      vi.useRealTimers();
    }
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
