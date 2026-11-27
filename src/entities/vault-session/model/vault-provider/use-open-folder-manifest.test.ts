import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { VaultManifest } from '@/entities/docs-vault';

const vault = vi.hoisted(() => ({
  value: {} as { status: string; isReloadingSameVault: boolean; manifest: unknown },
}));

vi.mock('./LocalVaultProvider', () => ({ useLocalVault: () => vault.value }));

import { useOpenFolderManifest } from './use-open-folder-manifest';

const loaded = { version: '1', generatedAt: '', docs: [{ slug: 'a' }] } as unknown as VaultManifest;

function read(status: string, isReloadingSameVault: boolean, manifest: VaultManifest | null) {
  vault.value = { status, isReloadingSameVault, manifest };
  return renderHook(() => useOpenFolderManifest()).result.current;
}

describe('the open folder manifest', () => {
  it('keeps the documents while the same folder reloads, and drops them while another folder loads', () => {
    expect(read('loaded', false, loaded)).toBe(loaded);
    expect(read('loading', true, loaded)).toBe(loaded);

    const whileOtherLoads = read('loading', false, loaded);
    expect(whileOtherLoads.docs).toEqual([]);
    expect(read('idle', false, null)).toBe(whileOtherLoads);
  });
});
