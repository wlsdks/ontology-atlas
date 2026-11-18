import { describe, expect, it } from 'vitest';
import { parseVaultChangeBatch } from './vault-change-batch';

const root = '/Users/dana/vault';

describe('parseVaultChangeBatch', () => {
  it('reads the documented payload and turns anything else into a rescan', () => {
    expect(parseVaultChangeBatch({ root, rescan: false, changes: [{ path: 'a.md', kind: 'file', lastModified: 5, size: 2 }] })).toEqual({
      root,
      rescan: false,
      changes: [{ path: 'a.md', kind: 'file', lastModified: 5, size: 2 }],
    });
    expect(parseVaultChangeBatch({ root, rescan: true, changes: [] })).toEqual({ root, rescan: true, changes: [] });
    for (const payload of [null, undefined, 'x', { rescan: false, changes: [] }, { root: 1, rescan: false, changes: [] }]) {
      expect(parseVaultChangeBatch(payload)).toEqual({ root: null, rescan: true, changes: [] });
    }
    for (const payload of [{ root, rescan: false }, { root, rescan: false, changes: [{ path: 1, kind: 'file' }] }, { root, rescan: false, changes: [{ path: 'a', kind: 'link' }] }]) {
      expect(parseVaultChangeBatch(payload)).toEqual({ root, rescan: true, changes: [] });
    }
  });
});
