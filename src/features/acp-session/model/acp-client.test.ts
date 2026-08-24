import { describe, expect, it, vi } from 'vitest';

import {
  createAcpClient,
  toPermissionRequest,
  type AcpPermissionRequest,
  type AcpTransport,
} from './acp-client';

/** A fake channel that can carry lines. Measures the protocol with no real process. */
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
    /** A line the agent sent to us. */
    emit(payload: unknown) {
      listener?.(JSON.stringify(payload));
    },
    emitRaw(line: string) {
      listener?.(line);
    },
    /** Answers the last request we sent. */
    reply(result: unknown) {
      const last = [...sent].reverse().find((m) => typeof m.id === 'number');
      listener?.(JSON.stringify({ jsonrpc: '2.0', id: last?.id, result }));
    },
  };
}

/** A channel where every IPC send is rejected, as in the race while the WebView goes down. */
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

/** The shape of a permission request as actually received in measurement (2026-08-16). */
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
    // Staying silent leaves the other side waiting forever, and to the user that looks only like "it froze".
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
     * Caught in the 2026-08-16 review. When the verdict IPC was rejected (the window closing, a bridge
     * error) no answer went out for this request and the adapter stalled forever. The conversation died
     * with neither a card nor an error, leaving no way to learn the cause.
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

    // Undecidable falls through to asking, and since the user gave no answer it is a rejection.
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
     * Measured: that option's `_meta.permission` carries a rule granting "this entire directory for the
     * whole session". Widening the boundary is the user's decision alone.
     */
    const t = fakeTransport();
    createAcpClient(t.transport, { verdict: insideVault, askUser: async () => null });

    t.emit(permissionRequest('/vault/notes.md'));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());
    expect(outcomeOf(t.sent, 7)?.optionId).not.toBe('allow_always');
  });

  it('화면이 그 요청에 없는 선택지를 돌려주면 거절로 떨어진다', async () => {
    // A screen bug returning a stale request's value must not be allowed to permit the wrong thing.
    const t = fakeTransport();
    createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => 'not-an-option' });

    t.emit(permissionRequest('/outside/notes.md'));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 7)).toBeTruthy());
    expect(outcomeOf(t.sent, 7)).toMatchObject({ optionId: 'reject' });
  });

  it('경로를 모르면 묻는다 — 판단할 수 없는 것을 통과시키지 않는다', async () => {
    const t = fakeTransport();
    const askUser = vi.fn(async () => null);
    // Even given a verdict that answers "inside the vault", the verdict itself is meaningless with no path.
    createAcpClient(t.transport, {
      verdict: async (filePath) => (filePath ? 'allow-inside-vault' : 'ask'),
      askUser,
    });

    const request = permissionRequest('/vault/notes.md', 11) as {
      params: { toolCall: { rawInput: Record<string, unknown> } };
    };
    request.params.toolCall.rawInput = {}; // no path
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

  it('아직 재 보지 않은 모드는 목록에 남기되 안전 상태도 함께 돌려준다', async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });

    const pending = client.newSession({ cwd: '/vault' });
    t.reply({
      sessionId: 's-1',
      modes: {
        currentModeId: 'default',
        availableModes: [
          { id: 'default', name: 'Default' },
          { id: 'turbo-yolo', name: 'Turbo' },
          { id: 'bypassPermissions', name: 'Bypass' },
          { name: 'No identifier' },
        ],
      },
    });

    await expect(pending).resolves.toMatchObject({
      choices: {
        modes: [
          { id: 'default', name: 'Default' },
          { id: 'turbo-yolo', name: 'Turbo' },
        ],
        unverifiedModeIds: ['turbo-yolo'],
        droppedModeCount: 1,
      },
    });
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
     * Caught in the 2026-08-16 review. With the adapter up but not answering (a wrong binary, or npx
     * waiting on something), the status stuck at "starting", and in that state "new conversation" was
     * locked too, leaving no way out but closing the panel.
     */
    vi.useFakeTimers();
    try {
      const t = fakeTransport();
      const client = createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });
      // Attach the rejection observer before advancing the timers. Attached late, the behaviour is
      // still right but Vitest judges the rejection in between as unhandled.
      const timedOut = expect(client.initialize()).rejects.toThrow(/acp-timeout/);
      // Not one line of answer is given.
      await vi.advanceTimersByTimeAsync(60_000);
      await timedOut;
    } finally {
      vi.useRealTimers();
    }
  });

  it('내려받는 중에는 악수 시계가 다시 시작된다 — 첫 대화가 영영 안 열리던 자리다', async () => {
    /*
     * Owner's installed app, 2026-08-24. The first launch of `codex-acp` fetches 274 MB through
     * `npx`; nothing answers `initialize` until it lands, so the 45s ceiling expired, the child was
     * killed mid-download, and the panel said "the tool is not responding". Deleting the half-built
     * cache and retrying failed at the same second, so below roughly 6 MB/s the first conversation
     * could never open. Progress is proof of life and restarts the clock.
     */
    vi.useFakeTimers();
    try {
      const t = fakeTransport();
      const client = createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });
      let settled: unknown = null;
      const handshake = client.initialize().then(
        (value) => (settled = { ok: value }),
        (error: unknown) => (settled = { failed: error }),
      );

      // Four minutes of downloading — far past the 45s ceiling — with a progress notice each 30s.
      for (let elapsed = 0; elapsed < 240_000; elapsed += 30_000) {
        await vi.advanceTimersByTimeAsync(30_000);
        client.extendPendingDeadlines();
      }
      expect(settled, 'a download that keeps advancing must not be called a timeout').toBeNull();

      // The download lands and the adapter finally answers.
      t.emit({ jsonrpc: '2.0', id: 1, result: { protocolVersion: 1 } });
      await handshake;
      expect(settled).toEqual({ ok: { protocolVersion: 1 } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('내려받기가 멎으면 예전 그대로 시간이 지나 실패한다', async () => {
    // The ceiling keeps its meaning: 45s with **no sign of life**. Extending it only while progress
    // arrives must not turn a genuinely stalled fetch into an endless wait.
    vi.useFakeTimers();
    try {
      const t = fakeTransport();
      const client = createAcpClient(t.transport, { verdict: alwaysAsk, askUser: async () => null });
      const timedOut = expect(client.initialize()).rejects.toThrow(/acp-timeout/);
      // One burst of progress, then the fetch stalls.
      await vi.advanceTimersByTimeAsync(30_000);
      client.extendPendingDeadlines();
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
        { kind: 'reject_once' }, // no optionId — unusable
        { optionId: 'x' }, // no kind — unusable
      ],
      toolCall: {
        toolCallId: 'tool-write-notes',
        title: 'Write notes.md',
        kind: 'edit',
        rawInput: { file_path: '/vault/notes.md' },
      },
    });
    expect(parsed.toolCallId).toBe('tool-write-notes');
    expect(parsed.filePath).toBe('/vault/notes.md');
    expect(parsed.toolKind).toBe('edit');
    expect(parsed.rawInput).toEqual({ file_path: '/vault/notes.md' });
    expect(parsed.reviewKind).toBe('permission');
    expect(parsed.options).toEqual([{ optionId: 'a', kind: 'allow_once', name: 'Allow' }]);
  });

  it('모양이 달라도 터지지 않는다 — 어댑터가 바뀌어도 대화가 죽지 않아야 한다', () => {
    expect(toPermissionRequest({})).toEqual({
      title: null,
      toolCallId: null,
      // Null when even the tool name is unknown — the MCP auto-allow verdict reads this value.
      toolName: null,
      toolKind: null,
      filePath: null,
      rawInput: {},
      reviewKind: 'permission',
      options: [],
    });
  });

  it('제목이 없으면 도구가 남긴 문장을 읽는다 — 서버가 스스로 묻는 자리다', () => {
    /*
     * Wire capture, 2026-08-24. The vault server pauses a write with `elicitation/create`;
     * `codex-acp` forwards it as `session/request_permission` with **no `toolCall.title`**, putting
     * the question in `toolCall.content[]`. The screen was reading only `title`, so the one sentence
     * that makes the decision answerable never reached the card, which then printed two lines of
     * "unknown" instead.
     */
    const parsed = toPermissionRequest({
      options: [{ kind: 'allow_once', optionId: 'accept', name: 'Accept' }],
      toolCall: {
        toolCallId: 'elicitation-ontology-atlas',
        kind: 'other',
        content: [
          {
            type: 'content',
            content: { type: 'text', text: 'Create concept wire-probe. Apply this change to the vault?' },
          },
        ],
        rawInput: { serverName: 'ontology-atlas' },
      },
    });
    expect(parsed.title).toBe('Create concept wire-probe. Apply this change to the vault?');
  });

  it('제목이 있으면 제목이 이긴다 — 규약이 이름 붙인 자리다', () => {
    const parsed = toPermissionRequest({
      toolCall: {
        title: 'Write notes.md',
        content: [{ type: 'content', content: { type: 'text', text: 'ignore me' } }],
      },
    });
    expect(parsed.title).toBe('Write notes.md');
  });
});
