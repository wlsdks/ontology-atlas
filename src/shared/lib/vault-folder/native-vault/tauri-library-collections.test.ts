import { afterEach, describe, expect, it, vi } from 'vitest';

import { installInvoke as installInvokeCalls, resetTauriApiMock } from '../../../../../tests/helpers/tauri-invoke-calls';

const tauriApiMock = vi.hoisted(() => ({
  runtimeAvailable: false,
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriApiMock.invoke,
  isTauri: () => tauriApiMock.runtimeAvailable,
}));

import { readTauriLibraryCollections, writeTauriLibraryCollections } from './tauri-library-collections';

const installInvoke = (handler: Parameters<typeof installInvokeCalls>[1]) =>
  installInvokeCalls(tauriApiMock, handler);

afterEach(() => resetTauriApiMock(tauriApiMock));

describe('tauri library collections', () => {
  it('reads and compare-writes the one vault-local collection sidecar through dedicated commands', async () => {
    const calls = installInvoke(({ command }) => {
      if (command === 'read_library_collections') return '{"schema":"ontology-atlas/library-collections/v1"}\n';
      if (command === 'write_library_collections') return { written: true, currentContent: 'next\n' };
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(readTauriLibraryCollections('/vault')).resolves.toContain('library-collections/v1');
    await expect(writeTauriLibraryCollections('/vault', 'before\n', 'next\n')).resolves.toEqual({
      written: true,
      currentContent: 'next\n',
    });
    expect(calls).toEqual([
      { command: 'read_library_collections', args: { rootPath: '/vault' } },
      { command: 'write_library_collections', args: { rootPath: '/vault', expectedContent: 'before\n', content: 'next\n' } },
    ]);
  });
});
