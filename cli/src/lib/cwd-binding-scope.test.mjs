import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { cwdBindingScope } from './cwd-binding-scope.mjs';

/**
 * Measured damage, 2026-08-24: running `init <somewhere-else>` from this repository rewrote *this
 * repository's* `.mcp.json` and `.codex/config.toml` to point at a scratch vault, silently. The old
 * guard asked only "is cwd different from the target", which is true of every unrelated directory on
 * the disk.
 */
describe('cwd binding scope — whose agents may this command repoint', () => {
  it('wires cwd when the vault is created inside it', () => {
    // The flow this write exists for: standing in my project, putting a vault in it.
    const scope = cwdBindingScope('/Users/dana/my-product', '/Users/dana/my-product/atlas');
    assert.equal(scope.write, true);
    assert.equal(scope.reason, 'inside');
    assert.equal(scope.relativeVault, './atlas');
  });

  it('refuses to touch cwd when the vault lands outside it', () => {
    // ⚠️ The regression. cwd is not the codebase for that vault; it is where the person stood.
    const scope = cwdBindingScope('/Users/dana/oh-my-ontology', '/tmp/scratch-vault');
    assert.equal(scope.write, false, 'rewrote an unrelated project agent config');
    assert.equal(scope.reason, 'outside');
    assert.equal(scope.relativeVault, null);
  });

  it('refuses a sibling directory, which is outside however close it looks', () => {
    const scope = cwdBindingScope('/Users/dana/project-a', '/Users/dana/project-b');
    assert.equal(scope.write, false);
    assert.equal(scope.reason, 'outside');
  });

  it('refuses the parent, which would repoint every project under it', () => {
    const scope = cwdBindingScope('/Users/dana/my-product/packages/web', '/Users/dana/my-product');
    assert.equal(scope.write, false);
    assert.equal(scope.reason, 'outside');
  });

  it('writes nothing extra when the vault is cwd itself', () => {
    // The vault's own config already covers this directory; a second write would just duplicate it.
    const scope = cwdBindingScope('/Users/dana/vault', '/Users/dana/vault');
    assert.equal(scope.write, false);
    assert.equal(scope.reason, 'same');
  });

  it('handles a nested vault several levels down', () => {
    const scope = cwdBindingScope('/Users/dana/my-product', '/Users/dana/my-product/docs/ontology');
    assert.equal(scope.write, true);
    assert.equal(scope.relativeVault, './docs/ontology');
  });

  it('is not fooled by a shared name prefix', () => {
    // `/Users/dana/my-product-archive` is not inside `/Users/dana/my-product`.
    const scope = cwdBindingScope('/Users/dana/my-product', '/Users/dana/my-product-archive/atlas');
    assert.equal(scope.write, false, '이름이 비슷하다고 안에 있는 것은 아니다');
  });
});
