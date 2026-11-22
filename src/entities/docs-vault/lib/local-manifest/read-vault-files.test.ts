import { beforeEach, describe, expect, it, vi } from 'vitest';

const readTauriVaultTextFile = vi.fn();
const readTauriVaultTextFiles = vi.fn();
vi.mock('@/shared/lib/vault-folder/native-vault/tauri-vault-files', () => ({
  readTauriVaultTextFile: (...args: unknown[]) => readTauriVaultTextFile(...args),
  readTauriVaultTextFiles: (...args: unknown[]) => readTauriVaultTextFiles(...args),
}));

const { createMarkdownReader, mapPooled } = await import('./read-vault-files');

describe('mapPooled', () => {
  it('returns results in input order however the reads finish', async () => {
    const out = await mapPooled([30, 1, 15, 0], 4, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(out).toEqual([30, 1, 15, 0]);
  });

  it('never has more reads in flight than the concurrency', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapPooled(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
    });
    expect(peak).toBe(3);
  });

  it('rejects with the first failure and starts no further read after it', async () => {
    const started: number[] = [];
    await expect(
      mapPooled([0, 1, 2, 3, 4, 5], 2, async (item) => {
        started.push(item);
        if (item === 1) throw new Error('read failed');
        await new Promise((resolve) => setTimeout(resolve, 20));
        return item;
      }),
    ).rejects.toThrow('read failed');
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(started).toEqual([0, 1]);
  });

  it('answers an empty list without starting a worker', async () => {
    expect(await mapPooled([], 8, async (item: number) => item)).toEqual([]);
  });
});

describe('createMarkdownReader', () => {
  beforeEach(() => {
    readTauriVaultTextFile.mockReset();
    readTauriVaultTextFiles.mockReset();
  });

  function entry(relativePath: string, text: string, lastModified: number) {
    return {
      relativePath,
      kind: 'md' as const,
      handle: { getFile: async () => ({ lastModified, text: async () => text }) } as unknown as FileSystemFileHandle,
    };
  }

  it('reads each file through its handle when there is no native root', async () => {
    const read = createMarkdownReader(null);
    expect(await read([entry('a.md', 'A', 1), entry('b.md', 'B', 2)])).toEqual([
      { text: 'A', lastModified: 1 },
      { text: 'B', lastModified: 2 },
    ]);
    expect(readTauriVaultTextFiles).not.toHaveBeenCalled();
  });

  it('takes a native answer for the file it names and reads the one it does not through the handle', async () => {
    readTauriVaultTextFile.mockResolvedValue(null);
    readTauriVaultTextFiles.mockResolvedValue([
      { relativePath: 'a.md', text: 'native A', lastModified: 10, error: null },
      { relativePath: 'other.md', text: 'wrong file', lastModified: 11, error: null },
    ]);
    const read = createMarkdownReader('/vault');
    expect(await read([entry('a.md', 'A', 1), entry('b.md', 'B', 2)])).toEqual([
      { text: 'native A', lastModified: 10 },
      { text: 'B', lastModified: 2 },
    ]);
  });

  it('stops asking for batches after one batch call fails', async () => {
    readTauriVaultTextFile.mockResolvedValue(null);
    readTauriVaultTextFiles.mockRejectedValue(new Error('bridge down'));
    const read = createMarkdownReader('/vault');
    expect(await read([entry('a.md', 'A', 1)])).toEqual([{ text: 'A', lastModified: 1 }]);
    expect(await read([entry('b.md', 'B', 2)])).toEqual([{ text: 'B', lastModified: 2 }]);
    expect(readTauriVaultTextFiles).toHaveBeenCalledTimes(1);
  });
});
