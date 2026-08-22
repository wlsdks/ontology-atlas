/**
 * Write-path wiring for the node-eligibility gate (2026-07-31 council —
 * `docs/DECISIONS.md`, 「온톨로지 구축 규격」 — the ontology construction rules).
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
  writeDoc as writeVaultDoc,
} from './vault.mjs';

let root;
let uidSequence = 0;

function nextTestUid() {
  uidSequence += 1;
  return `00000000-0000-4000-8000-${String(uidSequence).padStart(12, '0')}`;
}

function writeDoc(vaultRoot, slug, doc, options) {
  return writeVaultDoc(vaultRoot, slug, {
    ...doc,
    frontmatter: { uid: nextTestUid(), ...doc.frontmatter },
  }, options);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ontology-atlas-write-gate-test-'));
  mkdirSync(join(root, 'capabilities'), { recursive: true });
  mkdirSync(join(root, 'domains'), { recursive: true });
  writeFileSync(
    join(root, 'domains', 'cli.md'),
    `---\nuid: ${nextTestUid()}\nslug: domains/cli\nkind: domain\ntitle: CLI\n---\n`,
  );
  writeFileSync(
    join(root, 'capabilities', 'entry.md'),
    `---\nuid: ${nextTestUid()}\nslug: capabilities/entry\nkind: capability\ntitle: Entry\ndomain: domains/cli\nelements: []\n---\n`,
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
    assert.deepEqual(codesFor(findings, 'capabilities/fresh'), [
      'capability-without-evidence',
      'path-shaped-reference',
    ]);
    const [finding] = findings.filter((f) => f.code === 'path-shaped-reference');
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

  /**
   * The two calibration cases the amendment named. They are the whole reason the
   * dense-parent check has a precondition at all: without one it fires on both,
   * and a check that flags the vault's single healthy wide parent is a check the
   * reader learns to ignore.
   */
  // 2026-08-01 field trial — an agent handed only the vault answered "there is no
  // code entrypoint" for 8 of 16 capabilities. The rules demand evidence and
  // nobody reported its absence. **This does not block** — the write succeeds and
  // only the signal fires.
  describe('capability without evidence — 막지 않고 말한다', () => {
    it('생성 시점에 `elements:` 가 비면 한 번 말한다 (쓰기는 성공한다)', () => {
      writeDoc(root, 'capabilities/no-evidence', {
        frontmatter: {
          slug: 'capabilities/no-evidence',
          kind: 'capability',
          title: 'No Evidence',
          domain: 'domains/cli',
        },
        body: '',
      });
      const findings = drainNodeEligibilityFindings();
      assert.deepEqual(codesFor(findings, 'capabilities/no-evidence'), [
        'capability-without-evidence',
      ]);
      const [finding] = findings.filter((f) => f.slug === 'capabilities/no-evidence');
      assert.match(finding.message, /never blocked|nothing here blocks/i);
      assert.match(finding.message, /patch_concept/);
    });

    it('capability path 만 있어도 증거다 — 노드가 아니어도 조용하다', () => {
      writeDoc(root, 'capabilities/path-evidence', {
        frontmatter: {
          slug: 'capabilities/path-evidence',
          kind: 'capability',
          title: 'Path Evidence',
          domain: 'domains/cli',
          path: 'cli/src/commands/absorb.mjs',
        },
        body: '',
      });
      const codes = codesFor(drainNodeEligibilityFindings(), 'capabilities/path-evidence');
      assert.equal(codes.includes('capability-without-evidence'), false);
      assert.equal(codes.includes('path-shaped-reference'), false);
    });

    it('나중 수정에는 다시 말하지 않는다 — 이름 먼저, 파일 나중이 정직한 순서다', () => {
      writeDoc(root, 'capabilities/later', {
        frontmatter: {
          slug: 'capabilities/later',
          kind: 'capability',
          title: 'Later',
          domain: 'domains/cli',
        },
        body: '',
      });
      drainNodeEligibilityFindings();
      updateDoc(root, 'capabilities/later', { frontmatter: { title: 'Later, renamed' } });
      assert.deepEqual(codesFor(drainNodeEligibilityFindings(), 'capabilities/later'), []);
    });
  });

  describe('dense parent — the two calibration cases', () => {
    function seedElements(count, { resolved }) {
      const refs = [];
      for (let i = 0; i < count; i += 1) {
        if (resolved) {
          writeFileSync(
            join(root, 'elements', `e${i}.md`),
            `---\nuid: ${nextTestUid()}\nslug: elements/e${i}\nkind: element\ntitle: E${i}\ndomain: domains/cli\n---\n`,
          );
          refs.push(`elements/e${i}`);
        } else {
          refs.push(`cli/src/commands/cmd${i}.mjs`);
        }
      }
      return refs;
    }

    it('topology-kind-legibility shape stays silent — 7 children, all resolving, no batch', () => {
      mkdirSync(join(root, 'elements'), { recursive: true });
      const refs = seedElements(7, { resolved: true });
      resetNodeEligibilityGate();
      writeDoc(root, 'capabilities/legibility', {
        frontmatter: {
          slug: 'capabilities/legibility',
          kind: 'capability',
          title: 'Topology Kind Legibility',
          domain: 'domains/cli',
          elements: refs,
        },
        body: '',
      });
      const findings = drainNodeEligibilityFindings();
      assert.deepEqual(findings.filter((f) => f.code === 'dense-parent'), []);
      // …and nothing else either: every reference resolves.
      assert.deepEqual(findings, []);
    });

    it('cli-developer-entry shape is caught — but as evidence, not as width', () => {
      mkdirSync(join(root, 'elements'), { recursive: true });
      const real = seedElements(1, { resolved: true });
      resetNodeEligibilityGate();
      updateDoc(root, 'capabilities/entry', {
        frontmatter: { elements: [...real, ...seedElements(91, { resolved: false })] },
      });
      const findings = drainNodeEligibilityFindings();
      // The gate must not stay quiet about this node — that is the whole point.
      const paths = findings.filter((f) => f.code === 'path-shaped-reference');
      assert.equal(paths.length, 1);
      assert.equal(paths[0].count, 91);

      // But dense-parent specifically must NOT fire, and that is not a miss: it
      // counts only children that resolve, and this node has one. Counting the 91
      // would call the defect "healthy growth" and would also mean the node stops
      // looking dense the moment it is repaired — the metric would be measuring
      // the bug. Width is not what is wrong here; category is.
      assert.deepEqual(findings.filter((f) => f.code === 'dense-parent'), []);
    });

    it('a machine-filled parent fires even when every child resolves', () => {
      mkdirSync(join(root, 'elements'), { recursive: true });
      const refs = seedElements(9, { resolved: true });
      resetNodeEligibilityGate();
      // Grown one write at a time, as `add_relation` does — the shape that made
      // the 92, and the only way the vault can know a machine did it.
      for (let i = 1; i <= refs.length; i += 1) {
        patchFrontmatter(root, 'capabilities/entry', { elements: refs.slice(0, i) });
      }
      const dense = drainNodeEligibilityFindings().filter((f) => f.code === 'dense-parent');
      // Spoken once, at the crossing (7 = trigger 6 + 1), then quiet — the same
      // first-crossing-then-multiples rule the other three checks follow.
      assert.equal(dense.length, 1);
      assert.equal(dense[0].count, 7);
      assert.equal(dense[0].basis, 'bootstrap');
      assert.equal(dense[0].trigger, 6);
      assert.match(dense[0].message, /trigger, not a limit/);
      assert.doesNotMatch(dense[0].message, /keep under/i);
    });

    it('the same nine children added by hand, not in one session, stay silent', () => {
      mkdirSync(join(root, 'elements'), { recursive: true });
      const refs = seedElements(9, { resolved: true });
      resetNodeEligibilityGate();
      patchFrontmatter(root, 'capabilities/entry', { elements: refs });
      // One write adding nine is still one batch, so drop the provenance record
      // to model "these were already on disk when the session opened".
      resetNodeEligibilityGate();
      patchFrontmatter(root, 'capabilities/entry', { elements: refs });
      assert.deepEqual(drainNodeEligibilityFindings(), []);
    });
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

  // Slug flatness (decided 2026-08-01) — the single door where a new identity is
  // born (writeDoc) rejects a path-shaped slug as a hard error. Unlike the fan-out
  // gate it blocks, because this is shape validity: measured, 43 path-shaped slugs
  // came through this door in a regenerated vault and collapsed the on-screen node
  // count from 68 to 66.
  it('writeDoc rejects a path-style slug under the kind folder', () => {
    assert.throws(
      () =>
        writeDoc(root, 'elements/src/views/home', {
          frontmatter: {
            slug: 'elements/src/views/home',
            kind: 'element',
            title: 'Home',
          },
          body: '',
        }),
      /nests a path under elements\//,
    );
  });

  it('writeDoc leaves foreign vault nesting alone (schema folder 밖)', () => {
    // The user's own folder convention inside their vault — not the gate's business under the local-first contract.
    writeDoc(root, 'services/auth-api', {
      frontmatter: { slug: 'services/auth-api', kind: 'element', title: 'Auth API' },
      body: '',
    });
  });
});
