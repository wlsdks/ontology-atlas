import { describe, expect, it } from 'vitest';
import type { BuiltVaultEntry } from './md-entry';
import { vaultSourceFormat, vaultSourceRow } from './vault-source-row';

describe('vaultSourceFormat', () => {
  it('is the lower-cased extension', () => {
    expect(vaultSourceFormat('sources/plan.PDF')).toBe('pdf');
  });

  it('is empty for a name without an extension or with only a leading dot', () => {
    expect(vaultSourceFormat('sources/README')).toBe('');
    expect(vaultSourceFormat('.hidden')).toBe('');
  });

  it('takes the last extension of a dotted name', () => {
    expect(vaultSourceFormat('sources/a.tar.gz')).toBe('gz');
  });
});

describe('vaultSourceRow', () => {
  const handle = {} as FileSystemFileHandle;

  it('carries the path, file name, format, size and modified time of the entry', () => {
    const entry: BuiltVaultEntry = {
      relativePath: 'sources/deep/Plan.PDF',
      lastModified: 1_700_000_000_000,
      bytes: 2048,
      handle,
      kind: 'source',
    };
    expect(vaultSourceRow(entry)).toEqual({
      path: 'sources/deep/Plan.PDF',
      name: 'Plan.PDF',
      format: 'pdf',
      bytes: 2048,
      mtime: 1_700_000_000_000,
    });
  });

  it('counts a source whose size was never stamped as zero bytes', () => {
    const entry: BuiltVaultEntry = { relativePath: 'sources/a.txt', lastModified: 5, handle, kind: 'source' };
    expect(vaultSourceRow(entry).bytes).toBe(0);
  });
});
