import { afterEach, describe, expect, it, vi } from 'vitest';

const tauriApiMock = vi.hoisted(() => ({
  runtimeAvailable: false,
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriApiMock.invoke,
  isTauri: () => tauriApiMock.runtimeAvailable,
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: tauriApiMock.listen,
}));

import {
  isTerminalAvailable,
  onTermData,
  onTermExit,
  termClose,
  termOpen,
  termResize,
  termWrite,
} from './tauri-terminal';

afterEach(() => {
  tauriApiMock.runtimeAvailable = false;
  tauriApiMock.invoke.mockReset();
  tauriApiMock.listen.mockReset();
});

describe('터미널 브리지 — 웹 강등', () => {
  it('브라우저에서는 사용 불가로 보고한다 (프로세스를 띄울 수 없다)', () => {
    expect(isTerminalAvailable()).toBe(false);
  });

  it('브리지가 없으면 어떤 커맨드도 나가지 않는다', async () => {
    expect(await termOpen('/vault', 80, 24)).toBeNull();
    await termWrite(1, 'claude\r');
    await termResize(1, 100, 30);
    await termClose(1);
    expect(tauriApiMock.invoke).not.toHaveBeenCalled();
  });

  it('브리지가 없으면 구독도 no-op unlisten 을 준다 (호출부가 분기하지 않게)', async () => {
    const un = await onTermData(1, () => {});
    expect(typeof un).toBe('function');
    expect(tauriApiMock.listen).not.toHaveBeenCalled();
  });
});

describe('터미널 브리지 — Rust 커맨드 계약', () => {
  it('커맨드 이름과 인자 모양을 고정한다', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({ id: 7, program: '/bin/zsh', cwd: '/vault' });

    const session = await termOpen('/vault', 80, 24);
    expect(session).toMatchObject({ id: 7, program: '/bin/zsh' });
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('terminal_open', {
      cwd: '/vault',
      cols: 80,
      rows: 24,
    });

    await termWrite(7, 'ls\r');
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('terminal_write', { id: 7, data: 'ls\r' });

    await termResize(7, 120, 40);
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('terminal_resize', {
      id: 7,
      cols: 120,
      rows: 40,
    });

    await termClose(7);
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('terminal_close', { id: 7 });
  });

  it('입력을 가공하지 않고 사용자가 친 그대로 넘긴다', async () => {
    // 신뢰 계약: 우리가 명령을 만들거나 보정하지 않는다. 제어문자·개행 포함
    // 원문 그대로 PTY 로 간다 — 브리지가 뭔가를 "도와주면" 숨은 입력이 된다.
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue(undefined);
    const raw = '  claude --dangerously-skip-permissions\r';
    await termWrite(3, raw);
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('terminal_write', { id: 3, data: raw });
  });

  it('출력·종료 채널이 세션별로 분리된다 (두 터미널이 섞이지 않게)', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.listen.mockResolvedValue(() => {});

    await onTermData(1, () => {});
    await onTermData(2, () => {});
    await onTermExit(1, () => {});

    const channels = tauriApiMock.listen.mock.calls.map(([name]) => name);
    expect(channels).toEqual([
      'terminal://data/1',
      'terminal://data/2',
      'terminal://exit/1',
    ]);
    expect(new Set(channels).size).toBe(3);
  });
});
