import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIRST_RUN_STARTER_DISMISSED_KEY } from './first-run-starter-dismiss';

interface MockVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  errorMessage: string | null;
  /** The **variant** of the failure. For variants that leak no raw string, this value is the only meaning. */
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

// The starter body's language follows the screen's, and the hook reads `useLocale()`,
// so this unit test — which runs without an intl provider — needs a locale stub.
vi.mock('next-intl', () => ({
  useLocale: () => 'ko',
  // Checks **which string was chosen**, not the string itself — the key is returned verbatim.
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
  // Walkthrough 2026-07-26 — the INDEX's "create a new vault" also produces a starter
  // in the screen's language (the same result as the checklist and docs CTAs).
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
  // Measured regression guard 2026-07-23 — a card covered beneath the tour scrim
  // swallowed Escape in the capture phase and was permanently dismissed, while the
  // tour's `close-tour` ladder rung never received that keypress.
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
   * Review 2026-08-16: "not a valid root" and "the folder is gone" deliberately leave
   * `errorMessage` null so no raw string reaches the screen. But this card looked only
   * at that value, so in both cases it **said nothing at all**. Silence on screen while
   * the code knows the meaning is worse than leaking the raw string.
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
    // An empty string drops the screen to `errorFallback` — null would show no card at all.
    expect(result.current.errorText).toBe('');
  });
});
