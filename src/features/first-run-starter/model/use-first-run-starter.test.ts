import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIRST_RUN_STARTER_DISMISSED_KEY } from './first-run-starter-dismiss';

interface MockVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  errorMessage: string | null;
  /** The **variant** of the failure. For variants that leak no raw string, this value is the only meaning. */
  errorCode?: 'root-rejected' | 'path-missing' | 'permission-denied' | 'access-failed' | null;
  handle?: { name: string } | null;
  open: ReturnType<typeof vi.fn>;
  openRecent?: (record: { desktopRootPath?: string }) => Promise<unknown>;
  scaffoldOntology: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  vault: null as unknown as MockVault,
  sampleModeSettled: true,
  desktop: true,
  rootPath: '/Users/dana/my-product' as string | null,
  requestAgentChat: vi.fn(),
  /** What the native project picker returns; `null` is a cancel, which must never be a failure. */
  pickedProject: '/Users/dana/my-product' as string | null,
  /** Names directly under the chosen project — decides "create" versus "continue in". */
  projectEntries: ['src', 'package.json'] as string[],
  ensureChildDir: vi.fn(async (_root: string, _name: string) => undefined),
  openRecent: vi.fn(async (_record: { desktopRootPath?: string }) => undefined),
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
  return {
    ...actual,
    isTauriVaultRuntime: () => true,
    getTauriVaultRootPath: (handle: { __picked?: boolean } | null) =>
      // The project picker's handle carries the picked path; every other caller gets the vault's.
      handle?.__picked ? mocks.pickedProject : mocks.rootPath,
    createTauriVaultHandle: (rootPath: string) => ({ name: rootPath.split('/').pop() ?? rootPath }),
    pickTauriVaultDirectory: async () =>
      mocks.pickedProject === null ? null : { name: 'picked', __picked: true },
    listTauriDirectoryNames: async () => mocks.projectEntries,
    ensureTauriChildDirectory: (root: string, name: string) => mocks.ensureChildDir(root, name),
  };
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
    openRecent: (record: { desktopRootPath?: string }) => mocks.openRecent(record),
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

  /*
   * ⚠️ Owner, 2026-08-24, on the repeating macOS consent dialog. The dialog is the OS's, but what
   * happened when somebody declined it was ours: `Operation not permitted (os error 1)` on screen —
   * an errno, no folder named, and no hint that the fix is a checkbox in System Settings.
   */
  it('OS 가 막은 폴더는 원문 대신 어디서 허용하는지를 말한다', () => {
    mocks.vault.errorCode = 'permission-denied';
    mocks.vault.errorMessage = 'Operation not permitted (os error 1)';
    const { result } = renderHook(() => useFirstRunStarter());
    expect(
      result.current.errorText,
      'errno 를 그대로 보여 주면 사람이 할 수 있는 일이 없다',
    ).toBe('errorPermissionDenied');
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
    mocks.pickedProject = '/Users/dana/my-product';
    mocks.projectEntries = ['src', 'package.json'];
    mocks.requestAgentChat.mockClear();
    mocks.ensureChildDir.mockClear();
    mocks.openRecent.mockClear();
  });
  afterEach(() => {
    cleanup();
  });

  /*
   * ⚠️ The load-bearing test of this whole flow (owner direction, 2026-08-24). The map now lands
   * *inside* the chosen project, so pressing the door writes a folder into somebody's source tree.
   * `local-first.md` allows nothing about their disk to happen silently: choosing must only look.
   */
  it('프로젝트를 고른 것만으로는 아무것도 만들지 않는다 — 경로를 먼저 보여 준다', async () => {
    const { result } = renderHook(() => useFirstRunStarter());

    await act(async () => {
      await result.current.build.chooseProject();
    });

    expect(result.current.build.stage, '경로를 확인받는 단계에 서야 한다').toBe('confirm');
    expect(result.current.build.location?.displayPath).toBe('/Users/dana/my-product/atlas');
    expect(
      mocks.ensureChildDir,
      '사람이 경로를 보기도 전에 남의 저장소에 폴더를 만들었다',
    ).not.toHaveBeenCalled();
    expect(mocks.openRecent).not.toHaveBeenCalled();
    expect(mocks.requestAgentChat).not.toHaveBeenCalled();
  });

  it('승낙한 뒤에 프로젝트 안에 만들고, 그 폴더를 열고, 에이전트에게 넘긴다', async () => {
    const { result } = renderHook(() => useFirstRunStarter());
    await act(async () => {
      await result.current.build.chooseProject();
    });
    await act(async () => {
      await result.current.build.confirm();
    });

    expect(mocks.ensureChildDir).toHaveBeenCalledWith('/Users/dana/my-product', 'atlas');
    const record = mocks.openRecent.mock.calls[0]![0];
    expect(record?.desktopRootPath, '만든 폴더가 아니라 다른 곳을 열었다').toBe(
      '/Users/dana/my-product/atlas',
    );

    expect(mocks.requestAgentChat).toHaveBeenCalledTimes(1);
    const prompt = mocks.requestAgentChat.mock.calls[0][1] as string;
    // The code to survey is the **project**, not the vault Atlas just created inside it.
    expect(prompt).toContain('/Users/dana/my-product');
    // The order is the contract: survey, then propose, then write.
    expect(prompt.indexOf('analyze_repo_structure')).toBeLessThan(
      prompt.indexOf('connect_project_source'),
    );
  });

  /*
   * ⚠️ Measured on the installed app, 2026-08-25. Picking an existing `atlas` folder as "the
   * project" produced `…/atlas/atlas` on screen and offered to create it. Nothing crashes, but a
   * confirmation that proposes nonsense with a straight face is one people stop reading — fatal for
   * a step whose entire job is to be read.
   */
  it('지도 폴더를 골랐으면 한 단계 올라가고, 올라갔다고 말한다', async () => {
    mocks.pickedProject = '/Users/dana/my-product/atlas';
    const { result } = renderHook(() => useFirstRunStarter());
    await act(async () => {
      await result.current.build.chooseProject();
    });

    expect(result.current.build.pickedMapFolder).toBe(true);
    expect(
      result.current.build.location?.displayPath,
      'atlas 안에 atlas 를 만들자고 제안했다',
    ).toBe('/Users/dana/my-product/atlas');
  });

  it('이미 atlas 폴더가 있으면 새로 만든다고 하지 않는다', async () => {
    mocks.projectEntries = ['src', 'atlas', 'package.json'];
    const { result } = renderHook(() => useFirstRunStarter());
    await act(async () => {
      await result.current.build.chooseProject();
    });
    expect(
      result.current.build.reusesExisting,
      '이미 있는 지도 폴더를 「새로 만든다」고 말하면 사람은 덮어쓰기를 의심한다',
    ).toBe(true);
  });

  it('취소한 피커는 실패가 아니다 — 오류 없이 처음으로 돌아간다', async () => {
    mocks.pickedProject = null;
    const { result } = renderHook(() => useFirstRunStarter());
    await act(async () => {
      await result.current.build.chooseProject();
    });
    expect(result.current.build.stage).toBe('idle');
    expect(result.current.build.location).toBeNull();
    expect(result.current.build.errorText, '마음이 바뀐 것에 오류 카드를 띄웠다').toBeNull();
    expect(mocks.ensureChildDir).not.toHaveBeenCalled();
  });

  /*
   * A read-only checkout, a folder the person needs to unlock. Staying on `confirm` keeps the path
   * and the button on screen, so a failure they can fix is one press from retrying.
   */
  it('만들지 못하면 그 자리에 남아 이유를 말한다 — 금고를 열지도, 대화를 열지도 않는다', async () => {
    mocks.ensureChildDir.mockRejectedValueOnce(new Error('permission denied'));
    const { result } = renderHook(() => useFirstRunStarter());
    await act(async () => {
      await result.current.build.chooseProject();
    });
    await act(async () => {
      await result.current.build.confirm();
    });

    expect(result.current.build.stage).toBe('confirm');
    expect(result.current.build.errorText).toBe('permission denied');
    expect(result.current.build.location?.displayPath).toBe('/Users/dana/my-product/atlas');
    expect(
      mocks.requestAgentChat,
      '만들지 못한 폴더로 대화를 열면 에이전트가 없는 금고에 쓴다',
    ).not.toHaveBeenCalled();
  });

  it('웹에서는 문 자체가 없다 — 넘길 에이전트가 없다', async () => {
    mocks.desktop = false;
    const { result } = renderHook(() => useFirstRunStarter());
    expect(result.current.canBuildFromCode).toBe(false);

    await act(async () => {
      await result.current.build.chooseProject();
    });
    await act(async () => {
      await result.current.build.confirm();
    });
    // Drawn nowhere on the web, and refused here too — a request that arrived some other way
    // still must not promise a conversation that cannot open.
    expect(mocks.requestAgentChat).not.toHaveBeenCalled();
  });
});
