import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { findOrphans } from './graph-queries.mjs';

const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function vaultOf(files) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-orphans-'));
  roots.push(root);
  for (const [slug, frontmatter] of Object.entries(files)) {
    const path = join(root, `${slug}.md`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `---\n${frontmatter}---\n\n# ${slug}\n\nBody.\n`);
  }
  return root;
}

/** A small shop: only `capabilities/refund` is named by nobody. */
const SHOP = {
  'projects/shop': 'kind: project\ntitle: Shop\ndomains:\n  - domains/billing\n',
  'domains/billing': 'kind: domain\ntitle: Billing\ncapabilities:\n  - capabilities/charge\n',
  // `ledger` names two nodes, so it is a reference to each of them.
  'capabilities/charge': 'kind: capability\ntitle: Charge a card\ndomain: domains/billing\nelements:\n  - ledger\n',
  'elements/ledger': 'kind: element\ntitle: Ledger\ndomain: domains/billing\n',
  'elements/archive/ledger': 'uid: not-a-uid\nkind: element\ntitle: Archived ledger\ndomain: domains/billing\n',
  'capabilities/refund': 'kind: capability\ntitle: Refund a payment\ndomain: domains/billing\n',
};

describe('findOrphans', () => {
  it('reports the one node nothing points at, counts an ambiguous short reference for each candidate, and answers a vault with an invalid uid', () => {
    const { total, orphans } = findOrphans(vaultOf(SHOP));
    assert.equal(total, 1);
    assert.deepEqual(orphans.map((row) => row.slug), ['capabilities/refund']);
    assert.deepEqual(
      { inDegree: orphans[0].inDegree, outDegree: orphans[0].outDegree, kind: orphans[0].kind },
      { inDegree: 0, outDegree: 1, kind: 'capability' },
    );
  });

  it('leaves out the project and the vault README unless a kind or an exclusion list says otherwise', () => {
    const root = vaultOf({ ...SHOP, README: 'kind: vault-readme\ntitle: Readme\n' });
    assert.deepEqual(findOrphans(root).excludeKinds, ['project', 'vault-readme']);
    assert.deepEqual(findOrphans(root, { excludeKinds: [] }).orphans.map((row) => row.slug).sort(), ['README', 'capabilities/refund', 'projects/shop']);
    assert.deepEqual(findOrphans(root, { kind: 'project' }).orphans.map((row) => row.slug), ['projects/shop']);
    assert.deepEqual(findOrphans(root, { excludeKinds: ['capability'] }).orphans.map((row) => row.slug).sort(), ['README', 'projects/shop']);
  });
});
