import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

/*
 * The contract for a toast's **follow-up action** (2026-08-03, PO council
 * verdict ⑤).
 *
 * Why this file exists: `show()` is the app's single notification path with ~50
 * call sites and had no unit tests at all. Adding the action argument came with
 * the claim that **not one existing call site changes**, and a claim like that
 * has to be a gate rather than a sentence.
 *
 * sonner is mocked because the contract is **what we hand to sonner**, not the
 * rendered result — rendering is sonner's responsibility and not our gate.
 */
const sonnerToast = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: sonnerToast,
  Toaster: () => null,
}));

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }));

import { useToast } from './toast';

function show(...args: Parameters<ReturnType<typeof useToast>['show']>) {
  const { result } = renderHook(() => useToast());
  result.current.show(...args);
}

beforeEach(() => {
  sonnerToast.success.mockClear();
  sonnerToast.info.mockClear();
  sonnerToast.error.mockClear();
});

describe('useToast — 후속 동작 계약', () => {
  /*
   * The most important assertion. With no action, **no options object is passed
   * to sonner at all**, which differs from explicitly passing `undefined`. This
   * line is the promise that the ~50 existing call sites do not change behaviour.
   */
  it('액션이 없으면 sonner 에 옵션을 아예 넘기지 않는다', () => {
    show('저장됨');
    expect(sonnerToast.success).toHaveBeenCalledWith('저장됨', undefined);
  });

  it('tone 은 종전대로 갈린다 — 액션 없이도', () => {
    show('실패', 'error');
    show('안내', 'info');
    expect(sonnerToast.error).toHaveBeenCalledWith('실패', undefined);
    expect(sonnerToast.info).toHaveBeenCalledWith('안내', undefined);
  });

  it('액션을 주면 라벨과 핸들러가 그대로 전달된다', () => {
    const onClick = vi.fn();
    show('만들었어요', 'success', { label: '지도에서 보기', onClick });

    expect(sonnerToast.success).toHaveBeenCalledWith('만들었어요', {
      action: { label: '지도에서 보기', onClick },
    });
    // The handler is **not called**: if showing the toast were also running it,
    // the user never gets the chance to press, and "did they press" becomes
    // unobservable.
    expect(onClick).not.toHaveBeenCalled();
  });

  it('액션은 error·info 톤에서도 같은 문법으로 붙는다', () => {
    const onClick = vi.fn();
    show('멎었어요', 'error', { label: '다시', onClick });
    expect(sonnerToast.error).toHaveBeenCalledWith('멎었어요', {
      action: { label: '다시', onClick },
    });
  });
});
