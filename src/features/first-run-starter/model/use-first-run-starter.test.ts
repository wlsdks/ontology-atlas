import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIRST_RUN_STARTER_DISMISSED_KEY } from './first-run-starter-dismiss';

interface MockVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  errorMessage: string | null;
  /** The **variant** of the failure. For variants that leak no raw string, this value is the only meaning. */
  errorCode?: 'root-rejected' | 'path-missing' | 'access-failed' | null;
  handle?: { name: string } | null;
  open: ReturnType<typeof vi.fn>;
  scaffoldOntology: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  vault: null as unknown as MockVault,
  sampleModeSettled: true,
  desktop: true,
  rootPath: '/Users/dana/my-product' as string | null,
  requestAgentChat: vi.fn(),
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

vi.mock('@/shared/lib/desktop-shell', () => ({
  isDesktopShell: () => mocks.desktop,
}));

vi.mock('@/shared/lib/agent-chat-intent', () => ({
  requestAgentChat: (...args: unknown[]) => mocks.requestAgentChat(...args),
}));

vi.mock('@/shared/lib/tauri-vault-fs', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/tauri-vault-fs')>(
    '@/shared/lib/tauri-vault-fs',
  );
  return { ...actual, getTauriVaultRootPath: () => mocks.rootPath };
});

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
    handle: { name: 'my-product' },
    open: vi.fn(async () => undefined),
    scaffoldOntology: vi.fn(async () => ({ created: 8, skipped: 0 })),
  };
}

describe('useFirstRunStarter', () => {
  beforeEach(() => {
    mocks.vault = makeVault();
    mocks.sampleModeSettled = true;
    mocks.desktop = true;
    mocks.rootPath = '/Users/dana/my-product';
    mocks.requestAgentChat.mockClear();
    window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
  });
  afterEach(() => {
    // ⚠️ Explicit, because the handoff effect below is the one thing in this hook that reaches
    // outside itself. A hook left mounted keeps watching a vault the next test is still setting
    // up, and 「did the door fire」 stops meaning anything.
    cleanup();
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

describe('내 코드로 지도 만들기 — 코드를 이미 가진 사람의 문 (2026-08-24)', () => {
  beforeEach(() => {
    mocks.vault = makeVault();
    mocks.sampleModeSettled = true;
    mocks.desktop = true;
    mocks.rootPath = '/Users/dana/my-product';
    mocks.requestAgentChat.mockClear();
  });
  afterEach(() => {
    // ⚠️ Explicit. The handoff effect is the one thing in this hook that reaches outside itself,
    // so a hook left mounted keeps watching a vault the next test is still setting up — and
    // 「did the door fire」 stops meaning anything.
    cleanup();
  });

  /*
   * Measured on the shipped card: of its four actions none makes an ontology from a repository
   * that already exists. This door hands that work to the agent, because the app never calls
   * MCP itself — and the handoff must not happen until a folder has actually landed.
   */
  it('폴더가 실제로 열린 뒤에야 에이전트에게 넘긴다', async () => {
    const { result, rerender } = renderHook(() => useFirstRunStarter());

    await act(async () => {
      await result.current.buildFromCode();
    });
    expect(
      mocks.requestAgentChat,
      '피커가 닫힌 것만으로 넘기면 아무도 고르지 않은 폴더로 대화가 열린다',
    ).not.toHaveBeenCalled();

    mocks.vault.status = 'loaded';
    mocks.vault.manifest = { docs: [] };
    rerender();

    await waitFor(() => expect(mocks.requestAgentChat).toHaveBeenCalledTimes(1));
    const [runtimeId, prompt] = mocks.requestAgentChat.mock.calls[0] as [unknown, string];
    expect(runtimeId, '어느 도구인지는 화면이 고른 것을 따른다').toBeNull();
    expect(prompt).toContain('/Users/dana/my-product');
    // The order is the contract: survey, then propose, then write.
    expect(prompt).toContain('analyze_repo_structure');
    expect(prompt).toContain('connect_project_source');
    expect(prompt.indexOf('analyze_repo_structure')).toBeLessThan(
      prompt.indexOf('connect_project_source'),
    );
  });

  it('취소한 피커로는 넘기지 않는다 — 취소는 상태 변화가 아니다', async () => {
    const { result, rerender } = renderHook(() => useFirstRunStarter());
    await act(async () => {
      await result.current.buildFromCode();
    });
    /*
     * The picker closed with nothing chosen: `use-local-vault` deliberately leaves the state as it
     * was, so the vault never reaches 'loaded'.
     *
     * ⚠️ The re-render alone does not prove the guard — with the vault untouched the effect's
     * dependencies never change and it never re-runs, so this passed even with the guard removed
     * (measured). Something the effect watches has to move while the vault is still unopened. A
     * second press is exactly that, and it is also the real sequence: cancel, then try again.
     */
    mocks.vault.handle = { name: 'a-different-attempt' };
    rerender();
    await act(async () => {
      await result.current.buildFromCode();
    });
    rerender();
    expect(
      mocks.requestAgentChat,
      '폴더가 열리지 않았는데 넘겼다 — 아무도 고르지 않은 폴더로 대화가 열린다',
    ).not.toHaveBeenCalled();
  });

  it('웹에서는 문 자체가 없다 — 넘길 에이전트가 없다', async () => {
    mocks.desktop = false;
    const { result, rerender } = renderHook(() => useFirstRunStarter());
    expect(result.current.canBuildFromCode).toBe(false);

    await act(async () => {
      await result.current.buildFromCode();
    });
    mocks.vault.status = 'loaded';
    mocks.vault.manifest = { docs: [] };
    rerender();
    // Drawn nowhere on the web, and refused here too — a request that arrived some other way
    // still must not promise a conversation that cannot open.
    expect(mocks.requestAgentChat).not.toHaveBeenCalled();
  });

  it('경로를 모르면 폴더 이름으로 말하고, 없는 경로를 지어내지 않는다', async () => {
    mocks.rootPath = null;
    mocks.vault.handle = { name: 'my-product' };
    const { result, rerender } = renderHook(() => useFirstRunStarter());
    await act(async () => {
      await result.current.buildFromCode();
    });
    mocks.vault.status = 'loaded';
    mocks.vault.manifest = { docs: [] };
    rerender();

    await waitFor(() => expect(mocks.requestAgentChat).toHaveBeenCalledTimes(1));
    const prompt = mocks.requestAgentChat.mock.calls[0][1] as string;
    expect(prompt).toContain('my-product');
    expect(prompt).not.toContain('null');
    expect(prompt).not.toContain('undefined');
  });
});
