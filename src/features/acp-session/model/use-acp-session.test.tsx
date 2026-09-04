import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * **Never start two adapters.**
 *
 * Why this test is at the hook level: the defect surfaced only on the real thing, 2026-08-16 — one
 * conversation window, two processes:
 * ```
 * 83796  npm exec @agentclientprotocol/claude-agent-acp@0.68.0
 * 83797  npm exec @agentclientprotocol/claude-agent-acp@0.68.0
 * ```
 * The session id points at the later one while the lines travel over the earlier, so talking to it
 * dies with `Session not found`, and the first process becomes a ghost nobody stops.
 *
 * ⚠️ **A widget-level test was tried first and did not catch it.** There the effect ran only once,
 * so deliberately delaying the lock still went green — a test that passed for the wrong reason. The
 * real condition is "**called again while starting**", so that is constructed directly here.
 */

const bridge = vi.hoisted(() => ({
  starts: 0,
  /** A handle to hold process startup — this is what creates "while starting". */
  release: null as (() => void) | null,
  listener: null as ((line: string) => void) | null,
  /** The adapter's diagnostic output — the only window onto "it never moves past starting". */
  stderr: null as ((line: string) => void) | null,
  /** Notices sent by the shell — the fact that the permission gate could not be raised arrives this way. */
  notice: null as ((message: string) => void) | null,
  /** Per-session exit callbacks — kept so an already-queued earlier event can be fired again. */
  exits: new Map<string, () => void>(),
  /** Reproduces a failure to apply the session-mode permission gate. */
  failSetMode: false,
  /** The `modes` block `session/new` answers with. Null means the adapter advertised none. */
  sessionModes: null as unknown,
  stopped: [] as string[],
  /** The requests we sent — the only window onto "what did we put on the wire". */
  sent: [] as Array<{ id?: number; method?: string; params?: unknown }>,
}));

vi.mock('@/shared/lib/tauri-acp', () => ({
  isAcpBridgeAvailable: () => true,
  startAcpSession: async () => {
    bridge.starts += 1;
    // The first call is held — meanwhile a second one gets its chance to enter.
    await new Promise<void>((resolve) => {
      bridge.release = resolve;
    });
    return `acp-${bridge.starts}`;
  },
  /*
   * The handshake **is answered.** With no answer the session never stands, and then this test
   * measures "is there no response" rather than "did the lock hold".
   */
  sendAcpLine: async (_id: string, line: string) => {
    const message = JSON.parse(line) as { id?: number; method?: string; params?: unknown };
    bridge.sent.push(message);
    if (typeof message.id !== 'number') return;
    if (message.method === 'session/set_mode' && bridge.failSetMode) {
      queueMicrotask(() =>
        bridge.listener?.(
          JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32603, message: 'mode rejected' },
          }),
        ),
      );
      return;
    }
    const result =
      message.method === 'session/new' || message.method === 'session/load'
        ? { sessionId: 's-1', ...(bridge.sessionModes ? { modes: bridge.sessionModes } : {}) }
        : { protocolVersion: 1 };
    queueMicrotask(() =>
      bridge.listener?.(JSON.stringify({ jsonrpc: '2.0', id: message.id, result })),
    );
  },
  stopAcpSession: async (id: string) => {
    bridge.stopped.push(id);
  },
  acpPermissionVerdict: async () => 'ask',
  listenToAcpSession: async (
    id: string,
    handlers: {
      onMessage?: (line: string) => void;
      onStderr?: (line: string) => void;
      onNotice?: (message: string) => void;
      onExit?: () => void;
    },
  ) => {
    bridge.listener = handlers.onMessage ?? null;
    bridge.stderr = handlers.onStderr ?? null;
    bridge.notice = handlers.onNotice ?? null;
    if (handlers.onExit) bridge.exits.set(id, handlers.onExit);
    return () => {
      bridge.listener = null;
      bridge.stderr = null;
      bridge.notice = null;
      bridge.exits.delete(id);
    };
  },
}));

import { useAcpSession } from './use-acp-session';

afterEach(() => {
  bridge.starts = 0;
  bridge.release = null;
  bridge.listener = null;
  bridge.stderr = null;
  bridge.notice = null;
  bridge.exits.clear();
  bridge.failSetMode = false;
  bridge.sessionModes = null;
  bridge.stopped = [];
  bridge.sent = [];
});

describe('세션 하나 — 겹쳐 불러도 프로세스는 하나', () => {
  it('띄우는 중에 또 부르면 두 번째는 아무것도 안 한다', async () => {
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }),
    );

    // Start the first attempt and **hold it** — this moment is "while starting".
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));

    // Call twice more in that state — the condition that occurred on the real thing.
    await act(async () => {
      await Promise.all([result.current.start(), result.current.start()]);
    });

    expect(
      bridge.starts,
      '띄우는 중에 또 띄우면 어댑터가 둘이 되고, 세션 번호와 줄이 어긋난다',
    ).toBe(1);

    /*
     * Cleanup — release the hold and close the session. Closing rejects the call that was awaiting an
     * answer, and `start` absorbs that itself and leaves only the status (that is the contract).
     */
    await act(async () => {
      bridge.release?.();
      await result.current.stop();
      await first;
    });
  });

  it('띄우는 도중에 닫으면 그 프로세스를 스스로 끈다 — 유령을 안 남긴다', async () => {
    /*
     * A test caught this one first too. `stop()` cleans up something that does not exist yet and
     * returns, after which `start()` runs on and **creates the process and client anyway** — the
     * adapter keeps running behind a closed screen.
     */
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));

    // Close at the moment the process has not started yet.
    await act(async () => {
      await result.current.stop();
      bridge.release?.();
      await first;
    });

    expect(bridge.stopped, '띄우던 것을 안 끄면 닫은 뒤에도 어댑터가 돈다').toContain('acp-1');
  });

  it('띄우기가 실패하면 잠금이 풀린다 — 다시는 못 띄우는 상태로 남지 않는다', async () => {
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));

    // Close **after** the session fully stands — this test is "can it reopen after closing".
    await act(async () => {
      bridge.release?.();
      await first;
    });
    await act(async () => {
      await result.current.stop();
    });

    // After cleanup it must be startable again.
    const second = result.current.start();
    await waitFor(() =>
      expect(bridge.starts, '정리 뒤에 다시 못 띄우면 대화를 새로 열 수 없다').toBe(2),
    );
    await act(async () => {
      bridge.release?.();
      await result.current.stop();
      await second;
    });
  });

  it('이전 세션의 늦은 종료 이벤트가 새 세션을 끝내지 않는다', async () => {
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });
    const oldExit = bridge.exits.get('acp-1');
    expect(oldExit).toBeTruthy();

    const switching = result.current.switchSession(null);
    await waitFor(() => expect(bridge.starts).toBe(2));
    await act(async () => {
      bridge.release?.();
      await switching;
    });
    expect(result.current.status).toBe('ready');

    act(() => oldExit?.());
    expect(result.current.status, '끝난 이전 세션이 새 세션을 exited로 바꿨다').toBe('ready');

    await act(async () => {
      await result.current.send('새 세션은 살아 있어야 해');
    });
    expect(bridge.sent.filter((message) => message.method === 'session/prompt')).toHaveLength(1);

    await act(async () => {
      await result.current.stop();
    });
  });
});

describe('진단 — 모아 두되 평소에는 안 보여 준다', () => {
  it('진짜 단서는 모으고, npm 경고 같은 소음은 안 모은다', async () => {
    /*
     * This spot was fixed twice in one day. At first nobody listened to stderr, so the adapter's last
     * words vanished entirely; once it was listened to, two paragraphs of English npm warnings sat
     * permanently at the top of the conversation **with nothing wrong at all** (owner's screen).
     * A diagnostic is a clue when something breaks, not something to read routinely.
     */
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });

    await waitFor(() => expect(bridge.stderr).toBeTruthy());
    act(() => {
      bridge.stderr?.('npm warn Unknown env config "_jsr-registry".');
      bridge.stderr?.('Authentication required');
      bridge.stderr?.('   ');
    });

    await waitFor(() => expect(result.current.diagnostics).toEqual(['Authentication required']));
    // A diagnostic is **neither a bubble nor a notice row** — mixed into the conversation it is noise.
    expect(result.current.events.filter((e) => e.kind === 'notice')).toHaveLength(0);

    await act(async () => {
      await result.current.stop();
    });
  });
});

describe('볼트 서버 — 꽂았을 때만 꽂혔다고 말한다', () => {
  it('서버를 넘기면 session/new 가 그것을 싣고, 지시문도 그렇게 말한다', async () => {
    /*
     * Raised in the 2026-08-16 review: **no test verified** that this app's agent actually receives our
     * MCP tools. A single comment (a measurement record) was the only evidence.
     */
    const { result } = renderHook(() =>
      useAcpSession({
        runtimeId: 'claude-acp',
        vaultRoot: '/vault',
        mcpServers: [{ name: 'atlas-vault', command: '/app/ontology-atlas-mcp', args: [] }],
      }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });

    const call = bridge.sent.find((m) => m.method === 'session/new');
    expect(call, 'session/new 자체가 안 나갔다').toBeTruthy();
    const params = call?.params as Record<string, unknown>;
    expect(params.mcpServers).toEqual([
      { name: 'atlas-vault', command: '/app/ontology-atlas-mcp', args: [] },
    ]);
    const meta = params._meta as { systemPrompt?: { append?: string } } | undefined;
    expect(meta?.systemPrompt?.append).toContain('atlas-vault');

    await act(async () => {
      await result.current.stop();
    });
  });

  it('서버가 없으면 **연결됐다고 말하지 않는다** — 없는 도구를 찾게 두지 않는다', async () => {
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });

    const call = bridge.sent.find((m) => m.method === 'session/new');
    const params = call?.params as Record<string, unknown>;
    const meta = params._meta as { systemPrompt?: { append?: string } } | undefined;
    expect(meta?.systemPrompt?.append).not.toContain('atlas-vault');
    // The remaining rules (write the why, do not leave the folder) stay as they are.
    expect(meta?.systemPrompt?.append).toContain('`why`');

    await act(async () => {
      await result.current.stop();
    });
  });
});

describe('Codex 권한 바닥 — 대화가 준비되기 전에 read-only를 건다', () => {
  it('새 세션마다 read-only 모드를 적용하고 실패하면 ready가 되지 않는다', async () => {
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'codex-acp', vaultRoot: '/vault' }),
    );
    bridge.failSetMode = true;
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });

    const modeCall = bridge.sent.find((message) => message.method === 'session/set_mode');
    expect(modeCall?.params).toEqual({ sessionId: 's-1', modeId: 'read-only' });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('gate-mode-failed:read-only');

    await act(async () => {
      await result.current.stop();
    });
  });
});

describe('이어받은 대화 — 규칙이 달라지지 않는다', () => {
  it('session/load 에도 새 대화와 같은 지시가 실린다', async () => {
    /*
     * Review 2026-08-16: the instructions were attached **to new conversations only**. So a session
     * resumed from "past conversations" ran under different rules — no requirement to write the reason
     * when changing a relation, no requirement to stay inside the folder. If a conversation started
     * yesterday and one started today behave differently on the same screen and folder, it is not a rule.
     */
    const { result } = renderHook(() =>
      useAcpSession({
        runtimeId: 'claude-acp',
        vaultRoot: '/vault',
        mcpServers: [{ name: 'atlas-vault' }],
      }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });

    // Resume a past conversation, releasing the held process startup in between — wrapping it in
    // `await` leaves no chance to release, and the test stalls itself.
    const switching = result.current.switchSession('s-old');
    await waitFor(() => expect(bridge.starts).toBe(2));
    await act(async () => {
      bridge.release?.();
      await switching;
    });

    await waitFor(() =>
      expect(bridge.sent.some((m) => m.method === 'session/load')).toBe(true),
    );
    const load = bridge.sent.find((m) => m.method === 'session/load');
    const meta = (load?.params as Record<string, unknown>)?._meta as
      | { systemPrompt?: { append?: string } }
      | undefined;
    expect(meta?.systemPrompt?.append, '이어받은 대화에 지시가 안 실렸다').toContain('`why`');

    await act(async () => {
      await result.current.stop();
    });
  });
});

describe('세션 지시문 — 실측으로 얻은 네 줄이 실제로 실린다', () => {
  /**
   * Experiment 2026-08-16 (same vault, same task, five runs against the real adapter):
   *
   * | | current instructions | new instructions |
   * |---|---|---|
   * | given an overlapping concept | **created a new node without asking** | found it, reported, and stopped |
   * | elapsed | 88s | 50s · 45s |
   * | reading shell/files directly | 2× | **0×** |
   * | duplicate check | never | every time |
   *
   * This test does not pin the sentences themselves (the wording will keep being refined). What it
   * pins is **whether those four instructions actually go out with the session** — without that, the
   * table above means nothing.
   */
  it('순서 · 중복 확인 · 애매하면 묻기 · 손으로 읽지 않기 가 전부 실린다', async () => {
    const { result } = renderHook(() =>
      useAcpSession({
        runtimeId: 'claude-acp',
        vaultRoot: '/vault',
        mcpServers: [{ name: 'atlas-vault' }],
      }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });

    const call = bridge.sent.find((m) => m.method === 'session/new');
    const meta = (call?.params as Record<string, unknown>)?._meta as
      | { systemPrompt?: { append?: string } }
      | undefined;
    const prompt = meta?.systemPrompt?.append ?? '';

    // ① do not bypass the tools
    expect(prompt, '손으로 훑지 말라는 지시가 없다').toMatch(/Do not shell out/);
    // ② the order
    expect(prompt, '작업 순서가 없다').toMatch(/Work in this order/);
    // ③ look before creating
    expect(prompt, '중복을 먼저 찾으라는 지시가 없다').toMatch(/similar_nodes|find_evidence/);
    // Map navigation must lead to an exact read tool call, not inferred answer sentences.
    expect(prompt, '지도 검색과 경로 요청이 exact read tool로 이어지지 않는다').toMatch(
      /get_concept.*find_path.*move and highlight the map/i,
    );
    // ④ If ambiguous, ask — the line changed most in actual measurement
    expect(prompt, '애매할 때 묻지 않고 만들게 된다').toMatch(/Ask first/);
    // ⑤ answer in the language the person wrote in
    expect(prompt, '한국어로 물었는데 영어로 답한다').toMatch(/language the person wrote in/);
    // ⑥ compiler declarations and map lines are different censuses; collapsing them made 222 and
    // 141 look like contradictory answers in the installed app on 2026-09-03.
    expect(prompt, 'MCP 선언 수와 지도 선 수를 같은 관계 수로 말하게 된다').toMatch(
      /relationCensus.*graph\.edges.*compiled frontmatter relation declarations.*deduplicated normalized typed edges.*not the current view filter/i,
    );

    await act(async () => {
      await result.current.stop();
    });
  });
});

describe('관문을 못 세웠으면 화면이 말한다', () => {
  it('`gate-off:` 로 온 알림은 접어 두지 않고 대화에 남는다', async () => {
    /*
     * Review 2026-08-16: a failure while building the isolated config was swallowed by `.ok()`, and
     * the session came up inheriting the user's global config — what that state means was measured and
     * recorded by `acp.rs` itself: "it wrote files outside the working folder without ever asking, and
     * even ran a terminal." Yet the screen kept calling that runtime "gated".
     */
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });

    await waitFor(() => expect(bridge.notice).toBeTruthy());
    act(() => {
      bridge.notice?.('gate-off:isolation-failed:settings-write-failed');
      bridge.notice?.('dropped-line:something');
    });

    await waitFor(() =>
      expect(
        result.current.events.some((e) => e.kind === 'notice' && e.text === 'gate-off'),
        '관문이 없다는 사실이 화면에 안 나온다',
      ).toBe(true),
    );
    // The remaining diagnostics stay folded — mixed into the conversation they are noise.
    expect(result.current.events.filter((e) => e.kind === 'notice')).toHaveLength(1);
    expect(result.current.diagnostics.join(' ')).toContain('settings-write-failed');

    await act(async () => {
      await result.current.stop();
    });
  });
});

describe('도구 입력 refinement — 실제 Claude ACP 순서', () => {
  it('status 없는 tool_call_update가 뒤늦게 보낸 rawInput을 기존 도구 행에 합친다', async () => {
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }),
    );
    const starting = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await starting;
    });

    act(() => {
      bridge.listener?.(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId: 's-1',
            update: {
              sessionUpdate: 'tool_call',
              toolCallId: 'tool-read-1',
              title: 'mcp__atlas-vault__get_concept',
              kind: 'read',
              status: 'pending',
            },
          },
        }),
      );
      // claude-agent-acp sends this refinement without status once streamed input is complete.
      bridge.listener?.(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId: 's-1',
            update: {
              sessionUpdate: 'tool_call_update',
              toolCallId: 'tool-read-1',
              rawInput: { slug: 'capabilities/mcp-server', body: 'full' },
              title: 'mcp__atlas-vault__get_concept',
              kind: 'read',
            },
          },
        }),
      );
    });

    await waitFor(() =>
      expect(result.current.events.find((event) => event.id === 'tool-read-1')).toMatchObject({
        kind: 'tool',
        status: 'pending',
        rawInput: { slug: 'capabilities/mcp-server', body: 'full' },
      }),
    );

    await act(async () => {
      await result.current.stop();
    });
  });
});

describe('권한 카드 — 겹친 요청도 하나씩, 둘 다 답을 받는다', () => {
  it('두 번째 요청이 첫 카드를 덮어쓰지 않고, 두 JSON-RPC id 모두 답장이 나간다', async () => {
    /*
     * Caught in the 2026-09-01 review. With a single resolver slot, the second concurrent
     * `session/request_permission` (parallel tool calls in one turn) replaced the first card's
     * resolver: the first request's id was never answered and the agent hung on it for the rest
     * of the session.
     */
    const { result } = renderHook(() =>
      useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });

    const permissionRequest = (id: number, path: string) =>
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'session/request_permission',
        params: {
          sessionId: 's-1',
          options: [
            { kind: 'reject_once', name: 'Deny', optionId: 'reject' },
            { kind: 'allow_once', name: 'Allow', optionId: 'allow' },
          ],
          toolCall: {
            toolCallId: `tool-${id}`,
            title: `Write ${path}`,
            kind: 'edit',
            rawInput: { file_path: path },
          },
        },
      });

    // Two requests in one turn — the adapter is free to overlap them.
    await act(async () => {
      bridge.listener?.(permissionRequest(101, '/outside/a.md'));
      bridge.listener?.(permissionRequest(102, '/outside/b.md'));
    });

    // The first card presents alone, and answering it answers **its own** id.
    await waitFor(() => expect(result.current.pending).toBeTruthy());
    expect(result.current.pending?.request.filePath).toBe('/outside/a.md');
    await act(async () => {
      result.current.pending?.resolve('allow');
    });
    await waitFor(() =>
      expect(bridge.sent.some((m) => m.id === 101 && 'result' in m)).toBe(true),
    );

    // Only then does the second card present — and its id is answered too.
    await waitFor(() => expect(result.current.pending?.request.filePath).toBe('/outside/b.md'));
    await act(async () => {
      result.current.pending?.resolve('reject');
    });
    await waitFor(() =>
      expect(bridge.sent.some((m) => m.id === 102 && 'result' in m)).toBe(true),
    );

    await act(async () => {
      await result.current.stop();
    });
  });
});

/**
 * **The adapter can move the session on its own, and the screen has to follow it.**
 *
 * Read from `@agentclientprotocol/claude-agent-acp@0.74.0` `dist/session-mode.js` on 2026-09-05:
 * `AUTO_MODE_FALLBACK = "acceptEdits"`. Selecting `auto` on a model without `supportsAutoMode`, or
 * switching to such a model afterwards, silently moves the session to `acceptEdits` and announces it
 * with `{ sessionUpdate: "current_mode_update", currentModeId }` — nothing else.
 *
 * The dispatcher ignored that notification. So the session could land in a mode this repository
 * measured to remove the permission gate while the dropdown still read whatever was picked, and
 * nothing on screen said the promise had stopped being kept. `gate-off` is the sentence that already
 * exists for exactly this fact; it is reused rather than invented.
 */
describe('the adapter moves the session itself', () => {
  const CLAUDE_MODES = {
    currentModeId: 'default',
    availableModes: [
      { id: 'default', name: 'Manual', _meta: { kind: 'standard' } },
      { id: 'plan', name: 'Plan', _meta: { kind: 'plan' } },
      { id: 'auto', name: 'Auto', _meta: { kind: 'auto_review' } },
    ],
  };

  async function started() {
    bridge.sessionModes = CLAUDE_MODES;
    const hook = renderHook(() => useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }));
    const first = hook.result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });
    return hook;
  }

  function moveTo(currentModeId: string) {
    act(() => {
      bridge.listener?.(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'session/update',
          params: { sessionId: 's-1', update: { sessionUpdate: 'current_mode_update', currentModeId } },
        }),
      );
    });
  }

  it('follows a clamp into a gate-removing mode and stops claiming the gate stands', async () => {
    const { result } = await started();
    expect(result.current.choices.currentModeId).toBe('default');
    // `auto` never reaches the list in the first place.
    expect(result.current.choices.modes.map((m) => m.id)).toEqual(['default', 'plan']);

    moveTo('acceptEdits');

    await waitFor(() => expect(result.current.choices.currentModeId).toBe('acceptEdits'));
    // Following the session is not the same as offering the mode back: it stays unselectable.
    expect(result.current.choices.modes.map((m) => m.id)).toEqual(['default', 'plan']);
    expect(
      result.current.events.some((e) => e.kind === 'notice' && e.text === 'gate-off'),
      'the screen still claims a gate it no longer has',
    ).toBe(true);
    expect(result.current.diagnostics.join(' ')).toContain('acceptEdits');

    await act(async () => {
      await result.current.stop();
    });
  });

  it('follows a move into an offered mode without crying gate-off', async () => {
    const { result } = await started();

    moveTo('plan');

    await waitFor(() => expect(result.current.choices.currentModeId).toBe('plan'));
    expect(result.current.events.some((e) => e.kind === 'notice')).toBe(false);

    await act(async () => {
      await result.current.stop();
    });
  });

  it('ignores a notification carrying no mode id', async () => {
    const { result } = await started();

    moveTo('');

    expect(result.current.choices.currentModeId).toBe('default');
    expect(result.current.events.some((e) => e.kind === 'notice')).toBe(false);

    await act(async () => {
      await result.current.stop();
    });
  });
});

/**
 * **A session can *begin* in a gate-removing mode, and nothing was judging that.**
 *
 * The clamp path above re-runs the safety verdict, but the start path did not: whatever
 * `session/new` or `session/load` reported as `currentModeId` went straight into the state. Only
 * `GATED_SESSION_MODE` was consulted, and that names `codex-acp` alone — so a claude session that
 * opened on `acceptEdits` (a resumed conversation is the obvious way: `session/load` reports the
 * mode the conversation was left in) set the value with no verdict, raised no notice, and left the
 * Select rendering its placeholder because the mode is not on the offered list. The screen went
 * quiet on exactly the value that decides whether a person is asked.
 *
 * Beginning in a mode and being moved into it are the same fact about the same session, so they get
 * the same treatment: state it, never offer it back, and say `gate-off`.
 */
describe('a session that begins in a mode the filter hides', () => {
  const AVAILABLE = [
    { id: 'default', name: 'Manual', _meta: { kind: 'standard' } },
    { id: 'plan', name: 'Plan', _meta: { kind: 'plan' } },
    { id: 'auto', name: 'Auto', _meta: { kind: 'auto_review' } },
  ];

  async function startedWith(modes: unknown) {
    bridge.sessionModes = modes;
    const hook = renderHook(() => useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault' }));
    const first = hook.result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });
    return hook;
  }

  it('states an opening gate-removing mode and stops claiming the gate stands', async () => {
    const { result } = await startedWith({ currentModeId: 'acceptEdits', availableModes: AVAILABLE });

    expect(result.current.status).toBe('ready');
    expect(result.current.choices.currentModeId).toBe('acceptEdits');
    // Stating where the session is never means handing the mode back as a choice.
    expect(result.current.choices.modes.map((m) => m.id)).toEqual(['default', 'plan']);
    expect(
      result.current.events.some((e) => e.kind === 'notice' && e.text === 'gate-off'),
      'the conversation opened with no gate and said nothing',
    ).toBe(true);
    expect(result.current.diagnostics.join(' ')).toContain('mode-initial:acceptEdits');

    await act(async () => {
      await result.current.stop();
    });
  });

  it('shows an opening mode nobody advertised, marked unchecked', async () => {
    const { result } = await startedWith({
      currentModeId: 'brand-new',
      availableModes: [AVAILABLE[0], AVAILABLE[1]],
    });

    expect(result.current.choices.currentModeId).toBe('brand-new');
    expect(result.current.choices.modes.map((m) => m.id)).toEqual(['default', 'plan', 'brand-new']);
    expect(result.current.choices.unverifiedModeIds).toContain('brand-new');
    // Unmeasured is not the same as measured dangerous — no alarm is raised for it.
    expect(result.current.events.some((e) => e.kind === 'notice')).toBe(false);

    await act(async () => {
      await result.current.stop();
    });
  });

  it('says nothing when the session opens on a mode that still asks', async () => {
    const { result } = await startedWith({ currentModeId: 'default', availableModes: AVAILABLE });

    expect(result.current.choices.currentModeId).toBe('default');
    expect(result.current.choices.modes.map((m) => m.id)).toEqual(['default', 'plan']);
    expect(result.current.events.some((e) => e.kind === 'notice')).toBe(false);

    await act(async () => {
      await result.current.stop();
    });
  });
});
