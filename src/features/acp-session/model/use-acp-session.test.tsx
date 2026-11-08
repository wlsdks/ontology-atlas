import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcpWorkReceipt } from '@/shared/lib/meaning-transition/acp-work-receipt';

/**
 * Never start two adapters. Tested at hook level because the defect needs the real
 * condition: `start` called again while starting. Two processes leave the session id on one
 * and the lines on the other (`Session not found`) and orphan the first.
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
  permissionVerdict: 'ask' as 'ask' | 'allow-inside-vault',
  stopped: [] as string[],
  /** The requests we sent — the only window onto "what did we put on the wire". */
  sent: [] as Array<{ id?: number; method?: string; params?: unknown }>,
  holdPrompt: false,
  pendingPrompt: null as number | null,
  failLoad: false,
  newSessionId: 's-1',
}));

vi.mock('@/shared/lib/agent-chat/tauri-acp', () => ({
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
    if (message.method === 'session/load' && bridge.failLoad) {
      queueMicrotask(() =>
        bridge.listener?.(
          JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'no such session' } }),
        ),
      );
      return;
    }
    const result =
      message.method === 'session/new' || message.method === 'session/load'
        ? {
            sessionId: message.method === 'session/new' ? bridge.newSessionId : 's-1',
            ...(bridge.sessionModes ? { modes: bridge.sessionModes } : {}),
          }
        : { protocolVersion: 1 };
    queueMicrotask(() =>
      bridge.listener?.(JSON.stringify({ jsonrpc: '2.0', id: message.id, result })),
    );
  },
  stopAcpSession: async (id: string) => {
    bridge.stopped.push(id);
  },
  acpPermissionVerdict: async () => bridge.permissionVerdict,
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
  cleanup();
  bridge.starts = 0;
  bridge.release = null;
  bridge.listener = null;
  bridge.stderr = null;
  bridge.notice = null;
  bridge.exits.clear();
  bridge.failSetMode = false;
  bridge.sessionModes = null;
  bridge.permissionVerdict = 'ask';
  bridge.stopped = [];
  bridge.sent = [];
  bridge.holdPrompt = false;
  bridge.pendingPrompt = null;
  bridge.failLoad = false;
  bridge.newSessionId = 's-1';
  vi.useRealTimers();
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
    act(() => answer('A cited '));
    const firstFrame = result.current.events;
    const firstAnswer = firstFrame.at(-1);
    Object.freeze(firstFrame);
    Object.freeze(firstAnswer);
    act(() => answer('answer.'));
    expect(firstAnswer).toMatchObject({ kind: 'agent', text: 'A cited ' });
    expect(result.current.events.at(-1)).toMatchObject({ kind: 'agent', id: firstAnswer?.id, text: 'A cited answer.' });
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
    expect(completion.events).toEqual(result.current.events);
    completion.events.forEach((event: unknown, index: number) => {
      expect(event).not.toBe(result.current.events[index]);
    });
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

describe('one session: overlapping calls still make one process', () => {
  it('does nothing on the second call made while starting', async () => {
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
      'a second start during startup makes two adapters and the session number and lines drift apart',
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

  it('kills the process itself when closed mid-startup, leaving no ghost', async () => {
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

    expect(bridge.stopped, 'not stopping what was starting leaves the adapter running after close').toContain('acp-1');
  });

  it('releases the lock when starting fails, so it is not left unable to start again', async () => {
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
      expect(bridge.starts, 'failing to start again after cleanup means a conversation cannot be reopened').toBe(2),
    );
    await act(async () => {
      bridge.release?.();
      await result.current.stop();
      await second;
    });
  });

  it('does not let a late exit event of the previous session end the new session', async () => {
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
    expect(result.current.status, 'a finished previous session turned the new session into exited').toBe('ready');

    await act(async () => {
      await result.current.send('새 세션은 살아 있어야 해');
    });
    expect(bridge.sent.filter((message) => message.method === 'session/prompt')).toHaveLength(1);

    await act(async () => {
      await result.current.stop();
    });
  });
});

describe('diagnostics: collected, but not shown normally', () => {
  it('collects real clues and not noise like npm warnings', async () => {
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

describe('vault server: says it is plugged in only when it is', () => {
  it('has session/new carry the server and the instructions say so too', async () => {
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
    expect(call, 'session/new was never sent').toBeTruthy();
    const params = call?.params as Record<string, unknown>;
    expect(params.mcpServers).toEqual([
      { name: 'atlas-vault', command: '/app/ontology-atlas-mcp', args: [] },
    ]);
    const meta = params._meta as { systemPrompt?: { append?: string } } | undefined;
    expect(meta?.systemPrompt?.append).toContain('atlas-vault');
    /*
     * App sessions have no independent evaluator, so construction must route to reviewed
     * batches, not the bulk qualification lifecycle.
     */
    expect(meta?.systemPrompt?.append).toContain('reviewed batches');
    expect(meta?.systemPrompt?.append).toContain('verify `connection_info` and read the construction card');
    expect(meta?.systemPrompt?.append).toContain('does not have an independent evaluator');
    expect(meta?.systemPrompt?.append).toContain('Do not fabricate an evaluator');
    /*
     * The write door answers a missing definition, boundary, uncertainty line, or misplaced slug
     * with a finding, which arrives after the node is written. What the body must carry is
     * therefore stated before the first write, and the uncertainty line is the one a body most
     * easily omits while still looking complete.
     */
    expect(meta?.systemPrompt?.append).toContain('each slug under its kind folder');
    expect(meta?.systemPrompt?.append).toContain('`## Uncertainty` line naming what you did not read');
    expect(meta?.systemPrompt?.append).not.toContain('use the construction lifecycle');

    await act(async () => {
      await result.current.stop();
    });
  });

  it('**does not claim it is connected** without a server, so nobody hunts for a missing tool', async () => {
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
    expect(meta?.systemPrompt?.append).not.toContain('reviewed batches');
    expect(meta?.systemPrompt?.append).not.toContain('read the construction card');
    expect(meta?.systemPrompt?.append).not.toContain('does not have an independent evaluator');
    // The remaining rules (write the why, do not leave the folder) stay as they are.
    expect(meta?.systemPrompt?.append).toContain('`why`');

    await act(async () => {
      await result.current.stop();
    });
  });

  it('does not claim a vault server exists when only externally connected tools are carried', async () => {
    /*
     * `hasVaultMcp` must mean our vault server is present, not that the array is non-empty;
     * external connectors alone must not make the session claim it or auto-allow `atlas-vault`.
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

  it('stays the vault when vault entries and externally connected tools are carried together', async () => {
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

describe('Codex permission floor: applies read-only before the conversation is ready', () => {
  it('replaces an initial local profile with acknowledged read-only before readiness', async () => {
    bridge.sessionModes = { currentModeId: 'permission-profile:local', availableModes: [
      { id: 'permission-profile:local', name: 'Local' }, { id: 'read-only', name: 'Read only' },
    ] };
    const { result } = renderHook(() => useAcpSession({ runtimeId: 'codex-acp', vaultRoot: '/vault' }));
    const first = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => { bridge.release?.(); await first; });
    expect(result.current.status).toBe('ready');
    expect(result.current.choices.currentModeId).toBe('read-only');
    expect(result.current.choices.modes.map(mode => mode.id)).toEqual(['read-only']);
    await act(async () => { await result.current.stop(); });
  });

  it('applies read-only mode on every new session and does not become ready on failure', async () => {
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

describe('resumed conversation: the rules do not change', () => {
  it('carries the same instructions on session/load as on a new conversation', async () => {
    /* A resumed conversation must get the same instructions as a new one. */
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
    expect(meta?.systemPrompt?.append, 'the resumed conversation did not carry the instructions').toContain('`why`');

    await act(async () => {
      await result.current.stop();
    });
  });
});

describe('session instructions: the four measured lines are actually carried', () => {
  /** Pins that the four instructions go out with the session, not their wording. */
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

  it('carries all of order, duplicate check, ask when ambiguous, and no hand reading', async () => {
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
    expect(prompt, 'the instruction not to scan by hand is missing').toMatch(/Do not shell out/);
    // ② the order
    expect(prompt, 'the work order is missing').toMatch(/Work in this order/);
    // ③ look before creating
    expect(prompt, 'the instruction to look for duplicates first is missing').toMatch(/similar_nodes|find_evidence/);
    // Map navigation must lead to an exact read tool call, not inferred answer sentences.
    expect(prompt, 'map search and path requests do not lead to the exact read tool').toMatch(
      /get_concept.*find_path.*move and highlight the map/i,
    );
    // ④ If ambiguous, ask — the line changed most in actual measurement
    expect(prompt, 'it would create instead of asking when ambiguous').toMatch(/Ask first/);
    /*
     * The answer language is named outright from the interface language, since a turn started by
     * a button has only this app's English text. What the person types still wins.
     */
    expect(prompt, 'a Korean screen does not set the language to answer in').toMatch(/Answer in Korean/);
    expect(prompt, 'a language the person wrote in does not beat the screen language').toMatch(/write to you in another language, follow theirs/);
    expect(prompt, 'the fact that the turn started from a button is missing').toMatch(/arrived from a button/);
    // Compiler declarations and map lines are different censuses; merging them makes two counts
    // look contradictory.
    expect(prompt, 'the MCP declared count and the map line count would be called the same relation count').toMatch(
      /relationCensus.*graph\.edges.*compiled frontmatter relation declarations.*deduplicated normalized typed edges.*not the current view filter/i,
    );

    await act(async () => {
      await result.current.stop();
    });
  });
});

describe('when the gate could not be set up, the screen says so', () => {
  it('keeps a notice that came as `gate-off:` in the conversation instead of folding it', async () => {
    /*
     * A failure building the isolated config falls back to the user's global config, which skips
     * permission requests, so the screen must say the gate is off.
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
        'the fact that there is no gate does not show on the screen',
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

describe('a tool call reaching its end', () => {
  it('is reported once it completes, fails or is cancelled, and not while it is pending or refined', async () => {
    const settled = vi.fn();
    const { result } = renderHook(() => useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault', onToolSettled: settled }));
    const starting = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => {
      bridge.release?.();
      await starting;
    });
    const send = (update: Record<string, unknown>) =>
      bridge.listener?.(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 's-1', update } }));
    act(() => {
      send({ sessionUpdate: 'tool_call', toolCallId: 'edit-1', title: 'Edit', kind: 'edit', status: 'pending' });
      send({ sessionUpdate: 'tool_call_update', toolCallId: 'edit-1', rawInput: { file_path: '/vault/wiki/plan.md' } });
      send({ sessionUpdate: 'tool_call_update', toolCallId: 'edit-1', status: 'in_progress' });
      send({ sessionUpdate: 'tool_call_update', toolCallId: 'edit-1', status: 'completed' });
      send({ sessionUpdate: 'tool_call', toolCallId: 'read-1', title: 'Read', kind: 'read', status: 'completed' });
      send({ sessionUpdate: 'tool_call_update', toolCallId: 'write-1', status: 'cancelled' });
    });
    expect(settled.mock.calls).toEqual([['edit-1', 'completed'], ['read-1', 'completed'], ['write-1', 'cancelled']]);
  });
});

describe('tool input refinement: the real Claude ACP order', () => {
  it('merges a rawInput sent late by a tool_call_update without status into the existing tool row', async () => {
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

describe('permission card: overlapping requests also go one at a time, and both get an answer', () => {
  it.each(['completed', 'failed'] as const)('leaves the terminal receipt %s of a structured current-turn writer chain with the same explicit identity', async (terminal) => {
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

  it('binds the real turn, generation, JSON-RPC id and an unstructured non-goal state to an ontology request', async () => {
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

  it('does not let the second request overwrite the first card, and both JSON-RPC ids get a reply', async () => {
    /*
     * With a single resolver slot a second concurrent `session/request_permission` replaced the
     * first card's resolver and left its id unanswered.
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
 * The adapter can move the session itself via `current_mode_update` (`AUTO_MODE_FALLBACK =
 * "acceptEdits"`), so the screen follows it and reuses the `gate-off` notice for
 * gate-removing modes.
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

  it('rejects direct profile selection and reports an unsolicited profile move as unverified', async () => {
    const { result } = await started();
    const before = bridge.sent.filter(message => message.method === 'session/set_mode').length;
    await act(async () => { await result.current.chooseMode('permission-profile:local'); });
    expect(bridge.sent.filter(message => message.method === 'session/set_mode')).toHaveLength(before);
    expect(result.current.choices.currentModeId).toBe('default');
    moveTo('permission-profile:local');
    expect(result.current.choices.currentModeId).toBe('permission-profile:local');
    expect(result.current.choices.modes.map(mode => mode.id)).toEqual(['default', 'plan']);
    expect(result.current.events.find(event => event.kind === 'notice')).toMatchObject({
      text: 'profile-mode-moved', mode: 'permission-profile:local', serverGate: false,
    });
    await act(async () => { await result.current.stop(); });
  });

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
     * Not the `gate-off` sentence: it speaks of settings the person gave and of files outside
     * the folder, while `acceptEdits` accepts edits inside it.
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
 * A session can begin in a gate-removing mode (for example a resumed `session/load`);
 * starting in a mode and being moved into it get the same treatment: state it, never offer
 * it back, say `gate-off`.
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

  it('records a direct vault read auto-allow for an active unattended round', async () => {
    const { result } = renderHook(() =>
      useAcpSession({
        runtimeId: 'claude-acp',
        vaultRoot: '/vault',
        mcpServers: [{ name: 'atlas-vault' }],
        autoDecide: (request) => (
          request.toolName === 'mcp__atlas-vault__get_concept'
            ? 'call mcp__atlas-vault__get_concept'
            : { reject: 'unexpected-tool' }
        ),
      }),
    );
    const starting = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => { bridge.release?.(); await starting; });

    await act(async () => {
      bridge.listener?.(JSON.stringify({
        jsonrpc: '2.0',
        id: 203,
        method: 'session/request_permission',
        params: {
          sessionId: 's-1',
          options: [
            { kind: 'reject_once', name: 'Deny', optionId: 'reject' },
            { kind: 'allow_once', name: 'Allow', optionId: 'allow' },
          ],
          toolCall: {
            toolCallId: 'read-203',
            title: 'mcp__atlas-vault__get_concept',
            kind: 'read',
            rawInput: { slug: 'capabilities/acp-runtime' },
          },
        },
      }));
    });
    await waitFor(() => expect(bridge.sent.some((message) => message.id === 203 && 'result' in message)).toBe(true));
    expect(result.current.events).toContainEqual(expect.objectContaining({
      kind: 'notice',
      text: 'auto-allowed',
      detail: 'call mcp__atlas-vault__get_concept',
    }));

    await act(async () => { await result.current.stop(); });
  });

  it('lets an unattended round refuse an Atlas write during its turn, and never lets it allow one', async () => {
    bridge.holdPrompt = true;
    let verdict: string | { reject: string } = { reject: 'mcp__atlas-vault__add_concept' };
    const { result } = renderHook(() =>
      useAcpSession({
        runtimeId: 'claude-acp',
        vaultRoot: '/vault',
        mcpServers: [{ name: 'atlas-vault' }],
        autoDecide: () => verdict,
      }),
    );
    const starting = result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => { bridge.release?.(); await starting; });
    void result.current.send('Review the ontology without changing it.');
    await waitFor(() => expect(bridge.sent.some((message) => message.method === 'session/prompt')).toBe(true));
    const atlasWrite = (id: number) => JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'session/request_permission',
      params: {
        sessionId: 's-1',
        options: [
          { kind: 'reject_once', name: 'Deny', optionId: 'reject' },
          { kind: 'allow_once', name: 'Allow', optionId: 'allow' },
        ],
        toolCall: { toolCallId: `write-${id}`, title: 'mcp__atlas-vault__add_concept', kind: 'edit', rawInput: { slug: 'capabilities/x' } },
      },
    });

    await act(async () => { bridge.listener?.(atlasWrite(301)); });
    await waitFor(() => expect(bridge.sent.some((message) => message.id === 301 && 'result' in message)).toBe(true));
    const refused = bridge.sent.find((message) => message.id === 301) as { result: { outcome: { optionId: string } } };
    expect(refused.result.outcome.optionId).toBe('reject');
    expect(result.current.pending).toBeNull();
    expect(result.current.events).toContainEqual(expect.objectContaining({ kind: 'notice', text: 'auto-refused', detail: 'mcp__atlas-vault__add_concept' }));

    verdict = 'call mcp__atlas-vault__add_concept';
    await act(async () => { bridge.listener?.(atlasWrite(302)); });
    await waitFor(() => expect(result.current.pending?.request.reviewKind).toBe('ontology-write'));
    expect(bridge.sent.some((message) => message.id === 302 && 'result' in message)).toBe(false);
    await act(async () => { result.current.pending?.resolve('reject'); });
    await act(async () => { await result.current.stop(); });
  });
});

describe('a conversation put away with nothing to do', () => {
  const TEN_MINUTES = 10 * 60_000;
  const permissionRequest = (id: number) =>
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
        toolCall: { toolCallId: `tool-${id}`, title: 'Write /outside/a.md', kind: 'edit', rawInput: { file_path: '/outside/a.md' } },
      },
    });
  const say = (text: string) =>
    bridge.listener?.(JSON.stringify({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { sessionId: 's-1', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } },
    }));
  const finishPrompt = () =>
    bridge.listener?.(JSON.stringify({ jsonrpc: '2.0', id: bridge.pendingPrompt, result: { stopReason: 'end_turn' } }));
  const idleFor = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

  async function ready() {
    const view = renderHook(
      ({ putAway }) => useAcpSession({ runtimeId: 'claude-acp', vaultRoot: '/vault', putAway }),
      { initialProps: { putAway: false } },
    );
    const starting = view.result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(1));
    await act(async () => { bridge.release?.(); await starting; });
    expect(view.result.current.status).toBe('ready');
    return view;
  }

  async function startAgain(view: Awaited<ReturnType<typeof ready>>) {
    vi.useRealTimers();
    view.rerender({ putAway: false });
    bridge.release = null;
    bridge.sent = [];
    const resuming = view.result.current.start();
    await waitFor(() => expect(bridge.starts).toBe(2));
    await act(async () => { bridge.release?.(); await resuming; });
  }

  it('stops the adapter after ten minutes put away, and not a moment before', async () => {
    const view = await ready();
    vi.useFakeTimers();
    view.rerender({ putAway: true });
    await idleFor(TEN_MINUTES - 1);
    expect(bridge.stopped).toEqual([]);
    await idleFor(1);
    expect(bridge.stopped).toEqual(['acp-1']);
    expect(view.result.current.status).toBe('idle');
  });

  it('keeps the adapter while the dock is open', async () => {
    const view = await ready();
    vi.useFakeTimers();
    bridge.holdPrompt = true;
    let sent!: Promise<void>;
    await act(async () => { sent = view.result.current.send('Survey the sources.'); });
    expect(view.result.current.status).toBe('thinking');
    await act(async () => { finishPrompt(); await sent; });
    expect(view.result.current.status).toBe('ready');
    await idleFor(3 * TEN_MINUTES);
    expect(bridge.stopped).toEqual([]);
  });

  it('keeps the adapter while a turn runs, and counts ten minutes from the end of that turn', async () => {
    const view = await ready();
    bridge.holdPrompt = true;
    let sent!: Promise<void>;
    act(() => { sent = view.result.current.send('Survey the sources.'); });
    await waitFor(() => expect(bridge.pendingPrompt).not.toBeNull());
    vi.useFakeTimers();
    view.rerender({ putAway: true });
    await idleFor(3 * TEN_MINUTES);
    expect(bridge.stopped).toEqual([]);
    await act(async () => { finishPrompt(); await sent; });
    expect(view.result.current.status).toBe('ready');
    await idleFor(TEN_MINUTES - 1);
    expect(bridge.stopped).toEqual([]);
    await idleFor(1);
    expect(bridge.stopped).toEqual(['acp-1']);
  });

  it('keeps the adapter while a permission waits for an answer', async () => {
    const view = await ready();
    await act(async () => { bridge.listener?.(permissionRequest(301)); });
    await waitFor(() => expect(view.result.current.pending).not.toBeNull());
    vi.useFakeTimers();
    view.rerender({ putAway: true });
    await idleFor(3 * TEN_MINUTES);
    expect(bridge.stopped).toEqual([]);
    await act(async () => { view.result.current.pending?.resolve('reject'); });
    await idleFor(TEN_MINUTES);
    expect(bridge.stopped).toEqual(['acp-1']);
  });

  it('resumes the same conversation on the next start and keeps its transcript', async () => {
    const view = await ready();
    await act(async () => { say('Four sources are waiting.'); });
    vi.useFakeTimers();
    view.rerender({ putAway: true });
    await idleFor(TEN_MINUTES);
    expect(bridge.stopped).toEqual(['acp-1']);
    await startAgain(view);
    const load = bridge.sent.find((m) => m.method === 'session/load');
    expect((load?.params as { sessionId?: string } | undefined)?.sessionId).toBe('s-1');
    expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(false);
    expect(view.result.current.status).toBe('ready');
    expect(view.result.current.events).toContainEqual(
      expect.objectContaining({ kind: 'agent', text: 'Four sources are waiting.' }),
    );
    await act(async () => { await view.result.current.stop(); });
  });

  it('clears the transcript when the put-away conversation cannot be resumed', async () => {
    const view = await ready();
    await act(async () => { say('Four sources are waiting.'); });
    vi.useFakeTimers();
    view.rerender({ putAway: true });
    await idleFor(TEN_MINUTES);
    bridge.failLoad = true;
    bridge.newSessionId = 's-2';
    await startAgain(view);
    expect(bridge.sent.some((m) => m.method === 'session/new')).toBe(true);
    expect(view.result.current.status).toBe('ready');
    expect(view.result.current.events).toEqual([]);
    await act(async () => { await view.result.current.stop(); });
  });
});

describe('explicit investigation prompt guard', () => {
  const servers=[{name:'atlas-vault',command:'/verified/mcp',args:[],env:[{name:'OATLAS_WRITE_CONSENT',value:'on'}]}];
  async function ready() {
    bridge.sessionModes={currentModeId:'read-only',availableModes:[{id:'read-only',name:'Read only',_meta:{kind:'plan'}}]};
    const hook=renderHook(()=>useAcpSession({runtimeId:'codex-acp',vaultRoot:'/vault',mcpServers:servers}));
    const starting=hook.result.current.start();
    await waitFor(()=>expect(bridge.release).not.toBeNull());
    await act(async()=>{bridge.release?.();await starting;});
    return hook;
  }
  it('sends one explicitly revalidated investigation through the actual prompt RPC',async()=>{
    const hook=await ready();const revalidate=vi.fn(async()=>true);
    let sent=false;
    await act(async()=>{sent=await hook.result.current.sendInvestigation('Investigate this selected question.',{runtimeId:'codex-acp',revalidate});});
    expect(sent).toBe(true);expect(revalidate).toHaveBeenCalledOnce();
    expect(bridge.sent.filter(row=>row.method==='session/prompt')).toHaveLength(1);
  });
  it.each(['brand-new','acceptEdits'])('refuses a live move into %s before any model prompt',async mode=>{
    const hook=await ready();
    act(()=>bridge.listener?.(JSON.stringify({jsonrpc:'2.0',method:'session/update',params:{sessionId:'s-1',update:{sessionUpdate:'current_mode_update',currentModeId:mode}}})));
    await act(async()=>{expect(await hook.result.current.sendInvestigation('Investigate.',{runtimeId:'codex-acp',revalidate:async()=>true})).toBe(false);});
    expect(bridge.sent.filter(row=>row.method==='session/prompt')).toHaveLength(0);
  });
  it('rejects duplicate sends and a mode change while source revalidation waits',async()=>{
    const hook=await ready();let release!: (current:boolean)=>void;
    const revalidate=vi.fn(()=>new Promise<boolean>(resolve=>{release=resolve;}));
    let sending!:Promise<boolean>;
    act(()=>{sending=hook.result.current.sendInvestigation('Investigate.',{runtimeId:'codex-acp',revalidate});});
    await waitFor(()=>expect(revalidate).toHaveBeenCalledOnce());
    await act(async()=>{expect(await hook.result.current.sendInvestigation('Duplicate.',{runtimeId:'codex-acp',revalidate})).toBe(false);});
    act(()=>bridge.listener?.(JSON.stringify({jsonrpc:'2.0',method:'session/update',params:{sessionId:'s-1',update:{sessionUpdate:'current_mode_update',currentModeId:'auto'}}})));
    await act(async()=>{release(true);expect(await sending).toBe(false);});
    expect(bridge.sent.filter(row=>row.method==='session/prompt')).toHaveLength(0);
  });
  it('does not send stale evidence or a request for another runtime',async()=>{
    const hook=await ready();
    await act(async()=>{
      expect(await hook.result.current.sendInvestigation('Stale.',{runtimeId:'codex-acp',revalidate:async()=>false})).toBe(false);
      expect(await hook.result.current.sendInvestigation('Wrong runtime.',{runtimeId:'claude-acp',revalidate:async()=>true})).toBe(false);
    });
    expect(bridge.sent.filter(row=>row.method==='session/prompt')).toHaveLength(0);
  });
});

it('keeps a stopped investigation idle when its source check returns late',async()=>{
 bridge.sessionModes={currentModeId:'read-only',availableModes:[{id:'read-only',name:'Read only',_meta:{kind:'plan'}}]};
 const mcpServers=[{name:'atlas-vault',command:'/verified/mcp',args:[],env:[{name:'OATLAS_WRITE_CONSENT',value:'on'}]}];
 const hook=renderHook(()=>useAcpSession({runtimeId:'codex-acp',vaultRoot:'/vault',mcpServers}));
 const starting=hook.result.current.start();await waitFor(()=>expect(bridge.release).not.toBeNull());
 await act(async()=>{bridge.release?.();await starting;});
 let release!: (value:boolean)=>void;
 const revalidate=vi.fn(()=>new Promise<boolean>(resolve=>{release=resolve;}));
 let sending!:Promise<boolean>;
 act(()=>{sending=hook.result.current.sendInvestigation('Investigate.',{runtimeId:'codex-acp',revalidate});});
 await waitFor(()=>expect(revalidate).toHaveBeenCalledOnce());
 await act(async()=>{await hook.result.current.stop();});
 expect(hook.result.current.status).toBe('idle');
 await act(async()=>{release(true);expect(await sending).toBe(false);});
 expect(hook.result.current.status).toBe('idle');
 expect(bridge.sent.filter(row=>row.method==='session/prompt')).toHaveLength(0);
});
