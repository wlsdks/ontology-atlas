import { describe, expect, it } from 'vitest';

import { DESTINATION_IDS, destinationsForVaultShape } from './destinations';

describe('destinationsForVaultShape', () => {
  it('hides the map group for a wiki without a map, keeping agents, MCP and history', () => {
    expect([...destinationsForVaultShape({ map: false, wiki: true })].sort()).toEqual(
      ['agents', 'git', 'library', 'mcp'].sort(),
    );
  });

  it('hides the Library for a map without a wiki', () => {
    const visible = destinationsForVaultShape({ map: true, wiki: false });
    expect(visible.has('library')).toBe(false);
    expect(visible.has('map')).toBe(true);
    expect(visible.has('insights')).toBe(true);
  });

  it('draws everything for both, for an empty folder, and for no folder', () => {
    for (const shape of [{ map: true, wiki: true }, { map: false, wiki: false }, null]) {
      expect([...destinationsForVaultShape(shape)].sort()).toEqual([...DESTINATION_IDS].sort());
    }
  });
});
