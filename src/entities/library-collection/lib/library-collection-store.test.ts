import { describe, expect, it } from 'vitest';
import { emptyLibraryCollections } from '../model/library-collection';
import { isMissingLibraryCollectionsError, LibraryCollectionsConflictError, LibraryCollectionsStaleCompletionError, loadLibraryCollections, saveLibraryCollections } from './library-collection-store';

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

/** A vault whose sidecar folder exists or not, answering like the real handles do. */
function sidecarVault(options: { sidecar: boolean; file: string | null; failWith?: unknown }) {
  const sidecar = {
    kind: 'directory',
    name: '.ontology-atlas',
    async getFileHandle() {
      if (options.failWith !== undefined) throw options.failWith;
      if (options.file === null) throw new DOMException('File not found: .ontology-atlas/library-collections.json', 'NotFoundError');
      const text = options.file;
      return { kind: 'file', name: 'library-collections.json', async getFile() { return new File([text], 'library-collections.json'); } };
    },
  };
  return {
    kind: 'directory',
    name: 'vault',
    async getDirectoryHandle() {
      if (!options.sidecar) throw new DOMException('Directory not found: .ontology-atlas', 'NotFoundError');
      return sidecar;
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe('reading a vault that has no saved collections', () => {
  it('reads an absent sidecar folder as the empty state', async () => {
    const snapshot = await loadLibraryCollections(sidecarVault({ sidecar: false, file: null }));
    expect(snapshot.parsed).toEqual({ status: 'missing', value: emptyLibraryCollections() });
    expect(snapshot.expectedContent).toBeNull();
  });

  it('reads a sidecar folder without the file as the empty state', async () => {
    const snapshot = await loadLibraryCollections(sidecarVault({ sidecar: true, file: null }));
    expect(snapshot.parsed.status).toBe('missing');
  });

  it('reads an empty or whitespace-only file as the empty state and keeps its bytes for compare-before-save', async () => {
    for (const raw of ['', '\n', '  \n\t']) {
      const snapshot = await loadLibraryCollections(sidecarVault({ sidecar: true, file: raw }));
      expect(snapshot.parsed).toEqual({ status: 'missing', value: emptyLibraryCollections() });
      expect(snapshot.expectedContent).toBe(raw);
    }
  });

  it('still refuses a malformed or foreign file, without touching it', async () => {
    expect((await loadLibraryCollections(sidecarVault({ sidecar: true, file: '{broken' }))).parsed.status).toBe('corrupt');
    expect((await loadLibraryCollections(sidecarVault({ sidecar: true, file: '{"schema":"other"}' }))).parsed.status).toBe('unsupported');
  });

  it('classifies the native not-found string as absent and any other failure as a real error', () => {
    expect(isMissingLibraryCollectionsError('No such file or directory (os error 2)')).toBe(true);
    expect(isMissingLibraryCollectionsError(new DOMException('gone', 'NotFoundError'))).toBe(true);
    expect(isMissingLibraryCollectionsError('collection preferences target is not a regular file')).toBe(false);
    expect(isMissingLibraryCollectionsError(new DOMException('denied', 'NotAllowedError'))).toBe(false);
  });

  it('surfaces a real read failure instead of pretending the vault is empty', async () => {
    await expect(loadLibraryCollections(sidecarVault({ sidecar: true, file: null, failWith: new DOMException('denied', 'NotAllowedError') }))).rejects.toThrow('denied');
  });
});

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
