import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIRST_RUN_STARTER_DISMISSED_KEY } from './first-run-starter-dismiss';

interface MockVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  errorMessage: string | null;
  /** For codes that leak no raw string, this value is the only meaning. */
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
  /** `null` is a cancel, which must never be a failure. */
  pickedProject: '/Users/dana/my-product' as string | null,
  /** Decides "create" versus "continue in". */
  projectEntries: ['src', 'package.json'] as string[],
  ensureChildDir: vi.fn(async (_root: string, _name: string) => undefined),
  openRecent: vi.fn(async (_record: { desktopRootPath?: string }) => undefined),
}));

vi.mock('@/entities/vault-session/model/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/LocalVaultProvider')>()),
  useLocalVault: () => mocks.vault,
}));

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

// The hook reads `useLocale()` for the starter language, and this test has no intl provider.
vi.mock('next-intl', () => ({
  useLocale: () => 'ko',
  // The key is returned verbatim, so tests check which string was chosen.
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
    open: vi.fn(async () => ({ opened: false, starterWritten: 0, starterError: null })),
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
    // Explicit, because the handoff effect reaches outside the hook: a hook left mounted watches the
    // next test's vault and the door-fired assertions stop meaning anything.
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

  it('createVault() reuses the shared vault-create-flow (one open that seeds an empty folder)', async () => {
    mocks.vault.open = vi.fn(async () => ({ opened: true, starterWritten: 12, starterError: null }));
    const { result } = renderHook(() => useFirstRunStarter());

    await act(async () => {
      await result.current.createVault();
    });

    // The starter is written in the screen's language.
    expect(mocks.vault.open).toHaveBeenCalledWith({ starter: { locale: 'ko', shape: undefined } });
    expect(result.current.errorText).toBeNull();
  });

  it('createVault() says in the card when the starter could not be written, since the card stays', async () => {
    mocks.vault.open = vi.fn(async () => ({
      opened: true,
      starterWritten: 0,
      starterError: new Error('disk full'),
    }));
    const { result } = renderHook(() => useFirstRunStarter());

    await act(async () => {
      await result.current.createVault();
    });

    await waitFor(() => {
      expect(result.current.errorText).toBe('errorFallback');
    });
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
  // A card beneath the tour scrim must not swallow Escape in the capture phase.
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

describe('first-run card states failures it can explain', () => {
  /*
   * Codes that leave `errorMessage` null must still produce a sentence rather than silence.
   */
  beforeEach(() => {
    mocks.vault = makeVault();
    mocks.vault.status = 'error';
    mocks.vault.errorMessage = null;
    mocks.sampleModeSettled = true;
  });

  it('states why a location cannot be accepted', () => {
    mocks.vault.errorCode = 'root-rejected';
    const { result } = renderHook(() => useFirstRunStarter());
    expect(result.current.errorText).toBe('errorRootRejected');
  });

  it('states that the folder is gone instead of offering retry', () => {
    mocks.vault.errorCode = 'path-missing';
    const { result } = renderHook(() => useFirstRunStarter());
    expect(result.current.errorText).toBe('errorPathMissing');
  });

  it('states where to allow access for an OS-blocked folder instead of the raw error', () => {
    mocks.vault.errorCode = 'permission-denied';
    mocks.vault.errorMessage = 'Operation not permitted (os error 1)';
    const { result } = renderHook(() => useFirstRunStarter());
    expect(
      result.current.errorText,
      'the raw errno must not be the message',
    ).toBe('errorPermissionDenied');
  });

  it('shows a sentence for other failures and moves the raw error to detail', () => {
    mocks.vault.errorCode = 'access-failed';
    const { result } = renderHook(() => useFirstRunStarter());
    // `access-failed` carries a cause string; unrecognised, it falls back to the card's sentence.
    expect(result.current.errorText).toBe('errorFallback');
    expect(result.current.errorDetail).toBeNull();
  });

  it('never puts the raw access-failed English into the message', () => {
    mocks.vault.errorCode = 'access-failed';
    mocks.vault.errorMessage = 'Tauri command failed: EPIPE writing manifest';
    const { result } = renderHook(() => useFirstRunStarter());
    expect(result.current.errorText).toBe('errorFallback');
    expect(result.current.errorDetail).toBe('Tauri command failed: EPIPE writing manifest');
  });

  it('keeps the errno of an OS-blocked folder only in detail', () => {
    mocks.vault.errorCode = 'permission-denied';
    mocks.vault.errorMessage = 'Operation not permitted (os error 1)';
    const { result } = renderHook(() => useFirstRunStarter());
    expect(result.current.errorText).toBe('errorPermissionDenied');
    expect(result.current.errorDetail).toBe('Operation not permitted (os error 1)');
  });

});

describe('build a map from my code', () => {
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
   * The map lands inside the chosen project, so choosing must only look (`local-first.md`).
   */
  it('creates nothing on project pick and shows the path first', async () => {
    const { result } = renderHook(() => useFirstRunStarter());

    await act(async () => {
      await result.current.build.chooseProject();
    });

    expect(result.current.build.stage, 'must stop at path confirmation').toBe('confirm');
    expect(result.current.build.location?.displayPath).toBe('/Users/dana/my-product/atlas');
    expect(
      mocks.ensureChildDir,
      'created a folder before the path was confirmed',
    ).not.toHaveBeenCalled();
    expect(mocks.openRecent).not.toHaveBeenCalled();
    expect(mocks.requestAgentChat).not.toHaveBeenCalled();
  });

  it('creates the folder in the project after consent, opens it and hands off to the agent', async () => {
    const { result } = renderHook(() => useFirstRunStarter());
    await act(async () => {
      await result.current.build.chooseProject();
    });
    await act(async () => {
      await result.current.build.confirm();
    });

    expect(mocks.ensureChildDir).toHaveBeenCalledWith('/Users/dana/my-product', 'atlas');
    const record = mocks.openRecent.mock.calls[0]![0];
    expect(record?.desktopRootPath, 'opened a folder other than the created one').toBe(
      '/Users/dana/my-product/atlas',
    );

    expect(mocks.requestAgentChat).toHaveBeenCalledTimes(1);
    const prompt = mocks.requestAgentChat.mock.calls[0][1] as string;
    // The code to survey is the project, not the vault Atlas created inside it.
    expect(prompt).toContain('/Users/dana/my-product');
    // The order is the contract: survey, then propose, then write.
    expect(prompt.indexOf('analyze_repo_structure')).toBeLessThan(
      prompt.indexOf('connect_project_source'),
    );
  });

  it('moves up one level when the atlas folder itself was chosen and says so', async () => {
    mocks.pickedProject = '/Users/dana/my-product/atlas';
    const { result } = renderHook(() => useFirstRunStarter());
    await act(async () => {
      await result.current.build.chooseProject();
    });

    expect(result.current.build.pickedMapFolder).toBe(true);
    expect(
      result.current.build.location?.displayPath,
      'proposed atlas inside atlas',
    ).toBe('/Users/dana/my-product/atlas');
  });

  it('does not claim to create an atlas folder that already exists', async () => {
    mocks.projectEntries = ['src', 'atlas', 'package.json'];
    const { result } = renderHook(() => useFirstRunStarter());
    await act(async () => {
      await result.current.build.chooseProject();
    });
    expect(
      result.current.build.reusesExisting,
      'an existing atlas folder must not be described as new',
    ).toBe(true);
  });

  it('returns to idle without an error when the picker is cancelled', async () => {
    mocks.pickedProject = null;
    const { result } = renderHook(() => useFirstRunStarter());
    await act(async () => {
      await result.current.build.chooseProject();
    });
    expect(result.current.build.stage).toBe('idle');
    expect(result.current.build.location).toBeNull();
    expect(result.current.build.errorText, 'showed an error card for a cancelled picker').toBeNull();
    expect(mocks.ensureChildDir).not.toHaveBeenCalled();
  });

  it('stays and states the reason when creation fails without opening the vault or chat', async () => {
    mocks.ensureChildDir.mockRejectedValueOnce(new Error('permission denied'));
    const { result } = renderHook(() => useFirstRunStarter());
    await act(async () => {
      await result.current.build.chooseProject();
    });
    await act(async () => {
      await result.current.build.confirm();
    });

    expect(result.current.build.stage).toBe('confirm');
    // The OS refusal is recognised as a code, and the raw errno never reaches the screen.
    expect(result.current.build.errorText).toBe('permission-denied');
    expect(result.current.build.location?.displayPath).toBe('/Users/dana/my-product/atlas');
    expect(
      mocks.requestAgentChat,
      'opened chat for a folder that was not created',
    ).not.toHaveBeenCalled();
  });

  it('offers no build-from-code door on the web', async () => {
    mocks.desktop = false;
    const { result } = renderHook(() => useFirstRunStarter());
    expect(result.current.canBuildFromCode).toBe(false);

    await act(async () => {
      await result.current.build.chooseProject();
    });
    await act(async () => {
      await result.current.build.confirm();
    });
    // Refused here too, so a request that arrived another way cannot promise a chat that cannot open.
    expect(mocks.requestAgentChat).not.toHaveBeenCalled();
  });
});
