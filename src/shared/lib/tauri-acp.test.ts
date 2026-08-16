import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

import { acpPermissionVerdict } from './tauri-acp';

afterEach(() => {
  mocks.invoke.mockReset();
  mocks.isTauri.mockReturnValue(false);
});

describe('tauri ACP 권한 판정 브리지', () => {
  it('웹에서는 판정할 수 없는 경로를 자동 허용하지 않는다', async () => {
    expect(await acpPermissionVerdict('acp-session', '/vault/notes.md')).toBe('ask');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('화면이 고른 루트가 아니라 네이티브 세션 ID만 Rust에 넘긴다', async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValue('allow-inside-vault');

    await expect(acpPermissionVerdict('acp-1-999', '/vault/notes.md')).resolves.toBe(
      'allow-inside-vault',
    );
    expect(mocks.invoke).toHaveBeenCalledWith('acp_permission_verdict', {
      sessionId: 'acp-1-999',
      filePath: '/vault/notes.md',
    });
  });
});
