import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { matchNodesFromFiles } from './graph-queries.mjs';

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

const slugs = (found) => found.rows.map((row) => row.slug).sort();

describe('matchNodesFromFiles', () => {
  it('reports the one node nothing points at, counts an ambiguous short reference for each candidate, and answers a vault with an invalid uid', () => {
    const found = matchNodesFromFiles(vaultOf(SHOP), { hasIncoming: false });
    assert.deepEqual(slugs(found), ['capabilities/refund']);
    const [refund] = found.rows;
    assert.deepEqual(
      { inDegree: refund.inDegree, outDegree: refund.outDegree, kind: refund.kind },
      { inDegree: 0, outDegree: 1, kind: 'capability' },
    );
    const ledgers = matchNodesFromFiles(vaultOf(SHOP), { hasIncoming: true }).rows.filter((row) => row.slug.endsWith('ledger'));
    assert.deepEqual(ledgers.map((row) => [row.slug, row.inDegree]).sort(), [['elements/archive/ledger', 1], ['elements/ledger', 1]]);
  });

  it('splits an unfiltered answer exactly into hasIncoming true and false, with every filter combination', () => {
    const root = vaultOf({ ...SHOP, README: 'kind: vault-readme\ntitle: Readme\n' });
    for (const filter of [{}, { kind: 'capability' }, { domain: 'domains/billing' }, { hasOutgoing: true }, { hasOutgoing: false }]) {
      const open = { ...filter, excludeKinds: [] };
      const all = slugs(matchNodesFromFiles(root, open));
      const referenced = slugs(matchNodesFromFiles(root, { ...open, hasIncoming: true }));
      const orphans = slugs(matchNodesFromFiles(root, { ...open, hasIncoming: false }));
      assert.deepEqual([...referenced, ...orphans].sort(), all, JSON.stringify(filter));
      assert.deepEqual(referenced.filter((slug) => orphans.includes(slug)), []);
    }
  });

  it('leaves out the project and the vault README only for hasIncoming false, unless a kind or an exclusion list says otherwise', () => {
    const root = vaultOf({ ...SHOP, README: 'kind: vault-readme\ntitle: Readme\n' });
    assert.deepEqual(matchNodesFromFiles(root, { hasIncoming: false }).excludeKinds, ['project', 'vault-readme']);
    assert.deepEqual(matchNodesFromFiles(root, {}).excludeKinds, []);
    assert.deepEqual(slugs(matchNodesFromFiles(root, { hasIncoming: false, excludeKinds: [] })), ['README', 'capabilities/refund', 'projects/shop']);
    assert.deepEqual(slugs(matchNodesFromFiles(root, { hasIncoming: false, kind: 'project' })), ['projects/shop']);
    assert.deepEqual(slugs(matchNodesFromFiles(root, { hasIncoming: false, excludeKinds: ['capability'] })), ['README', 'projects/shop']);
  });
});
