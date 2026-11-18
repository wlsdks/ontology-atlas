import { describe, expect, it } from 'vitest';
import { parseVaultChangeBatch } from './vault-change-batch';

describe('parseVaultChangeBatch', () => {
  it('reads the documented payload and turns anything else into a rescan', () => {
    expect(parseVaultChangeBatch({ rescan: false, changes: [{ path: 'a.md', kind: 'file', lastModified: 5, size: 2 }] })).toEqual({
      rescan: false,
      changes: [{ path: 'a.md', kind: 'file', lastModified: 5, size: 2 }],
    });
    for (const payload of [null, undefined, 'x', { rescan: true, changes: [] }, { rescan: false }, { rescan: false, changes: [{ path: 1, kind: 'file' }] }, { rescan: false, changes: [{ path: 'a', kind: 'link' }] }]) {
      expect(parseVaultChangeBatch(payload)).toEqual({ rescan: true, changes: [] });
    }
  });
});
