import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIRST_RUN_STARTER_DISMISSED_KEY } from './first-run-starter-dismiss';

interface MockVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  errorMessage: string | null;
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
vi.mock('next-intl', () => ({ useLocale: () => 'ko' }));

import { useFirstRunStarter } from './use-first-run-starter';

function makeVault(): MockVault {
  return {
    status: 'idle',
    manifest: null,
    errorMessage: null,
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
