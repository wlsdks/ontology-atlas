import { describe, expect, it, vi } from 'vitest';
import { MemoryVault } from '../../../../../tests/helpers/memory-vault';

/**
 * A delta never grows a vault past the walk's entry ceiling: there the walk truncates, which only
 * a walk can reproduce. The ceiling is lowered here so a vault can reach it.
 */

vi.mock('./walk-vault', async (original) => ({
  ...(await original<typeof import('./walk-vault')>()),
  VAULT_WALK_MAX_ENTRIES: 4,
}));

import { applyVaultChanges } from './apply-vault-changes';
import { buildLocalManifestWithEntries } from './build-local-manifest';

describe('applyVaultChanges at the entry ceiling', () => {
  it('applies a create below the ceiling and asks for a walk at it', async () => {
    const vault = new MemoryVault({ 'a.md': '# A', 'b.md': '# B' });
    const snapshot = await buildLocalManifestWithEntries(vault.root());
    vault.write('c.md', '# C');
    const three = await applyVaultChanges(vault.root(), snapshot, [vault.change('c.md')]);
    expect(three.kind).toBe('applied');
    if (three.kind !== 'applied') return;
    vault.write('d.md', '# D');
    expect((await applyVaultChanges(vault.root(), three.snapshot, [vault.change('d.md')])).kind).toBe('rescan');
  });
});
