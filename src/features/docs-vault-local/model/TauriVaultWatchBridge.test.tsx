import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * 위험 경로 — TauriVaultWatchBridge 의 "Rust 파일워처 이벤트 → poll 트리거"
 * 매핑. 데스크톱(Tauri)에서 에이전트가 디스크에 쓰는 순간 화면이 즉시
 * 따라오게 하는 유일한 경로이자, 잘못 배선되면 OS 이벤트가 와도 화면이
 * 갱신되지 않거나(구식 데이터로 편집 계속 → 다음 저장이 conflict), 반대로
 * 리스너가 중복 등록돼 refresh 가 여러 번 겹쳐 도는 회귀를 만들 수 있다.
 */

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriMocks.invoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: tauriMocks.listen,
}));

const tauriFsMocks = vi.hoisted(() => ({
  isTauriVaultRuntime: vi.fn(() => false),
  getTauriVaultRootPath: vi.fn(() => null as string | null),
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  isTauriVaultRuntime: tauriFsMocks.isTauriVaultRuntime,
  getTauriVaultRootPath: tauriFsMocks.getTauriVaultRootPath,
}));

const localVaultMocks = vi.hoisted(() => ({
  useLocalVault: vi.fn(),
}));

vi.mock('./LocalVaultProvider', () => ({
  useLocalVault: localVaultMocks.useLocalVault,
}));

import { TauriVaultWatchBridge } from './TauriVaultWatchBridge';

function fakeHandle(name = 'vault'): FileSystemDirectoryHandle {
  return { kind: 'directory', name } as unknown as FileSystemDirectoryHandle;
}

afterEach(() => {
  vi.clearAllMocks();
  tauriFsMocks.isTauriVaultRuntime.mockReturnValue(false);
  tauriFsMocks.getTauriVaultRootPath.mockReturnValue(null);
});

describe('TauriVaultWatchBridge', () => {
  it('웹(비-Tauri) 런타임에서는 no-op — 파일워처를 켜지 않는다 (5초 폴링 fallback 이 커버)', () => {
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      refresh: vi.fn(),
    });
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(false);

    render(<TauriVaultWatchBridge />);

    expect(tauriMocks.invoke).not.toHaveBeenCalled();
    expect(tauriMocks.listen).not.toHaveBeenCalled();
  });

  it('Tauri 런타임 + loaded 상태면 파일워처를 켜고 vault-changed 이벤트를 구독한다', async () => {
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(true);
    tauriFsMocks.getTauriVaultRootPath.mockReturnValue('/Users/me/vault');
    tauriMocks.invoke.mockResolvedValue(undefined);
    const unlisten = vi.fn();
    tauriMocks.listen.mockResolvedValue(unlisten);
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      refresh: vi.fn(),
    });

    render(<TauriVaultWatchBridge />);

    await waitFor(() =>
      expect(tauriMocks.invoke).toHaveBeenCalledWith('start_vault_watch', {
        rootPath: '/Users/me/vault',
      }),
    );
    await waitFor(() => expect(tauriMocks.listen).toHaveBeenCalledWith('vault-changed', expect.any(Function)));
  });

  it('vault-changed 이벤트가 오면 refresh() 를 호출한다 — 이벤트→poll 트리거 매핑의 핵심', async () => {
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(true);
    tauriFsMocks.getTauriVaultRootPath.mockReturnValue('/Users/me/vault');
    tauriMocks.invoke.mockResolvedValue(undefined);
    const refresh = vi.fn(async () => undefined);
    let capturedHandler: (() => void) | null = null;
    tauriMocks.listen.mockImplementation(async (_event: string, handler: () => void) => {
      capturedHandler = handler;
      return vi.fn();
    });
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      refresh,
    });

    render(<TauriVaultWatchBridge />);

    await waitFor(() => expect(capturedHandler).not.toBeNull());
    act(() => {
      capturedHandler?.();
    });

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('refresh 참조는 ref 로 최신값을 따라간다 — status/rootPath 가 같으면 재구독하지 않는다', async () => {
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(true);
    tauriFsMocks.getTauriVaultRootPath.mockReturnValue('/Users/me/vault');
    tauriMocks.invoke.mockResolvedValue(undefined);
    let capturedHandler: (() => void) | null = null;
    tauriMocks.listen.mockImplementation(async (_event: string, handler: () => void) => {
      capturedHandler = handler;
      return vi.fn();
    });
    const firstRefresh = vi.fn(async () => undefined);
    const secondRefresh = vi.fn(async () => undefined);
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      refresh: firstRefresh,
    });

    const { rerender } = render(<TauriVaultWatchBridge />);
    await waitFor(() => expect(tauriMocks.listen).toHaveBeenCalledTimes(1));

    // refresh 함수 참조만 바뀌고 status/handle 은 그대로인 재렌더 — 흔히
    // 매 load() 뒤 발생. 재구독(listen 재호출) 이 일어나면 안 된다.
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      refresh: secondRefresh,
    });
    rerender(<TauriVaultWatchBridge />);

    expect(tauriMocks.listen).toHaveBeenCalledTimes(1); // 재구독 없음

    act(() => {
      capturedHandler?.();
    });
    await waitFor(() => expect(secondRefresh).toHaveBeenCalledTimes(1));
    expect(firstRefresh).not.toHaveBeenCalled();
  });

  it('invoke 가 실패해도(권한 거부 등) throw 하지 않는다 — 폴링 fallback 이 계속 커버해야 한다', async () => {
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(true);
    tauriFsMocks.getTauriVaultRootPath.mockReturnValue('/Users/me/vault');
    tauriMocks.invoke.mockRejectedValue(new Error('permission denied'));
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      refresh: vi.fn(),
    });

    expect(() => render(<TauriVaultWatchBridge />)).not.toThrow();
    await waitFor(() => expect(tauriMocks.invoke).toHaveBeenCalledTimes(1));
    expect(tauriMocks.listen).not.toHaveBeenCalled();
  });
});
