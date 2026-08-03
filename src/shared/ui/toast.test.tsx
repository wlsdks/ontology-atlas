import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

/*
 * 토스트의 **후속 동작(action)** 계약 (2026-08-03, PO 카운슬 평결 ⑤).
 *
 * 이 파일이 생긴 이유: `show()` 는 앱의 단일 알림 경로이고 호출부가 ~50곳인데
 * 단위 테스트가 하나도 없었다. 액션 인자를 더하면서 **기존 호출부가 한 톨도
 * 안 바뀐다**는 것을 말로만 주장할 수 없어서 그 주장을 게이트로 만든다.
 *
 * sonner 를 목으로 세우는 이유: 실제 렌더가 아니라 **우리가 sonner 에 무엇을
 * 넘기는지**가 계약이다. 렌더는 sonner 의 책임이고 그건 우리 게이트가 아니다.
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
   * 가장 중요한 단언. 액션을 안 주면 sonner 에 **옵션 객체 자체를 넘기지
   * 않는다** — `undefined` 를 명시적으로 넘기는 것과 다르다. 기존 호출부
   * ~50곳의 동작을 바꾸지 않겠다는 약속이 이 줄이다.
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
    // 핸들러는 **호출되지 않는다** — 토스트를 띄우는 것이 곧 실행이면
    // 사용자가 누를 기회가 없고, 그러면 「눌렀는지」를 관측할 수 없다.
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
