import { describe, expect, it, vi } from 'vitest';
import { MemoryVault } from '../../../../../tests/helpers/memory-vault';

/**
 * In the app a file handle's `getFile()` transfers the whole body across the bridge, so a path
 * delta must take every image's and raw source's stamp from the native folder listing instead.
 */

const native = vi.hoisted(() => ({ vault: null as MemoryVault | null }));

vi.mock('@/shared/lib/vault-folder/tauri-vault-fs', async (original) => ({
  ...(await original<typeof import('@/shared/lib/vault-folder/tauri-vault-fs')>()),
  listTauriVaultStamped: async (_rootPath: string, dir: string) => native.vault!.stampedListing(dir),
}));

import { applyVaultChanges } from './apply-vault-changes';
import { buildLocalManifestWithEntries } from './build-local-manifest';

function appRoot(vault: MemoryVault): FileSystemDirectoryHandle {
  return Object.assign(vault.root(), { rootPath: '/Users/dana/vault' });
}

describe('applyVaultChanges in the app', () => {
  it('stamps a renamed folder\'s images and raw sources from the listing without opening one', async () => {
    const vault = new MemoryVault({
      'sources/old/deck.pdf': 'pdf bytes',
      'sources/old/scan.png': 'png',
      'notes/old/diagram.png': 'png',
      'notes/old/a.md': '# A',
    });
    native.vault = vault;
    const snapshot = await buildLocalManifestWithEntries(appRoot(vault));
    vault.renameDir('sources/old', 'sources/new');
    vault.renameDir('notes/old', 'notes/new');
    vault.opens.clear();

    const paths = ['sources/old', 'sources/new', 'notes/old', 'notes/new'];
    const result = await applyVaultChanges(appRoot(vault), snapshot, paths.map((path) => vault.change(path)));

    expect(result.kind).toBe('applied');
    expect([...vault.opens.keys()]).toEqual(['notes/new/a.md']);
    if (result.kind !== 'applied') return;
    expect(result.snapshot.build.manifest.sources).toEqual([
      expect.objectContaining({ path: 'sources/new/deck.pdf', bytes: 9 }),
      expect.objectContaining({ path: 'sources/new/scan.png', bytes: 3 }),
    ]);
    const full = await buildLocalManifestWithEntries(vault.root());
    expect(result.snapshot.build.fingerprint).toBe(full.build.fingerprint);
  });
});
