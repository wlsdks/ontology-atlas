import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useInstallNotice } from './use-install-notice';

/**
 * **When an install finishes while you are on another screen, say so.**
 *
 * Storing "completion while closed" in Rust revived it for **someone who came back**. This hook is the
 * other side — **telling them to come back.**
 */

let emit: ((progress: unknown) => void) | null = null;

vi.mock('./acp-doctor', async () => {
  const actual = await vi.importActual<typeof import('./acp-doctor')>('./acp-doctor');
  return {
    ...actual,
    listenInstallProgress: async (_runtimeId: string | null, onProgress: (p: unknown) => void) => {
      emit = onProgress;
      return () => {
        emit = null;
      };
    },
  };
});

const progress = (runtimeId: string, stage: string) => ({
  runtimeId,
  job: 'cli',
  stage,
  received: null,
  total: null,
  note: null,
  at: Date.now(),
});

beforeEach(() => {
  emit = null;
});

describe('설치 알림 배지', () => {
  it('끝난 도구를 센다', async () => {
    const { result } = renderHook(() => useInstallNotice(false));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => emit?.(progress('claude-acp', 'done')));
    expect(result.current.count).toBe(1);
  });

  it('실패도 종단이다 — 알려 줘야 할 일은 성공만이 아니다', async () => {
    const { result } = renderHook(() => useInstallNotice(false));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => emit?.(progress('codex-acp', 'failed')));
    expect(result.current.count).toBe(1);
  });

  it('진행 중에는 세지 않는다 — 배지는 종단 상태만 말한다', async () => {
    const { result } = renderHook(() => useInstallNotice(false));
    await act(async () => {
      await Promise.resolve();
    });
    for (const stage of ['downloading', 'extracting', 'installing', 'verifying-install']) {
      act(() => emit?.(progress('claude-acp', stage)));
    }
    expect(result.current.count).toBe(0);
  });

  it('같은 도구가 두 번 끝나도 하나다 — 세는 것은 사건이 아니라 도구다', async () => {
    const { result } = renderHook(() => useInstallNotice(false));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => emit?.(progress('claude-acp', 'done')));
    act(() => emit?.(progress('claude-acp', 'done')));
    expect(result.current.count).toBe(1);
  });

  it('도구가 둘이면 둘이다', async () => {
    const { result } = renderHook(() => useInstallNotice(false));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => emit?.(progress('claude-acp', 'done')));
    act(() => emit?.(progress('codex-acp', 'failed')));
    expect(result.current.count).toBe(2);
  });

  it('그 화면에 있으면 배지가 없다 — 보고 있는 것을 «안 봤다»고 말할 수 없다', async () => {
    const { result, rerender } = renderHook(({ at }) => useInstallNotice(at), {
      initialProps: { at: false },
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => emit?.(progress('claude-acp', 'done')));
    expect(result.current.count).toBe(1);
    rerender({ at: true });
    expect(result.current.count).toBe(0);
  });

  it('떼면 더는 안 듣는다', async () => {
    const { unmount } = renderHook(() => useInstallNotice(false));
    await act(async () => {
      await Promise.resolve();
    });
    expect(emit).not.toBeNull();
    unmount();
    expect(emit).toBeNull();
  });
});
