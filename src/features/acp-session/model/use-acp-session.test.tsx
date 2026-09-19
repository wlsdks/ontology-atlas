import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcpWorkReceipt } from '@/shared/lib/acp-work-receipt';

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
  holdPrompt: false,
  pendingPrompt: null as number | null,
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
    if (message.method === 'session/prompt' && bridge.holdPrompt) {
      bridge.pendingPrompt = message.id;
      return;
    }
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

import { snapshotPermissionRequest, useAcpSession } from './use-acp-session';
import { unavailableTaskBaseline } from './task-baseline';

describe('queued permission identity', () => {
  it('snapshots and freezes each request raw guards and options independently', () => {
    const make = (id: number) => ({
      requestId: id, sessionId: 's-1', title: 'patch', toolCallId: `tool-${id}`,
      toolName: 'mcp__atlas-vault__patch_concept', toolKind: 'other' as const,
      filePath: null, reviewKind: 'ontology-write' as const,
      rawInput: { slug: `capabilities/${id}`, expected_mtime: id, confirm: true },
      options: [{ optionId: `allow-${id}`, kind: 'allow_once', name: 'Allow' }],
    });
    const first = make(1); const second = make(2);
    const queuedFirst = snapshotPermissionRequest(first);
    const queuedSecond = snapshotPermissionRequest(second);
    first.rawInput.expected_mtime = 99; first.options[0].optionId = 'mutated-first';
    second.rawInput.confirm = false; second.options[0].optionId = 'mutated-second';
    expect(queuedFirst.rawInput).toEqual({ slug: 'capabilities/1', expected_mtime: 1, confirm: true });
    expect(queuedFirst.options[0].optionId).toBe('allow-1');
    expect(queuedSecond.rawInput).toEqual({ slug: 'capabilities/2', expected_mtime: 2, confirm: true });
    expect(queuedSecond.options[0].optionId).toBe('allow-2');
    expect(Object.isFrozen(queuedFirst.rawInput)).toBe(true);
    expect(Object.isFrozen(queuedSecond.options)).toBe(true);
  });
});

/*
 * The hook reads the interface language so a button-started turn has one to answer in.
 * These tests render it bare, with no provider, which is the repository's usual shape for a
 * model hook — so the locale is mocked here the same way 27 other suites mock next-intl.
 */
vi.mock('next-intl', () => ({
  useLocale: () => 'ko',
  useTranslations: () => (key: string) => key,
}));

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
  bridge.holdPrompt = false;
  bridge.pendingPrompt = null;
});

describe('analysis turn capture', () => {
  const answer = (text: string) => bridge.listener?.(JSON.stringify({
    jsonrpc: '2.0', method: 'session/update',
    params: { sessionId: 's-1', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } },
  }));
  const finish = () => bridge.listener?.(JSON.stringify({ jsonrpc: '2.0', id: bridge.pendingPrompt, result: { stopReason: 'end_turn' } }));

  it('seals exact streamed text into the observer captured before a callback change', async () => {
    const firstDone = vi.fn();
    const secondDone = vi.fn();
    const first = vi.fn((_start: import('./use-acp-session').AcpTurnStart) => firstDone);
    const second = vi.fn(() => secondDone);
    const { result, rerender } = renderHook(({ observer }) => useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/original-vault', onTurnStarted: observer }), { initialProps: { observer: first } });
    const starting = result.current.start();
    await waitFor(() => expect(bridge.release).not.toBeNull());
    await act(async () => { bridge.release?.(); await starting; });
    bridge.holdPrompt = true;
    let sent!: Promise<void>;
    act(() => { sent = result.current.send('Review this exact request.'); });
    await waitFor(() => expect(bridge.pendingPrompt).not.toBeNull());
    act(() => { answer('A cited '); answer('answer.'); });
    rerender({ observer: second });
    await act(async () => { finish(); await sent; });
    expect(firstDone).toHaveBeenCalledTimes(1);
    expect(secondDone).not.toHaveBeenCalled();
    const completion = firstDone.mock.calls[0][0];
    expect(completion.vaultRoot).toBe('/original-vault');
    expect(completion.outcome).toBe('completed');
    expect(completion.stopReason).toBe('end_turn');
    expect(completion.events.filter((event: { kind: string }) => event.kind === 'agent')).toEqual([expect.objectContaining({ text: 'A cited answer.' })]);
    expect(completion.userEventId).toBe(first.mock.calls[0][0].userEventId);
    await act(async () => { await result.current.stop(); });
  });

  it('does not certify completion after cancellation or repeat capture after close', async () => {
    const done = vi.fn();
    const { result } = renderHook(() => useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault', onTurnStarted: () => done }));
    const starting = result.current.start();
    await waitFor(() => expect(bridge.release).not.toBeNull());
    await act(async () => { bridge.release?.(); await starting; });
    bridge.holdPrompt = true;
    let sent!: Promise<void>;
    act(() => { sent = result.current.send('Review.'); });
    await waitFor(() => expect(bridge.pendingPrompt).not.toBeNull());
    act(() => { answer('Partial result'); result.current.cancel(); });
    await act(async () => { finish(); await sent; await result.current.stop(); });
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0][0].outcome).toBe('cancelled');
  });

  it('captures a stopped in-flight turn once and ignores the disposed prompt result', async () => {
    const done = vi.fn();
    const { result } = renderHook(() => useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault', onTurnStarted: () => done }));
    const starting = result.current.start();
    await waitFor(() => expect(bridge.release).not.toBeNull());
    await act(async () => { bridge.release?.(); await starting; });
    bridge.holdPrompt = true;
    let sent!: Promise<void>;
    act(() => { sent = result.current.send('Review before close.'); });
    await waitFor(() => expect(bridge.pendingPrompt).not.toBeNull());
    act(() => answer('An unfinished answer'));
    await act(async () => { await result.current.stop(); await sent; });
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0][0]).toMatchObject({ outcome: 'cancelled', stopReason: 'session_closed' });
    expect(result.current.status).toBe('idle');
  });
});

describe('pre-prompt task baseline', () => {
  const baseline = () => unavailableTaskBaseline(
    '2026-09-14T00:00:00.000Z', '/vault', ['capabilities/refund'], ['document_missing'],
  );

  it('establishes the turn and waits for typed capture before launching the prompt', async () => {
    let release!: () => void;
    const capture = vi.fn(() => new Promise<ReturnType<typeof baseline>>((resolve) => { release = () => resolve(baseline()); }));
    const { result } = renderHook(() => useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault', captureTaskBaseline: capture }));
    const starting = result.current.start();
    await waitFor(() => expect(bridge.release).not.toBeNull());
    await act(async () => { bridge.release?.(); await starting; });

    let sent!: Promise<void>;
    act(() => { sent = result.current.send('Review refund meaning.'); });
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe('thinking');
    expect(result.current.events).toEqual([expect.objectContaining({ kind: 'user', text: 'Review refund meaning.' })]);
    expect(bridge.sent.some((message) => message.method === 'session/prompt')).toBe(false);
    await act(async () => { release(); await sent; });
    expect(bridge.sent.some((message) => message.method === 'session/prompt')).toBe(true);
    await act(async () => { await result.current.stop(); });
  });

  it('finishes a cancellation during capture without launching a prompt', async () => {
    let release!: () => void;
    const capture = () => new Promise<ReturnType<typeof baseline>>((resolve) => { release = () => resolve(baseline()); });
    const done = vi.fn();
    const { result } = renderHook(() => useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault', captureTaskBaseline: capture, onTurnStarted: () => done }));
    const starting = result.current.start();
    await waitFor(() => expect(bridge.release).not.toBeNull());
    await act(async () => { bridge.release?.(); await starting; });
    let sent!: Promise<void>;
    act(() => { sent = result.current.send('Do not prompt after cancel.'); });
    await waitFor(() => expect(result.current.status).toBe('thinking'));
    act(() => result.current.cancel());
    await act(async () => { release(); await sent; });
    expect(bridge.sent.some((message) => message.method === 'session/prompt')).toBe(false);
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'cancelled', stopReason: 'capture_cancelled' }));
    await act(async () => { await result.current.stop(); });
  });

  it('discards capture completion after the session generation is stopped', async () => {
    let release!: () => void;
    const capture = () => new Promise<ReturnType<typeof baseline>>((resolve) => { release = () => resolve(baseline()); });
    const { result } = renderHook(() => useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault', captureTaskBaseline: capture }));
    const starting = result.current.start();
    await waitFor(() => expect(bridge.release).not.toBeNull());
    await act(async () => { bridge.release?.(); await starting; });
    let sent!: Promise<void>;
    act(() => { sent = result.current.send('Do not prompt after stop.'); });
    await waitFor(() => expect(result.current.status).toBe('thinking'));
    await act(async () => { await result.current.stop(); release(); await sent; });
    expect(bridge.sent.some((message) => message.method === 'session/prompt')).toBe(false);
  });

  it.each(['context_changed', 'membership_changed'] as const)(
    'cancels a %s baseline instead of prompting, including same-path handle replacement',
    async (reason) => {
      const done = vi.fn();
      const capture = async () => unavailableTaskBaseline(
        '2026-09-14T00:00:00.000Z', '/vault', ['capabilities/refund'], [reason],
      );
      const { result } = renderHook(() => useAcpSession({
        runtimeId: 'claude-acp', vaultRoot: '/vault', captureTaskBaseline: capture,
        onTurnStarted: () => done,
      }));
      const starting = result.current.start();
      await waitFor(() => expect(bridge.release).not.toBeNull());
      await act(async () => { bridge.release?.(); await starting; await result.current.send('Unsafe stale scope.'); });
      expect(bridge.sent.some((message) => message.method === 'session/prompt')).toBe(false);
      expect(done).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'cancelled', stopReason: 'capture_context_changed' }));
      await act(async () => { await result.current.stop(); });
    },
  );

  it('cancels when runtime or vault props change while capture is pending', async () => {
    let release!: () => void;
    const capture = () => new Promise<ReturnType<typeof baseline>>((resolve) => { release = () => resolve(baseline()); });
    const done = vi.fn();
    const { result, rerender } = renderHook(
      ({ runtimeId, vaultRoot }) => useAcpSession({ runtimeId, vaultRoot, captureTaskBaseline: capture, onTurnStarted: () => done }),
      { initialProps: { runtimeId: 'claude-acp', vaultRoot: '/same-path' } },
    );
    const starting = result.current.start();
    await waitFor(() => expect(bridge.release).not.toBeNull());
    await act(async () => { bridge.release?.(); await starting; });
    let sent!: Promise<void>;
    act(() => { sent = result.current.send('Scope changes while capturing.'); });
    await waitFor(() => expect(result.current.status).toBe('thinking'));
    rerender({ runtimeId: 'codex-acp', vaultRoot: '/replacement-vault' });
    await act(async () => { release(); await sent; });
    expect(bridge.sent.some((message) => message.method === 'session/prompt')).toBe(false);
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'cancelled', stopReason: 'capture_context_changed' }));
    await act(async () => { await result.current.stop(); });
  });

  it('continues with an explicit unavailable baseline when capture itself rejects', async () => {
    const capture = async () => { throw new Error('read bridge failed'); };
    const { result } = renderHook(() => useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault', captureTaskBaseline: capture }));
    const starting = result.current.start();
    await waitFor(() => expect(bridge.release).not.toBeNull());
    await act(async () => { bridge.release?.(); await starting; await result.current.send('Continue with unknown basis.'); });
    expect(bridge.sent.some((message) => message.method === 'session/prompt')).toBe(true);
    await act(async () => { await result.current.stop(); });
  });
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

  it('외부 연결 도구만 실려도 볼트 서버가 있다고 말하지 않는다', async () => {
    /*
     * 2026-09-05. `hasVaultMcp` used to be «the array is not empty», which was the same sentence
     * while the array was ours alone. With external connectors in it, a person with one switched
     * on and no bundled MCP binary would have had the session claim a vault server it never
     * wired — and pass `atlas-vault` as an auto-allowed name to whatever else answered to it.
     */
    const { result } = renderHook(() =>
      useAcpSession({
        runtimeId: 'claude-acp',
        vaultRoot: '/vault',
        mcpServers: [
          {
            name: 'notion',
            command: '/opt/homebrew/bin/npx',
            args: ['-y', '@notionhq/notion-mcp-server'],
            env: [],
          },
        ],
      }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });

    const call = bridge.sent.find((m) => m.method === 'session/new');
    const params = call?.params as Record<string, unknown>;
    // The connector is still handed over — Atlas passes it along, the agent runs it.
    expect(params.mcpServers).toEqual([
      {
        name: 'notion',
        command: '/opt/homebrew/bin/npx',
        args: ['-y', '@notionhq/notion-mcp-server'],
        env: [],
      },
    ]);
    const meta = params._meta as { systemPrompt?: { append?: string } } | undefined;
    expect(meta?.systemPrompt?.append).not.toContain('atlas-vault');

    await act(async () => {
      await result.current.stop();
    });
  });

  it('볼트 항목과 외부 연결 도구가 함께 실리면 볼트는 여전히 볼트다', async () => {
    const { result } = renderHook(() =>
      useAcpSession({
        runtimeId: 'claude-acp',
        vaultRoot: '/vault',
        mcpServers: [
          { name: 'atlas-vault', command: '/app/ontology-atlas-mcp', args: [], env: [] },
          { type: 'http', name: 'linear', url: 'https://mcp.linear.app/mcp', headers: [] },
        ],
      }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });

    const call = bridge.sent.find((m) => m.method === 'session/new');
    const params = call?.params as Record<string, unknown>;
    // Vault first, and the connector alongside it — the array is passed through untouched.
    expect((params.mcpServers as Array<{ name: string }>).map((s) => s.name)).toEqual([
      'atlas-vault',
      'linear',
    ]);
    const meta = params._meta as { systemPrompt?: { append?: string } } | undefined;
    expect(meta?.systemPrompt?.append).toContain('atlas-vault');

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
  it("carries the screen's own paragraph after the handoff, and the handoff still goes out whole", async () => {
    const { result } = renderHook(() =>
      useAcpSession({
        runtimeId: 'claude-acp',
        vaultRoot: '/vault',
        mcpServers: [{ name: 'atlas-vault' }],
        systemPromptAppendix: 'PROBE-APPENDIX: cite as [[src:sources/<file>#l<line>]].',
      }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });
    const call = bridge.sent.find((m) => m.method === 'session/new');
    const meta = (call?.params as Record<string, unknown>)?._meta as { systemPrompt?: { append?: string } } | undefined;
    const prompt = meta?.systemPrompt?.append ?? '';
    expect(prompt).toMatch(/Do not shell out/);
    expect(prompt.endsWith('PROBE-APPENDIX: cite as [[src:sources/<file>#l<line>]].')).toBe(true);
  });

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
    /*
     * ⑤ the answer's language. This used to read "the language the person wrote in", which
     * covers everything typed into the composer and nothing started by pressing a button —
     * where the person wrote nothing and the only text in the turn is this app's own English.
     * Measured 2026-09-09 on /ko/architecture: the source-check button returned a full English
     * report to a Korean interface. So the interface language is now named outright, and what
     * the person types still wins over it.
     */
    expect(prompt, '한국어 화면인데 답할 언어를 정해 주지 않는다').toMatch(/Answer in Korean/);
    expect(prompt, '사람이 쓴 언어가 화면 언어를 못 이긴다').toMatch(/write to you in another language, follow theirs/);
    expect(prompt, '버튼으로 시작한 턴이라는 사정이 빠졌다').toMatch(/arrived from a button/);
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
  it.each(['completed', 'failed'] as const)('구조화된 현재-turn writer chain의 %s terminal receipt를 같은 명시 identity로 남긴다', async (terminal) => {
    bridge.holdPrompt = true;
    const receipts: AcpWorkReceipt[] = [];
    const { result } = renderHook(() => useAcpSession({ runtimeId: 'codex-acp', vaultRoot: '/vault', mcpServers: [{ name: 'atlas-vault' }], onWorkReceipt: (receipt) => receipts.push(receipt) }));
    const starting = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => { bridge.release?.(); await starting; });
    void result.current.send('Update refund meaning.');
    await waitFor(() => expect(result.current.events.some((event) => event.kind === 'user')).toBe(true));
    const user = result.current.events.find((event) => event.kind === 'user');
    act(() => {
      bridge.listener?.(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 's-1', update: {
        sessionUpdate: 'tool_call', toolCallId: 'writer-1', title: 'mcp__atlas-vault__patch_concept', kind: 'execute', status: 'pending',
        rawInput: { server: 'atlas-vault', tool: 'patch_concept', arguments: { slug: 'capabilities/refund', expected_mtime: 100 } },
        _meta: { is_mcp_tool_call: true },
      } } }));
      bridge.listener?.(JSON.stringify({ jsonrpc: '2.0', id: 'permission-1', method: 'session/request_permission', params: {
        sessionId: 's-1', _meta: { is_mcp_tool_approval: true },
        options: [{ kind: 'reject_once', name: 'Deny', optionId: 'reject' }, { kind: 'allow_once', name: 'Allow', optionId: 'allow' }],
        toolCall: { toolCallId: 'writer-1', title: 'patch', kind: 'execute' },
      } }));
    });
    await waitFor(() => expect(result.current.pending).toBeTruthy());
    await act(async () => { result.current.pending?.resolve('allow'); });
    expect(receipts[0]).toMatchObject({ result: 'pending', origin: { requestId: 'permission-1', userEventId: user?.id }, writerCorrelation: { terminal: 'pending' } });
    act(() => bridge.listener?.(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'other-session', update: {
      sessionUpdate: 'tool_call_update', toolCallId: 'writer-1', status: terminal,
    } } })));
    expect(receipts).toHaveLength(1);
    act(() => bridge.listener?.(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 's-1', update: {
      sessionUpdate: 'tool_call_update', toolCallId: 'writer-1', status: terminal,
      rawInput: { server: 'atlas-vault', tool: 'add_concept', arguments: {} }, _meta: { is_mcp_tool_call: true },
    } } })));
    expect(receipts).toHaveLength(1);
    act(() => bridge.listener?.(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 's-1', update: {
      sessionUpdate: 'tool_call_update', toolCallId: 'writer-1', status: terminal,
    } } })));
    await waitFor(() => expect(receipts).toHaveLength(2));
    expect(receipts[1]).toMatchObject({ result: terminal, origin: receipts[0].origin, writerCorrelation: { terminal } });
    await act(async () => { await result.current.stop(); });
  });

  it('온톨로지 요청에 실제 turn, generation, JSON-RPC id와 구조화되지 않은 non-goal 상태를 묶는다', async () => {
    bridge.holdPrompt = true;
    const receipts: AcpWorkReceipt[] = [];
    const { result } = renderHook(() => useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault', mcpServers: [{ name: 'atlas-vault' }], onWorkReceipt: (receipt) => receipts.push(receipt) }));
    const starting = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => { bridge.release?.(); await starting; });
    void result.current.send('Change refund eligibility; keep capture unchanged.');
    await waitFor(() => expect(bridge.pendingPrompt).not.toBeNull());
    await waitFor(() => expect(result.current.events.some((event) => event.kind === 'user')).toBe(true));
    const user = result.current.events.find((event) => event.kind === 'user');
    act(() => {
      bridge.listener?.(JSON.stringify({
        jsonrpc: '2.0', method: 'session/update', params: { sessionId: 's-1', update: {
          sessionUpdate: 'tool_call', toolCallId: 'tool-0', title: 'mcp__atlas-vault__patch_concept',
          kind: 'other', status: 'pending',
          rawInput: { server: 'atlas-vault', tool: 'patch_concept', arguments: { slug: 'capabilities/refund', expected_mtime: 100 } },
          _meta: { is_mcp_tool_call: true },
        } },
      }));
      bridge.listener?.(JSON.stringify({
        jsonrpc: '2.0', id: 0, method: 'session/request_permission', params: {
          sessionId: 's-1', options: [
            { kind: 'reject_once', name: 'Deny', optionId: 'reject' },
            { kind: 'allow_once', name: 'Allow', optionId: 'allow' },
          ], toolCall: { toolCallId: 'tool-0', title: 'mcp__atlas-vault__patch_concept', kind: 'other' },
          _meta: { is_mcp_tool_approval: true },
        },
      }));
    });
    await waitFor(() => expect(result.current.pending?.request.requestId).toBe(0));
    expect(result.current.pending?.origin).toEqual({
      sessionGeneration: 0,
      turn: { sessionId: 's-1', vaultRoot: '/vault', userEventId: user?.id, text: 'Change refund eligibility; keep capture unchanged.' },
      task: { outcome: 'Change refund eligibility; keep capture unchanged.', nonGoals: null, structure: 'unstructured' },
      taskBaseline: null,
    });
    await act(async () => { result.current.pending?.resolve('reject'); });
    expect(receipts[0]).toMatchObject({
      decision: 'rejected', result: 'not-run',
      origin: { vaultId: '/vault', sessionGeneration: 0, sessionId: 's-1', userEventId: user?.id, requestId: 0, toolCallId: 'tool-0' },
      writerCorrelation: { status: 'verified', server: 'atlas-vault', tool: 'patch_concept', toolCall: 'structured-mcp', approval: 'structured-mcp', terminal: 'not-observed' },
    });
    expect(JSON.stringify(receipts[0])).not.toContain('taskBaseline');
    await act(async () => { await result.current.stop(); });
  });

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
    expect(result.current.pending?.request.requestId).toBe(101);
    expect(result.current.pending?.request.sessionId).toBe('s-1');
    expect(result.current.pending?.origin).toEqual({ sessionGeneration: 0, turn: null, task: null, taskBaseline: null });
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
    /*
     * ⚠️ Not the `gate-off` sentence. That one says *"the tool follows the settings you gave it
     * directly"* — on this path the person gave no such setting, the adapter moved the session — and
     * it speaks only of files outside the folder, while `acceptEdits` accepts edits **inside** it.
     * Reusing it here would have been wrong in both halves (council, 2026-09-05).
     */
    const moved = result.current.events.find((e) => e.kind === 'notice');
    expect(moved, 'the screen still claims a gate it no longer has').toMatchObject({
      text: 'mode-moved',
      mode: 'acceptEdits',
      // Claude's isolated configuration owns the checkpoint, so no server gate is passed and none
      // is claimed. The sentence and the wiring say the same thing or neither is worth having.
      serverGate: false,
    });
    expect(result.current.diagnostics.join(' ')).toContain('acceptEdits');

    await act(async () => {
      await result.current.stop();
    });
  });

  it('claims the Atlas server checkpoint only when it is actually passed', async () => {
    /*
     * The reassurance is read back from the env that produces it, never guessed from the runtime
     * name: `vaultMcpServers` sets `OATLAS_WRITE_CONSENT=on` only where the runtime's own
     * configuration does **not** already ask. Codex is that case, and codex-acp 1.9.0 gave the clamp
     * a real shape — its `agent` mode carries `_meta.kind: "auto_review"`.
     */
    bridge.sessionModes = {
      currentModeId: 'read-only',
      availableModes: [
        { id: 'read-only', name: 'Ask for approval', _meta: { kind: 'standard' } },
        { id: 'agent', name: 'Approve for me', _meta: { kind: 'auto_review' } },
      ],
    };
    const { result } = renderHook(() =>
      useAcpSession({
        runtimeId: 'codex-acp',
        vaultRoot: '/vault',
        mcpServers: [
          {
            name: 'atlas-vault',
            command: 'node',
            args: [],
            env: [{ name: 'OATLAS_WRITE_CONSENT', value: 'on' }],
          },
        ],
      }),
    );
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await first;
    });
    expect(result.current.events.some((e) => e.kind === 'notice')).toBe(false);

    moveTo('agent');

    await waitFor(() => expect(result.current.choices.currentModeId).toBe('agent'));
    expect(result.current.events.find((e) => e.kind === 'notice')).toMatchObject({
      text: 'mode-moved',
      mode: 'agent',
      serverGate: true,
    });

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
      result.current.events.find((e) => e.kind === 'notice'),
      'the conversation opened with no gate and said nothing',
    ).toMatchObject({ text: 'mode-moved', mode: 'acceptEdits' });
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

describe('autoDecide — the screen answers a permission it can judge', () => {
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
        toolCall: { toolCallId: `tool-${id}`, title: `Write ${path}`, kind: 'edit', rawInput: { file_path: path } },
      },
    });

  it('allows at once with a transcript line when the screen says so, and still asks otherwise', async () => {
    // Owner direction 2026-09-07: agents act, people can step in. The Library judges a wiki
    // page against its contract; a fitting page lands without a card.
    const { result } = renderHook(() =>
      useAcpSession({
        runtimeId: 'claude-acp',
        vaultRoot: '/vault',
        autoDecide: (request) => (request.filePath?.endsWith('/wiki/a.md') ? 'wiki/a.md' : null),
      }),
    );
    const starting = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => { bridge.release?.(); await starting; });

    await act(async () => { bridge.listener?.(permissionRequest(201, '/vault/wiki/a.md')); });
    await waitFor(() => expect(bridge.sent.some((m) => m.id === 201 && 'result' in m)).toBe(true));
    const answer = bridge.sent.find((m) => m.id === 201) as { result: { outcome: { optionId: string } } };
    expect(answer.result.outcome.optionId).toBe('allow');
    expect(result.current.pending).toBeNull();
    expect(result.current.events.some((event) => event.kind === 'notice' && event.text === 'auto-allowed' && event.detail === 'wiki/a.md')).toBe(true);

    await act(async () => { bridge.listener?.(permissionRequest(202, '/vault/notes.md')); });
    await waitFor(() => expect(result.current.pending?.request.filePath).toBe('/vault/notes.md'));
    await act(async () => { result.current.pending?.resolve('reject'); });
    await act(async () => { await result.current.stop(); });
  });
});
