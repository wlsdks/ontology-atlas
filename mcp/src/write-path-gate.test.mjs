/**
 * Write-path wiring for the node-eligibility gate (2026-07-31 council —
 * `docs/DECISIONS.md`, 「온톨로지 구축 규격」).
 *
 * This file proves ONE thing, and deliberately only one: that the gate is
 * wired into the **shared** write primitive, so `add_concept`, `patch_concept`,
 * and `add_relation` all inherit it. That is the defect the council measured —
 * the warning pipeline lived on the creation door only, and the 92 unresolved
 * `elements:` entries on `cli-developer-entry` grew through `patch_concept`,
 * which emitted nothing at all.
 *
 * Everything the gate *decides* (which refs are path-shaped, what the message
 * says, what the thresholds are) belongs to
 * `tests/contract/vault-schema.contract.test.ts` and the construction-rules
 * literals. Splitting it this way keeps this file honest: if someone re-routes
 * one of the three doors around `commitDoc`, this fails, and nothing else does.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  drainNodeEligibilityFindings,
  patchFrontmatter,
  resetNodeEligibilityGate,
  updateDoc,
  writeDoc,
} from './vault.mjs';

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ontology-atlas-write-gate-test-'));
  mkdirSync(join(root, 'capabilities'), { recursive: true });
  mkdirSync(join(root, 'domains'), { recursive: true });
  writeFileSync(
    join(root, 'domains', 'cli.md'),
    '---\nslug: domains/cli\nkind: domain\ntitle: CLI\n---\n',
  );
  writeFileSync(
    join(root, 'capabilities', 'entry.md'),
    '---\nslug: capabilities/entry\nkind: capability\ntitle: Entry\ndomain: domains/cli\nelements: []\n---\n',
  );
  resetNodeEligibilityGate();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  resetNodeEligibilityGate();
});

function codesFor(findings, slug) {
  return findings.filter((f) => f.slug === slug).map((f) => f.code).sort();
}

describe('node-eligibility gate — the three write doors inherit one gate', () => {
  it('writeDoc (add_concept) reports an unresolved, path-shaped elements entry', () => {
    writeDoc(root, 'capabilities/fresh', {
      frontmatter: {
        slug: 'capabilities/fresh',
        kind: 'capability',
        title: 'Fresh',
        domain: 'domains/cli',
        elements: ['cli/src/commands/absorb.mjs'],
      },
      body: '',
    });
    const findings = drainNodeEligibilityFindings();
    assert.deepEqual(codesFor(findings, 'capabilities/fresh'), ['path-shaped-reference']);
    const [finding] = findings.filter((f) => f.slug === 'capabilities/fresh');
    assert.equal(finding.key, 'elements');
    assert.deepEqual(finding.refs, ['cli/src/commands/absorb.mjs']);
    assert.match(finding.message, /evidence/i);
  });

  it('updateDoc (patch_concept) reports the same defect — the door the 92 actually grew through', () => {
    updateDoc(root, 'capabilities/entry', {
      frontmatter: {
        elements: ['cli/src/commands/absorb.mjs', 'cli/src/commands/relate.mjs'],
      },
    });
    const findings = drainNodeEligibilityFindings();
    assert.deepEqual(codesFor(findings, 'capabilities/entry'), ['path-shaped-reference']);
    const [finding] = findings;
    assert.equal(finding.count, 2);
  });

  it('patchFrontmatter (add_relation) reports an unresolved non-path reference', () => {
    patchFrontmatter(root, 'capabilities/entry', { elements: ['elements/nope'] });
    const findings = drainNodeEligibilityFindings();
    assert.deepEqual(codesFor(findings, 'capabilities/entry'), ['dangling-graph-reference']);
  });

  it('resolved references produce no finding on any door', () => {
    writeDoc(root, 'elements/parser', {
      frontmatter: {
        slug: 'elements/parser',
        kind: 'element',
        title: 'Parser',
        domain: 'domains/cli',
      },
      body: '',
    });
    drainNodeEligibilityFindings();
    patchFrontmatter(root, 'capabilities/entry', { elements: ['elements/parser'] });
    updateDoc(root, 'capabilities/entry', { frontmatter: { relates: ['domains/cli'] } });
    assert.deepEqual(drainNodeEligibilityFindings(), []);
  });

  it('never blocks the write — the file lands with the offending value intact', () => {
    const filePath = writeDoc(root, 'capabilities/kept', {
      frontmatter: {
        slug: 'capabilities/kept',
        kind: 'capability',
        title: 'cli/src/commands/absorb.mjs',
        domain: 'domains/cli',
        elements: ['cli/src/commands/absorb.mjs'],
      },
      body: '',
    });
    assert.ok(filePath.endsWith('capabilities/kept.md'));
    const codes = codesFor(drainNodeEligibilityFindings(), 'capabilities/kept');
    assert.ok(codes.includes('path-shaped-title'));
    assert.ok(codes.includes('path-shaped-reference'));
  });

  it('draining is destructive — a second drain returns nothing', () => {
    patchFrontmatter(root, 'capabilities/entry', { elements: ['elements/nope'] });
    assert.equal(drainNodeEligibilityFindings().length, 1);
    assert.deepEqual(drainNodeEligibilityFindings(), []);
  });

  it('repeats stay quiet until the count crosses the next multiple', () => {
    patchFrontmatter(root, 'capabilities/entry', { elements: ['elements/a'] });
    assert.equal(drainNodeEligibilityFindings().length, 1);
    // Same slug, same code, count 1 → 2: below the next multiple, so silent.
    patchFrontmatter(root, 'capabilities/entry', { elements: ['elements/a', 'elements/b'] });
    assert.deepEqual(drainNodeEligibilityFindings(), []);
    // Crossing the repeat multiple speaks once more.
    patchFrontmatter(root, 'capabilities/entry', {
      elements: Array.from({ length: 10 }, (_, i) => `elements/x${i}`),
    });
    assert.equal(drainNodeEligibilityFindings().length, 1);
  });

  it('bulk provenance fires when one machine batch fills one parent', () => {
    for (let i = 0; i < 5; i += 1) {
      writeDoc(root, `elements/bulk-${i}`, {
        frontmatter: {
          slug: `elements/bulk-${i}`,
          kind: 'element',
          title: `Bulk ${i}`,
          domain: 'domains/cli',
        },
        body: '',
      });
    }
    const findings = drainNodeEligibilityFindings();
    const bulk = findings.filter((f) => f.code === 'bulk-provenance');
    assert.equal(bulk.length, 1);
    assert.equal(bulk[0].parent, 'domains/cli');
    assert.equal(bulk[0].count, 5);
  });
});
