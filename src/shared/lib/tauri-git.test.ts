import { afterEach, describe, expect, it, vi } from 'vitest';

const tauriApiMock = vi.hoisted(() => ({
  runtimeAvailable: false,
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriApiMock.invoke,
  isTauri: () => tauriApiMock.runtimeAvailable,
}));

import {
  gitDiff,
  gitInit,
  gitSetRemote,
  gitErrorMessage,
  gitHistory,
  gitPull,
  gitSnapshot,
  gitStatus,
  isGitBridgeAvailable,
} from './tauri-git';

afterEach(() => {
  tauriApiMock.runtimeAvailable = false;
  tauriApiMock.invoke.mockReset();
});

describe('tauri git bridge', () => {
  it('reports availability from the Tauri runtime at call time', () => {
    expect(isGitBridgeAvailable()).toBe(false);
    tauriApiMock.runtimeAvailable = true;
    expect(isGitBridgeAvailable()).toBe(true);
  });

  it('degrades honestly on the web: every wrapper returns null with zero invokes', async () => {
    expect(await gitStatus('/v')).toBeNull();
    expect(await gitSnapshot('/v')).toBeNull();
    expect(await gitHistory('/v')).toBeNull();
    expect(await gitDiff('/v')).toBeNull();
    expect(await gitPull('/v')).toBeNull();
    expect(tauriApiMock.invoke).not.toHaveBeenCalled();
  });

  it('invokes git_status with the camelCase vaultPath arg', async () => {
    tauriApiMock.runtimeAvailable = true;
    const result = {
      initialized: true,
      repoRoot: '/repo',
      branch: 'main',
      upstream: 'origin/main',
      changedCount: 2,
      stagedOutsideVault: [],
    };
    tauriApiMock.invoke.mockResolvedValue(result);
    expect(await gitStatus('/repo/vault')).toEqual(result);
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('git_status', { vaultPath: '/repo/vault' });
  });

  it('invokes git_snapshot with push defaulting to false (신뢰 헌장 — 전송 opt-in)', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({ committed: true });
    await gitSnapshot('/v');
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('git_snapshot', {
      vaultPath: '/v',
      message: null,
      push: false,
    });
  });

  it('passes an explicit message and push opt-in through to git_snapshot', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({ committed: true });
    await gitSnapshot('/v', { message: 'my subject', push: true });
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('git_snapshot', {
      vaultPath: '/v',
      message: 'my subject',
      push: true,
    });
  });

  it('invokes git_history with the default limit of 10', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue([]);
    await gitHistory('/v');
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('git_history', { vaultPath: '/v', limit: 10 });
  });

  it('invokes git_diff and git_pull with the vault path', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({});
    await gitDiff('/v');
    await gitPull('/v');
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('git_diff', { vaultPath: '/v' });
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('git_pull', { vaultPath: '/v' });
  });

  it('propagates the Rust Err(String) rejection to the caller', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockRejectedValue('이 vault 는 git 저장소 안에 있지 않아요.');
    await expect(gitDiff('/v')).rejects.toBe('이 vault 는 git 저장소 안에 있지 않아요.');
  });
});

describe('gitInit · gitSetRemote (쓰기 — 사용자 클릭 뒤에만)', () => {
  it('브리지가 없으면 둘 다 null — 웹에서 조용히 실패하지 않는다', async () => {
    tauriApiMock.runtimeAvailable = false;
    expect(await gitInit('/v')).toBeNull();
    expect(await gitSetRemote('/v', 'git@github.com:me/repo.git')).toBeNull();
    expect(tauriApiMock.invoke).not.toHaveBeenCalled();
  });

  it('Rust 커맨드 이름과 인자 모양을 고정한다', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({});
    await gitInit('/v');
    await gitSetRemote('/v', 'git@github.com:me/repo.git');
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('git_init', { vaultPath: '/v' });
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('git_set_remote', {
      vaultPath: '/v',
      url: 'git@github.com:me/repo.git',
    });
  });

  it('주소를 다듬거나 추측하지 않고 사용자 입력 그대로 넘긴다', async () => {
    // Trust charter: we never suggest, correct, or auto-detect a remote URL.
    // Normalisation is `validate_remote_url`'s job in Rust; the bridge only
    // passes the value through.
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({});
    await gitSetRemote('/v', '  https://example.com/r.git ');
    expect(tauriApiMock.invoke).toHaveBeenCalledWith('git_set_remote', {
      vaultPath: '/v',
      url: '  https://example.com/r.git ',
    });
  });
});

describe('gitErrorMessage', () => {
  it('passes strings through (Rust Err payload)', () => {
    expect(gitErrorMessage('커밋이 거부됐어요')).toBe('커밋이 거부됐어요');
  });

  it('unwraps Error objects and stringifies unknowns', () => {
    expect(gitErrorMessage(new Error('boom'))).toBe('boom');
    expect(gitErrorMessage(42)).toBe('42');
  });
});
