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

import { acpPermissionVerdict, listenToAcpSession, startAcpSession } from './tauri-acp';

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
});
