import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIRST_RUN_STARTER_DISMISSED_KEY } from './first-run-starter-dismiss';

interface MockVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  errorMessage: string | null;
  /** 실패의 **갈래**. 원문을 안 흘리는 갈래는 이 값만 뜻을 갖는다. */
  errorCode?: 'root-rejected' | 'path-missing' | 'access-failed' | null;
  open: ReturnType<typeof vi.fn>;
  scaffoldOntology: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  vault: null as unknown as MockVault,
  sampleModeSettled: true,
}));

vi.mock('@/features/docs-vault-local', async () => {
  const actual = await vi.importActual<typeof import('@/features/docs-vault-local')>(
    '@/features/docs-vault-local',
  );
  return { ...actual, useLocalVault: () => mocks.vault };
});

vi.mock('./use-first-run-sample-mode-settled', () => ({
  useFirstRunSampleModeSettled: () => mocks.sampleModeSettled,
}));

// 스타터 본문 언어는 화면 언어를 따른다 — 훅이 useLocale() 을 읽으므로
// intl provider 없이 도는 이 단위 테스트에는 로케일 스텁이 필요하다.
vi.mock('next-intl', () => ({
  useLocale: () => 'ko',
  // 문구 자체가 아니라 **어느 문구를 골랐나**를 검사한다 — 키를 그대로 돌려준다.
  useTranslations: () => (key: string) => key,
}));

import { useFirstRunStarter } from './use-first-run-starter';

function makeVault(): MockVault {
  return {
    status: 'idle',
    manifest: null,
    errorMessage: null,
    errorCode: null,
    open: vi.fn(async () => undefined),
    scaffoldOntology: vi.fn(async () => ({ created: 8, skipped: 0 })),
  };
}

describe('useFirstRunStarter', () => {
  beforeEach(() => {
    mocks.vault = makeVault();
    mocks.sampleModeSettled = true;
    window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
  });
  afterEach(() => {
    window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
  });

  it('is visible when sample mode has settled and nothing was dismissed', () => {
    const { result } = renderHook(() => useFirstRunStarter());
    expect(result.current.visible).toBe(true);
  });

  it('is not visible once a vault is active (sample mode not settled to static)', () => {
    mocks.sampleModeSettled = false;
    const { result } = renderHook(() => useFirstRunStarter());
    expect(result.current.visible).toBe(false);
  });

  it('honors a dismissal already recorded earlier in this session', () => {
    window.sessionStorage.setItem(FIRST_RUN_STARTER_DISMISSED_KEY, '1');
    const { result } = renderHook(() => useFirstRunStarter());
    expect(result.current.visible).toBe(false);
  });

  it('dismiss() hides the module and persists to sessionStorage for the session', () => {
    const { result } = renderHook(() => useFirstRunStarter());

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.visible).toBe(false);
    expect(window.sessionStorage.getItem(FIRST_RUN_STARTER_DISMISSED_KEY)).toBe('1');
  });

  it('openFolder() calls vault.open() directly (no /docs redirect)', async () => {
    const { result } = renderHook(() => useFirstRunStarter());

    await act(async () => {
      await result.current.openFolder();
    });

    expect(mocks.vault.open).toHaveBeenCalledTimes(1);
  });

  it('createVault() reuses the shared vault-create-flow (open + scaffold empty folder)', async () => {
    mocks.vault.open = vi.fn(async () => {
      mocks.vault.status = 'loaded';
      mocks.vault.manifest = { docs: [] };
    });
    const { result, rerender } = renderHook(() => useFirstRunStarter());

    await act(async () => {
      await result.current.createVault();
    });
    rerender();

    await waitFor(() => {
      expect(mocks.vault.scaffoldOntology).toHaveBeenCalledTimes(1);
    });
    // 흐름 점검 2026-07-26 D2 — INDEX 의 "새 vault 만들기" 도 화면 언어의
    // 스타터를 만든다(체크리스트/문서함 CTA 와 같은 결과).
    expect(mocks.vault.scaffoldOntology).toHaveBeenCalledWith('ko');
  });

  it('consumes Escape at capture priority and dismisses without leaking to a bubble-phase listener', () => {
    const { result } = renderHook(() => useFirstRunStarter());
    const bubbleHandler = vi.fn();
    window.addEventListener('keydown', bubbleHandler);

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(result.current.visible).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    window.removeEventListener('keydown', bubbleHandler);
  });

  it('yields Escape to the guided tour while its overlay is open (no silent permanent dismiss)', () => {
    // 2026-07-23 Guardian 실측 회귀 가드 — 투어 스크림 아래에 덮인 카드가
    // 캡처 단계에서 Escape 를 삼켜 영구 dismiss 되고, 투어의 `close-tour`
    // 사다리 단이 그 keypress 를 영영 못 받았다.
    const overlay = document.createElement('div');
    overlay.setAttribute('data-testid', 'guided-tour-overlay');
    document.body.appendChild(overlay);
    try {
      const { result } = renderHook(() => useFirstRunStarter());

      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      act(() => {
        window.dispatchEvent(event);
      });

      expect(result.current.visible).toBe(true);
      expect(event.defaultPrevented).toBe(false);
    } finally {
      overlay.remove();
    }
  });

  it('does nothing on Escape when not visible', () => {
    mocks.sampleModeSettled = false;
    renderHook(() => useFirstRunStarter());

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});

describe('첫 실행 카드 — 말할 수 있는 실패는 말한다', () => {
  /*
   * 2026-08-16 검수: 「받을 수 없는 자리」와 「폴더가 사라짐」은 원문을 화면에
   * 흘리지 않으려고 `errorMessage` 를 일부러 null 로 둔다. 그런데 이 카드는
   * 그 값만 보고 있어서, 두 경우에 **아무 말도 안 나왔다.** 코드가 뜻을 아는데
   * 화면이 침묵하는 것은 원문을 흘리는 것보다 나쁘다.
   */
  beforeEach(() => {
    mocks.vault = makeVault();
    mocks.vault.status = 'error';
    mocks.vault.errorMessage = null;
    mocks.sampleModeSettled = true;
  });

  it('받을 수 없는 자리는 그 이유를 말한다', () => {
    mocks.vault.errorCode = 'root-rejected';
    const { result } = renderHook(() => useFirstRunStarter());
    expect(result.current.errorText).toBe('errorRootRejected');
  });

  it('폴더가 사라졌으면 「다시 시도」가 아니라 그 사실을 말한다', () => {
    mocks.vault.errorCode = 'path-missing';
    const { result } = renderHook(() => useFirstRunStarter());
    expect(result.current.errorText).toBe('errorPathMissing');
  });

  it('그 밖의 실패는 원문을 쓰되, 비어 있어도 카드가 뜬다', () => {
    mocks.vault.errorCode = 'access-failed';
    const { result } = renderHook(() => useFirstRunStarter());
    // 빈 문자열이면 화면이 `errorFallback` 으로 떨어진다 — null 이면 카드가 안 뜬다.
    expect(result.current.errorText).toBe('');
  });
});
