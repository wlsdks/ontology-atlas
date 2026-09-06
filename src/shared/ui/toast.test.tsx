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
   * With no action, the only option handed to sonner is the id (see below): the
   * ~50 existing call sites keep their behaviour, and no `action` key appears.
   */
  it('액션이 없으면 sonner 에 id 외의 옵션을 넘기지 않는다', () => {
    show('저장됨');
    expect(sonnerToast.success).toHaveBeenCalledWith('저장됨', { id: 'success:저장됨' });
  });

  it('tone 은 종전대로 갈린다 — 액션 없이도', () => {
    show('실패', 'error');
    show('안내', 'info');
    expect(sonnerToast.error).toHaveBeenCalledWith('실패', { id: 'error:실패' });
    expect(sonnerToast.info).toHaveBeenCalledWith('안내', { id: 'info:안내' });
  });

  /*
   * The id is the tone plus the message, so an identical notification raised twice
   * while the first is visible updates it instead of stacking a twin (two edits in
   * one agent turn produced two "capability edited" boxes, 2026-09-06). Different
   * tones of one message stay apart.
   */
  it('같은 메시지는 같은 id 로 나가서 겹쳐 쌓이지 않는다', () => {
    show('역량 6 편집', 'info');
    show('역량 6 편집', 'info');
    const ids = sonnerToast.info.mock.calls.map(([, options]) => (options as { id: string }).id);
    expect(ids).toEqual(['info:역량 6 편집', 'info:역량 6 편집']);
    show('역량 6 편집', 'success');
    expect(sonnerToast.success).toHaveBeenCalledWith('역량 6 편집', { id: 'success:역량 6 편집' });
  });

  it('액션을 주면 라벨과 핸들러가 그대로 전달된다', () => {
    const onClick = vi.fn();
    show('만들었어요', 'success', { label: '지도에서 보기', onClick });

    expect(sonnerToast.success).toHaveBeenCalledWith('만들었어요', {
      id: 'success:만들었어요',
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
      id: 'error:멎었어요',
      action: { label: '다시', onClick },
    });
  });
});
