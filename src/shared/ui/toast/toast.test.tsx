import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

/*
 * The contract is what we hand to sonner, so sonner is mocked: adding the action argument must
 * leave every existing `show()` call unchanged.
 */
const sonnerToast = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: sonnerToast,
  Toaster: () => null,
}));

vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (k: string) => k }));

import { useToast } from './toast';

function show(...args: Parameters<ReturnType<typeof useToast>['show']>) {
  const { result } = renderHook(() => useToast());
  result.current.show(...args);
}

beforeEach(() => {
  sonnerToast.success.mockClear();
  sonnerToast.info.mockClear();
  sonnerToast.warning.mockClear();
  sonnerToast.error.mockClear();
});

describe('useToast follow-up action contract', () => {
  /* With no action only the id is handed over, so existing call sites keep their behaviour. */
  it('passes only the id to sonner without an action', () => {
    show('저장됨');
    expect(sonnerToast.success).toHaveBeenCalledWith('저장됨', { id: 'success:저장됨' });
  });

  it('routes each tone to its sonner method without an action', () => {
    show('실패', 'error');
    show('안내', 'info');
    expect(sonnerToast.error).toHaveBeenCalledWith('실패', { id: 'error:실패' });
    expect(sonnerToast.info).toHaveBeenCalledWith('안내', { id: 'info:안내' });
  });

  // Done with a caveat: its own sonner type, so the glyph is the triangle.
  it('routes the warning tone to sonner warning', () => {
    show('붙였지만 꺼져 있어요', 'warning');
    expect(sonnerToast.warning).toHaveBeenCalledWith('붙였지만 꺼져 있어요', {
      id: 'warning:붙였지만 꺼져 있어요',
    });
  });

  /*
   * The id is tone plus message, so a repeat while the first is visible updates it instead of
   * stacking a twin; different tones stay apart.
   */
  it('reuses the id for the same message so toasts do not stack', () => {
    show('역량 6 편집', 'info');
    show('역량 6 편집', 'info');
    const ids = sonnerToast.info.mock.calls.map(([, options]) => (options as { id: string }).id);
    expect(ids).toEqual(['info:역량 6 편집', 'info:역량 6 편집']);
    show('역량 6 편집', 'success');
    expect(sonnerToast.success).toHaveBeenCalledWith('역량 6 편집', { id: 'success:역량 6 편집' });
  });

  it('passes the action label and handler through', () => {
    const onClick = vi.fn();
    show('만들었어요', 'success', { label: '지도에서 보기', onClick });

    expect(sonnerToast.success).toHaveBeenCalledWith('만들었어요', {
      id: 'success:만들었어요',
      action: { label: '지도에서 보기', onClick },
    });
    // Not called on show: the person must get the chance to press it.
    expect(onClick).not.toHaveBeenCalled();
  });

  it('passes the description separately from the title and action', () => {
    const onClick = vi.fn();
    show('새 문서를 만들었습니다', 'success', { label: '되돌리기', onClick }, {
      description: '결제 정산 정책.md',
    });

    expect(sonnerToast.success).toHaveBeenCalledWith('새 문서를 만들었습니다', {
      id: '["success","새 문서를 만들었습니다","결제 정산 정책.md"]',
      action: { label: '되돌리기', onClick },
      description: '결제 정산 정책.md',
    });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('stacks the same result for different documents and updates a repeat for the same one', () => {
    const outcome = '새 문서를 만들었습니다';
    show(outcome, 'success', undefined, { description: '결제 정책.md' });
    show(outcome, 'success', undefined, { description: '환불 정책.md' });
    show(outcome, 'success', undefined, { description: '결제 정책.md' });

    const ids = sonnerToast.success.mock.calls.map(([, options]) =>
      (options as { id: string }).id,
    );
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[0]).toBe(ids[2]);
  });

  it('attaches an action the same way for error and info tones', () => {
    const onClick = vi.fn();
    show('멎었어요', 'error', { label: '다시', onClick });
    expect(sonnerToast.error).toHaveBeenCalledWith('멎었어요', {
      id: 'error:멎었어요',
      action: { label: '다시', onClick },
    });
  });
});
