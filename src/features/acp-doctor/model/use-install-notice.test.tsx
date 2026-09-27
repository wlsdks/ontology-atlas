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

describe('install notice badge', () => {
  it('counts tools whose install finished', async () => {
    const { result } = renderHook(() => useInstallNotice(false));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => emit?.(progress('claude-acp', 'done')));
    expect(result.current.count).toBe(1);
  });

  it('counts a failed install as finished', async () => {
    const { result } = renderHook(() => useInstallNotice(false));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => emit?.(progress('codex-acp', 'failed')));
    expect(result.current.count).toBe(1);
  });

  it('does not count an install that is still running', async () => {
    const { result } = renderHook(() => useInstallNotice(false));
    await act(async () => {
      await Promise.resolve();
    });
    for (const stage of ['downloading', 'extracting', 'installing', 'verifying-install']) {
      act(() => emit?.(progress('claude-acp', stage)));
    }
    expect(result.current.count).toBe(0);
  });

  it('counts a tool once when it finishes twice', async () => {
    const { result } = renderHook(() => useInstallNotice(false));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => emit?.(progress('claude-acp', 'done')));
    act(() => emit?.(progress('claude-acp', 'done')));
    expect(result.current.count).toBe(1);
  });

  it('counts two finished tools as two', async () => {
    const { result } = renderHook(() => useInstallNotice(false));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => emit?.(progress('claude-acp', 'done')));
    act(() => emit?.(progress('codex-acp', 'failed')));
    expect(result.current.count).toBe(2);
  });

  it('shows no badge while the doctor screen is open', async () => {
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

  it('stops listening after unmount', async () => {
    const { unmount } = renderHook(() => useInstallNotice(false));
    await act(async () => {
      await Promise.resolve();
    });
    expect(emit).not.toBeNull();
    unmount();
    expect(emit).toBeNull();
  });
});
