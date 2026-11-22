import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultRowsAnswer } from '@/shared/lib/vault-folder/vault-index/tauri-vault-index-rows';
import type { WalkEntry } from './walk-vault';

const getVaultRows = vi.fn();
const putVaultRows = vi.fn();
let available = true;
vi.mock('@/shared/lib/vault-folder/vault-index/tauri-vault-index-rows', () => ({
  getVaultRows: (...args: unknown[]) => getVaultRows(...args),
  putVaultRows: (...args: unknown[]) => putVaultRows(...args),
  vaultRowsAvailable: () => available,
  isFramedVaultRowPath: (path: string) => !path.includes('\n'),
}));

const { createRowSource, vaultRowWritesSettled } = await import('./vault-entry-rows');

const handle = {} as FileSystemFileHandle;
const files: WalkEntry[] = [
  { relativePath: 'domains/a.md', kind: 'md', handle },
  { relativePath: 'domains/b.md', kind: 'md', handle },
  { relativePath: 'diagram.png', kind: 'image', handle },
  { relativePath: 'notes/line\nbreak.md', kind: 'md', handle },
];
const tiers = [2, 2, 6, 5];
const intern = (value: string) => value;

function answer(overrides: Partial<VaultRowsAnswer>): VaultRowsAnswer {
  return { hits: [], misses: [], stored: 0, found: 0, otherVersions: 0, ...overrides };
}

/** A source that has asked the index about the framed Markdown files, then finished. */
async function finishAfterLookup(walkComplete: boolean) {
  const source = createRowSource('app-entry/test', '/vault', files, tiers, intern)!;
  await source.take([0, 1]);
  source.finish(walkComplete);
  await vaultRowWritesSettled();
}

beforeEach(() => {
  getVaultRows.mockReset();
  putVaultRows.mockReset();
  putVaultRows.mockResolvedValue(undefined);
  available = true;
});

describe('createRowSource', () => {
  it('is absent when the app has no derived index', () => {
    available = false;
    expect(createRowSource('app-entry/test', '/vault', files, tiers, intern)).toBeNull();
  });

  it('asks only for framed Markdown paths, in tier order', async () => {
    getVaultRows.mockResolvedValue(answer({}));
    await finishAfterLookup(true);
    expect(getVaultRows).toHaveBeenCalledWith('/vault', 'app-entry/test', ['domains/a.md', 'domains/b.md']);
  });

  it('prunes the stored rows of files that are gone once a complete walk saw fewer files than are stored', async () => {
    getVaultRows.mockResolvedValue(answer({ stored: 5, found: 0 }));
    await finishAfterLookup(true);
    expect(putVaultRows).toHaveBeenCalledWith('/vault', 'app-entry/test', [], ['domains/a.md', 'domains/b.md']);
  });

  it('prunes rows written by another version of the producer', async () => {
    getVaultRows.mockResolvedValue(answer({ stored: 2, found: 2, otherVersions: 1 }));
    await finishAfterLookup(true);
    expect(putVaultRows).toHaveBeenCalledTimes(1);
  });

  it('prunes nothing when the stored rows are all still wanted', async () => {
    getVaultRows.mockResolvedValue(answer({ stored: 2, found: 2 }));
    await finishAfterLookup(true);
    expect(putVaultRows).not.toHaveBeenCalled();
  });

  it('prunes nothing after a truncated walk, which did not see every file', async () => {
    getVaultRows.mockResolvedValue(answer({ stored: 5, found: 0, otherVersions: 1 }));
    await finishAfterLookup(false);
    expect(putVaultRows).not.toHaveBeenCalled();
  });

  describe('when one of two lookups did not answer', () => {
    /** 2,049 framed files make two lookup chunks; the first says rows are stale, the second does not answer. */
    const many: WalkEntry[] = Array.from({ length: 2_049 }, (_, i) => ({ relativePath: `domains/n${i}.md`, kind: 'md', handle }));
    const manyTiers = many.map(() => 2);

    async function finishAfterTwoLookups(second: () => Promise<VaultRowsAnswer | null>) {
      getVaultRows.mockResolvedValueOnce(answer({ stored: 5, found: 0 })).mockImplementationOnce(second);
      const source = createRowSource('app-entry/test', '/vault', many, manyTiers, intern)!;
      await source.take([0]);
      source.finish(true);
      await vaultRowWritesSettled();
    }

    it('prunes nothing after a lookup that failed', async () => {
      await finishAfterTwoLookups(async () => {
        throw new Error('bridge down');
      });
      expect(putVaultRows).not.toHaveBeenCalled();
    });

    it('prunes nothing after a lookup the index could not answer', async () => {
      await finishAfterTwoLookups(async () => null);
      expect(putVaultRows).not.toHaveBeenCalled();
    });

    it('prunes when both lookups answered', async () => {
      await finishAfterTwoLookups(async () => answer({}));
      expect(putVaultRows).toHaveBeenCalledTimes(1);
    });
  });

  it('answers a failed lookup as files that must be read', async () => {
    getVaultRows.mockRejectedValue(new Error('bridge down'));
    const source = createRowSource('app-entry/test', '/vault', files, tiers, intern)!;
    expect(await source.take([0, 1])).toEqual([undefined, undefined]);
  });
});
