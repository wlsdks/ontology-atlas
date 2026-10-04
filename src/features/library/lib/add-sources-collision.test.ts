import { afterEach, expect, it, vi } from 'vitest';
import { addSourcesInBrowser } from './add-sources';

vi.mock('@/entities/docs-vault', async () => ({
  VAULT_SOURCES_DIR: 'sources',
  ...(await vi.importActual('@/entities/docs-vault/lib/source-copy-publication')),
}));
vi.mock('@/shared/lib/tauri-vault-fs', () => ({ importTauriSourceFiles: vi.fn(), pickTauriSourceFiles: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

function fixture(occupied: number) {
  vi.stubGlobal('crypto', undefined);
  const write = vi.fn();
  const getFileHandle = vi.fn(async () => ({ createWritable: async () => ({ write, close: vi.fn() }) }));
  const sources = {
    async *entries() {
      for (let index = 1; index <= occupied; index++) {
        yield [index === 1 ? 'source.txt' : `source (${index}).txt`, { kind: 'file', getFile: async () => ({ arrayBuffer: async () => new ArrayBuffer(0) }) }];
      }
    },
    getFileHandle,
  };
  const root = { getDirectoryHandle: async () => sources } as unknown as FileSystemDirectoryHandle;
  const picked = { name: 'source.txt', size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as File;
  return { root, picked, write, getFileHandle };
}

it('refuses an import when every safe name slot is occupied instead of replacing an original', async () => {
  const { root, picked, write, getFileHandle } = fixture(999);
  const outcome = await addSourcesInBrowser(root, [picked]);
  expect(write).not.toHaveBeenCalled();
  expect(getFileHandle).not.toHaveBeenCalled();
  expect(outcome.results).toEqual([expect.objectContaining({ status: 'failed', relativePath: null })]);
});

it('still imports into the last free name without touching an existing original', async () => {
  const { root, picked, write, getFileHandle } = fixture(998);
  const outcome = await addSourcesInBrowser(root, [picked]);
  expect(getFileHandle).toHaveBeenCalledWith('source (999).txt', { create: true });
  expect(write).toHaveBeenCalledOnce();
  expect(outcome.results).toEqual([expect.objectContaining({ status: 'renamed', relativePath: 'sources/source (999).txt' })]);
});
