import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
  Channel: class<T> {
    constructor(readonly onmessage: (message: T) => void) {}
  },
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
  Channel: mocks.Channel,
}));

import { acpPermissionVerdict, listenToAcpSession, startAcpSession, stopAcpSession } from './tauri-acp';

type SessionChannel = { onmessage: (event: unknown) => void };

afterEach(() => {
  mocks.invoke.mockReset();
  mocks.isTauri.mockReturnValue(false);
});

describe('tauri ACP 권한 판정 브리지', () => {
  it('웹에서는 판정할 수 없는 경로를 자동 허용하지 않는다', async () => {
    expect(await acpPermissionVerdict('acp-session', '/vault/notes.md')).toBe('ask');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('화면이 고른 루트가 아니라 네이티브 세션 ID만 Rust에 넘긴다', async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValue('allow-inside-vault');

    await expect(acpPermissionVerdict('acp-1-999', '/vault/notes.md')).resolves.toBe(
      'allow-inside-vault',
    );
    expect(mocks.invoke).toHaveBeenCalledWith('acp_permission_verdict', {
      sessionId: 'acp-1-999',
      filePath: '/vault/notes.md',
    });
  });
});

describe('runtime login checks are shared between screens', () => {
  async function freshBridge() {
    vi.resetModules();
    mocks.isTauri.mockReturnValue(true);
    return import('./tauri-acp');
  }
  const loginChecks = () =>
    mocks.invoke.mock.calls.filter(([command, args]) => command === 'acp_detect_runtimes' && args?.probeLogin).length;

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends one login check for any number of screens asking at once', async () => {
    mocks.invoke.mockResolvedValue([]);
    const { detectAcpRuntimes } = await freshBridge();

    await Promise.all(Array.from({ length: 5 }, () => detectAcpRuntimes({ probeLogin: true })));

    expect(loginChecks()).toBe(1);
  });

  it('reuses the answer for a minute and then asks again', async () => {
    vi.useFakeTimers();
    mocks.invoke.mockResolvedValue([]);
    const { detectAcpRuntimes } = await freshBridge();

    await detectAcpRuntimes({ probeLogin: true });
    vi.advanceTimersByTime(59_000);
    await detectAcpRuntimes({ probeLogin: true });
    expect(loginChecks()).toBe(1);

    vi.advanceTimersByTime(2_000);
    await detectAcpRuntimes({ probeLogin: true });
    expect(loginChecks()).toBe(2);
  });

  it('asks again at once when a person presses re-check', async () => {
    mocks.invoke.mockResolvedValue([]);
    const { detectAcpRuntimes } = await freshBridge();

    await detectAcpRuntimes({ probeLogin: true });
    await detectAcpRuntimes({ probeLogin: true, force: true });

    expect(loginChecks()).toBe(2);
  });

  it('asks again after an answer that wants a sign-in, while still sharing the one in flight', async () => {
    mocks.invoke.mockResolvedValue([{ id: 'claude-acp', state: 'login-needed' }]);
    const { detectAcpRuntimes } = await freshBridge();

    await Promise.all([detectAcpRuntimes({ probeLogin: true }), detectAcpRuntimes({ probeLogin: true })]);
    expect(loginChecks()).toBe(1);

    await detectAcpRuntimes({ probeLogin: true });
    expect(loginChecks()).toBe(2);
  });

  it('does not keep a failed check for the next screen', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('bridge busy')).mockResolvedValue([]);
    const { detectAcpRuntimes } = await freshBridge();

    await expect(detectAcpRuntimes({ probeLogin: true })).rejects.toThrow('bridge busy');
    await detectAcpRuntimes({ probeLogin: true });

    expect(loginChecks()).toBe(2);
  });

  it('leaves the disk-only pass unshared, since it launches nothing', async () => {
    mocks.invoke.mockResolvedValue([]);
    const { detectAcpRuntimes } = await freshBridge();

    await Promise.all([detectAcpRuntimes(), detectAcpRuntimes()]);

    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(loginChecks()).toBe(0);
  });
});

describe('each agent session streams on its own channel', () => {
  function startWith(sessionId: string, beforeAnswer?: (channel: SessionChannel) => void) {
    let channel: SessionChannel | null = null;
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockImplementationOnce(async (_command: string, args: { onEvent: SessionChannel }) => {
      channel = args.onEvent;
      beforeAnswer?.(channel);
      return sessionId;
    });
    return { started: startAcpSession('claude-acp', '/vault'), channel: () => channel! };
  }

  it('hands a listener the events that arrived before it listened, then the rest in order', async () => {
    const session = startWith('acp-1-10', (channel) => {
      channel.onmessage({ kind: 'notice', message: 'npx-first-run-download' });
      channel.onmessage({ kind: 'stderr', line: 'npm warn' });
    });
    expect(await session.started).toBe('acp-1-10');
    const seen: string[] = [];

    await listenToAcpSession('acp-1-10', {
      onNotice: (message) => seen.push(`notice ${message}`),
      onStderr: (line) => seen.push(`stderr ${line}`),
      onMessage: (line) => seen.push(`message ${line}`),
      onExit: (code) => seen.push(`exit ${code}`),
    });
    session.channel().onmessage({ kind: 'message', line: '{"id":1}' });
    session.channel().onmessage({ kind: 'exit', code: 0 });

    expect(seen).toEqual(['notice npx-first-run-download', 'stderr npm warn', 'message {"id":1}', 'exit 0']);
  });

  it('never gives one conversation the lines of another', async () => {
    const first = startWith('acp-1-11');
    await first.started;
    const second = startWith('acp-2-12');
    await second.started;
    const heard: string[] = [];
    await listenToAcpSession('acp-1-11', { onMessage: (line) => heard.push(line) });

    second.channel().onmessage({ kind: 'message', line: 'for the second session' });
    first.channel().onmessage({ kind: 'message', line: 'for the first session' });

    expect(heard).toEqual(['for the first session']);
  });

  it('stops delivering once the listener detaches', async () => {
    const session = startWith('acp-1-13');
    await session.started;
    const heard: string[] = [];
    const detach = await listenToAcpSession('acp-1-13', { onMessage: (line) => heard.push(line) });

    detach();
    session.channel().onmessage({ kind: 'message', line: 'after detach' });

    expect(heard).toEqual([]);
  });

  it('stops a session whose startup event count exceeds the retention budget', async () => {
    const session = startWith('acp-count-overflow', (channel) => {
      for (let i = 0; i < 257; i++) channel.onmessage({ kind: 'notice', message: 'progress' });
    });

    await expect(session.started).rejects.toThrow('acp-startup-buffer-overflow');
    expect(mocks.invoke).toHaveBeenCalledWith('acp_stop', { sessionId: 'acp-count-overflow' });
  });

  it('stops startup when one event exceeds the text retention budget', async () => {
    const session = startWith('acp-text-overflow', (channel) => {
      channel.onmessage({ kind: 'message', line: 'x'.repeat(1_048_577) });
    });

    await expect(session.started).rejects.toThrow('acp-startup-buffer-overflow');
    expect(mocks.invoke).toHaveBeenCalledWith('acp_stop', { sessionId: 'acp-text-overflow' });
  });

  it('counts text across separate startup events', async () => {
    const session = startWith('acp-text-sum', (channel) => {
      channel.onmessage({ kind: 'message', line: 'x'.repeat(524_289) });
      channel.onmessage({ kind: 'stderr', line: 'y'.repeat(524_289) });
    });

    await expect(session.started).rejects.toThrow('acp-startup-buffer-overflow');
    expect(mocks.invoke).toHaveBeenCalledWith('acp_stop', { sessionId: 'acp-text-sum' });
  });

  it('replays every startup event up to the count retention budget', async () => {
    const lines = Array.from({ length: 256 }, (_, index) => String(index));
    const session = startWith('acp-count-boundary', (channel) => {
      for (const line of lines) channel.onmessage({ kind: 'message', line });
    });
    await session.started;
    const heard: string[] = [];

    await listenToAcpSession('acp-count-boundary', { onMessage: (line) => heard.push(line) });

    expect(heard).toEqual(lines);
  });

  it('delivers a complete event exactly at the text retention budget', async () => {
    const line = 'x'.repeat(1_048_576);
    const session = startWith('acp-text-boundary', (channel) => {
      channel.onmessage({ kind: 'message', line });
    });
    await session.started;
    const heard = vi.fn();

    await listenToAcpSession('acp-text-boundary', { onMessage: heard });

    expect(heard).toHaveBeenCalledExactlyOnceWith(line);
  });

  it('refuses an overflow after start resolves without replaying a partial protocol prefix', async () => {
    const session = startWith('acp-late-overflow');
    await session.started;
    session.channel().onmessage({ kind: 'message', line: '{"method":"session/request_permission"}' });
    for (let i = 0; i < 256; i++) session.channel().onmessage({ kind: 'stderr', line: 'diagnostic' });
    const heard = vi.fn();

    await expect(listenToAcpSession('acp-late-overflow', { onMessage: heard })).rejects.toThrow('acp-startup-buffer-overflow');

    expect(heard).not.toHaveBeenCalled();
    expect(mocks.invoke).toHaveBeenCalledWith('acp_stop', { sessionId: 'acp-late-overflow' });
  });

  it('ignores channel callbacks after an explicit stop', async () => {
    const session = startWith('acp-explicit-stop');
    await session.started;
    const heard = vi.fn();
    await listenToAcpSession('acp-explicit-stop', { onMessage: heard });

    await stopAcpSession('acp-explicit-stop');
    session.channel().onmessage({ kind: 'message', line: 'late output' });

    expect(heard).not.toHaveBeenCalled();
  });

  it('does not replay the remaining startup events after a listener stops the session', async () => {
    const session = startWith('acp-stop-in-replay', (channel) => {
      channel.onmessage({ kind: 'message', line: 'first' });
      channel.onmessage({ kind: 'message', line: 'after stop' });
    });
    await session.started;
    const heard: string[] = [];

    await listenToAcpSession('acp-stop-in-replay', { onMessage: (line) => {
      heard.push(line);
      void stopAcpSession('acp-stop-in-replay');
    } });

    expect(heard).toEqual(['first']);
  });

  it('refuses partial startup even when native termination rejects', async () => {
    const session = startWith('acp-stop-error');
    await session.started;
    for (let i = 0; i < 257; i++) session.channel().onmessage({ kind: 'notice', message: 'progress' });
    mocks.invoke.mockRejectedValueOnce(new Error('termination-failed'));

    await expect(listenToAcpSession('acp-stop-error', {})).rejects.toThrow('acp-startup-buffer-overflow');
  });
});
