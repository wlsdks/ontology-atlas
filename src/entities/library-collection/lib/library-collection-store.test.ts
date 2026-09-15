import { describe, expect, it } from 'vitest';
import { emptyLibraryCollections } from '../model/library-collection';
import { LibraryCollectionsConflictError, LibraryCollectionsStaleCompletionError, loadLibraryCollections, saveLibraryCollections } from './library-collection-store';

function memoryVault(initial: string | null = null) {
  let raw = initial;
  const file = {
    kind: 'file', name: 'library-collections.json',
    async getFile() { return new File([raw ?? ''], this.name); },
    async createWritable() { let next = ''; return { async write(value: string) { next += value; }, async close() { raw = next; } }; },
  };
  const sidecar = { kind: 'directory', name: '.ontology-atlas', async getFileHandle(_name: string, options?: { create?: boolean }) { if (raw === null && !options?.create) throw new DOMException('', 'NotFoundError'); return file; } };
  const handle = { kind: 'directory', name: 'same-name', async getDirectoryHandle(_name: string, options?: { create?: boolean }) { if (raw === null && !options?.create) throw new DOMException('', 'NotFoundError'); return sidecar; } } as unknown as FileSystemDirectoryHandle;
  return { handle, read: () => raw, replace: (value: string | null) => { raw = value; } };
}

describe('library collection store', () => {
  it('keeps same-named vault handles isolated', async () => {
    const first = memoryVault();
    const second = memoryVault();
    const snapshot = await loadLibraryCollections(first.handle);
    await saveLibraryCollections(first.handle, snapshot, emptyLibraryCollections(), () => true);
    expect(first.read()).toContain('ontology-atlas/library-collections/v1');
    expect(second.read()).toBeNull();
  });

  it('refuses stale content and preserves the newer bytes', async () => {
    const vault = memoryVault();
    const snapshot = await loadLibraryCollections(vault.handle);
    vault.replace('{"newer":true}\n');
    await expect(saveLibraryCollections(vault.handle, snapshot, emptyLibraryCollections(), () => true)).rejects.toBeInstanceOf(LibraryCollectionsConflictError);
    expect(vault.read()).toBe('{"newer":true}\n');
  });

  it('does not overwrite corrupt bytes or commit after a vault switch', async () => {
    const vault = memoryVault('{broken');
    const corrupt = await loadLibraryCollections(vault.handle);
    await expect(saveLibraryCollections(vault.handle, corrupt, emptyLibraryCollections(), () => true)).rejects.toThrow(/repair/);
    expect(vault.read()).toBe('{broken');

    const empty = memoryVault();
    const snapshot = await loadLibraryCollections(empty.handle);
    await expect(saveLibraryCollections(empty.handle, snapshot, emptyLibraryCollections(), () => false)).rejects.toThrow(/selected vault changed/);
    expect(empty.read()).toBeNull();
  });

  it('rejects a completion when selection changes after the captured-vault write starts', async () => {
    const vault = memoryVault();
    const snapshot = await loadLibraryCollections(vault.handle);
    let checks = 0;
    await expect(saveLibraryCollections(vault.handle, snapshot, emptyLibraryCollections(), () => ++checks === 1)).rejects.toBeInstanceOf(LibraryCollectionsStaleCompletionError);
    expect(vault.read()).toContain('ontology-atlas/library-collections/v1');
  });
});
