/**
 * Proves only that the node-eligibility gate is wired into the shared write
 * primitive, so add_concept, patch_concept and add_relation all inherit it
 * (`docs/DECISIONS.md`, the ontology construction rules). What the gate decides
 * belongs to `tests/contract/vault-schema.contract.test.ts` and the rule
 * literals; if a door is re-routed around `commitDoc`, this fails and nothing
 * else does.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defaultBody } from '../schema.mjs';
import {
  configureNodeEligibilityRepoRoot,
  drainNodeEligibilityFindings,
  patchFrontmatter,
  resetNodeEligibilityGate,
  updateDoc,
  writeDoc as writeVaultDoc,
} from './doc-writes.mjs';

let root;
let uidSequence = 0;

/**
 * A body that answers the gate's body questions, so the frontmatter cases'
 * exact code lists are not buried under body codes; the body half is proved
 * on its own below.
 */
const WRITTEN_BODY = [
  '# Written',
  '',
  'This node states one behaviour the vault can point at, in a sentence that does',
  'not repeat its own title back to the reader.',
  '',
  '## Includes',
  '',
  '- The one thing it actually covers.',
  '',
  '## Excludes',
  '',
  '- The neighbouring thing it is confused with and does not do.',
  '',
  '## Uncertainty',
  '',
  '- The second caller was inferred from imports rather than read.',
  '',
].join('\n');

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
      body: WRITTEN_BODY,
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
    // Count 1 → 2 is below the next multiple, so silent.
    patchFrontmatter(root, 'capabilities/entry', { elements: ['elements/a', 'elements/b'] });
    assert.deepEqual(drainNodeEligibilityFindings(), []);
    patchFrontmatter(root, 'capabilities/entry', {
      elements: Array.from({ length: 10 }, (_, i) => `elements/x${i}`),
    });
    assert.equal(drainNodeEligibilityFindings().length, 1);
  });

  // Never blocks: the write succeeds and only the signal fires.
  describe('capability without evidence — says so without blocking', () => {
    it('says so once when `elements:` is empty at creation (the write succeeds)', () => {
      writeDoc(root, 'capabilities/no-evidence', {
        frontmatter: {
          slug: 'capabilities/no-evidence',
          kind: 'capability',
          title: 'No Evidence',
          domain: 'domains/cli',
        },
        body: WRITTEN_BODY,
      });
      const findings = drainNodeEligibilityFindings();
      assert.deepEqual(codesFor(findings, 'capabilities/no-evidence'), [
        'capability-without-evidence',
      ]);
      const [finding] = findings.filter((f) => f.slug === 'capabilities/no-evidence');
      assert.match(finding.message, /never blocked|nothing here blocks/i);
      assert.match(finding.message, /patch_concept/);
    });

    it('a capability path alone is evidence, so it stays quiet even without a node', () => {
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

    it('does not repeat on later edits: name first, file later is the honest order', () => {
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

  /**
   * Without its precondition, dense-parent would flag the vault's single healthy
   * wide parent.
   */
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
        body: WRITTEN_BODY,
      });
      const findings = drainNodeEligibilityFindings();
      assert.deepEqual(findings.filter((f) => f.code === 'dense-parent'), []);
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
      const paths = findings.filter((f) => f.code === 'path-shaped-reference');
      assert.equal(paths.length, 1);
      assert.equal(paths[0].count, 91);

      // dense-parent must not fire: it counts only resolving children (one here).
      // Counting the unresolved would call the defect growth, and the node would
      // stop looking dense once repaired. Category is wrong here, not width.
      assert.deepEqual(findings.filter((f) => f.code === 'dense-parent'), []);
    });

    it('a machine-filled parent fires even when every child resolves', () => {
      mkdirSync(join(root, 'elements'), { recursive: true });
      const refs = seedElements(9, { resolved: true });
      resetNodeEligibilityGate();
      // Grown one write at a time, as add_relation does: only the session can tell
      // a machine did it.
      for (let i = 1; i <= refs.length; i += 1) {
        patchFrontmatter(root, 'capabilities/entry', { elements: refs.slice(0, i) });
      }
      const dense = drainNodeEligibilityFindings().filter((f) => f.code === 'dense-parent');
      // Once at the crossing (trigger 6 + 1), then quiet.
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
      // One write adding nine is still one batch: reset to model "already on disk".
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

  // writeDoc, where identities are born, rejects a path-shaped slug as a hard
  // error: shape validity, since such slugs collapse distinct nodes on screen.
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

  it('writeDoc leaves foreign vault nesting outside the schema folders alone', () => {
    // The user's own folder convention: not the gate's business (local-first).
    writeDoc(root, 'services/auth-api', {
      frontmatter: { slug: 'services/auth-api', kind: 'element', title: 'Auth API' },
      body: '',
    });
  });

  /**
   * The kind-folder convention, stated when a slug is minted. Advisory and
   * creation-only: a patch cannot repair a slug, so repeating it has no exit.
   */
  describe('slug outside its kind folder — said once, never blocked', () => {
    it('reports a capability written at the vault root and names the canonical slug', () => {
      const filePath = writeDoc(root, 'option-declaration', {
        frontmatter: {
          slug: 'option-declaration',
          kind: 'capability',
          title: 'Option Declaration',
          domain: 'domains/cli',
          path: 'cli/src/index.mjs',
        },
        body: WRITTEN_BODY,
      });
      // Never blocked: the file lands where the caller asked.
      assert.ok(filePath.endsWith('/option-declaration.md'));
      const findings = drainNodeEligibilityFindings().filter((f) => f.code === 'slug-outside-kind-folder');
      assert.equal(findings.length, 1);
      assert.equal(findings[0].slug, 'option-declaration');
      assert.equal(findings[0].key, 'slug');
      assert.deepEqual(findings[0].refs, ['capabilities/option-declaration']);
      assert.match(findings[0].message, /rename_concept\(\{oldSlug:"option-declaration", newSlug:"capabilities\/option-declaration"\}\)/);
      assert.match(findings[0].message, /confirm/);
      assert.match(findings[0].message, /nothing here blocks it/);
    });

    it('reports a domain written at the vault root too', () => {
      writeDoc(root, 'help-documentation', {
        frontmatter: { slug: 'help-documentation', kind: 'domain', title: 'Help Documentation' },
        body: WRITTEN_BODY,
      });
      const findings = drainNodeEligibilityFindings().filter((f) => f.code === 'slug-outside-kind-folder');
      assert.deepEqual(findings.map((f) => f.refs[0]), ['domains/help-documentation']);
    });

    it('stays silent when the slug is already inside its folder', () => {
      writeDoc(root, 'capabilities/option-declaration', {
        frontmatter: {
          slug: 'capabilities/option-declaration',
          kind: 'capability',
          title: 'Option Declaration',
          domain: 'domains/cli',
          path: 'cli/src/index.mjs',
        },
        body: WRITTEN_BODY,
      });
      assert.deepEqual(
        drainNodeEligibilityFindings().filter((f) => f.code === 'slug-outside-kind-folder'),
        [],
      );
    });

    it('stays silent for the two kinds that have no folder', () => {
      // project and document live at the root by schema.
      writeDoc(root, 'atlas', {
        frontmatter: { slug: 'atlas', kind: 'project', title: 'Atlas' },
        body: WRITTEN_BODY,
      });
      writeDoc(root, 'release-notes', {
        frontmatter: { slug: 'release-notes', kind: 'document', title: 'Release Notes' },
        body: WRITTEN_BODY,
      });
      assert.deepEqual(
        drainNodeEligibilityFindings().filter((f) => f.code === 'slug-outside-kind-folder'),
        [],
      );
    });

    it('says it once — a later patch to the same node does not repeat it', () => {
      writeDoc(root, 'option-declaration', {
        frontmatter: {
          slug: 'option-declaration',
          kind: 'capability',
          title: 'Option Declaration',
          domain: 'domains/cli',
          path: 'cli/src/index.mjs',
        },
        body: WRITTEN_BODY,
      });
      drainNodeEligibilityFindings();
      patchFrontmatter(root, 'option-declaration', { title: 'Option Declaration, renamed' });
      assert.deepEqual(
        drainNodeEligibilityFindings().filter((f) => f.code === 'slug-outside-kind-folder'),
        [],
      );
    });
  });

  /**
   * The body half: the app's ACP session, the door real builds use, has no
   * evaluator lane. Wiring only; `meaning-findings.test.mjs` proves the judgement.
   */
  it('a body that is still the starter scaffold is reported on the creation door', () => {
    writeDoc(root, 'capabilities/labelled', {
      frontmatter: {
        slug: 'capabilities/labelled',
        kind: 'capability',
        title: 'Labelled',
        domain: 'domains/cli',
        path: 'cli/src/commands/absorb.mjs',
      },
      body: defaultBody('capability', 'Labelled'),
    });
    const codes = codesFor(drainNodeEligibilityFindings(), 'capabilities/labelled');
    assert.deepEqual(codes, ['boundary-missing', 'boundary-missing', 'definition-missing', 'uncertainty-missing']);
  });

  it('a cited folder is reported once the write door has grounded a repository root', () => {
    // Ungrounded first: measuring against the process cwd would report false drift.
    configureNodeEligibilityRepoRoot(null);
    patchFrontmatter(root, 'capabilities/entry', { path: 'capabilities' });
    assert.deepEqual(
      codesFor(drainNodeEligibilityFindings(), 'capabilities/entry').filter((code) => code === 'folder-only-evidence'),
      [],
    );
    resetNodeEligibilityGate();
    configureNodeEligibilityRepoRoot(root);
    patchFrontmatter(root, 'capabilities/entry', { path: 'capabilities' });
    const codes = codesFor(drainNodeEligibilityFindings(), 'capabilities/entry');
    assert.ok(codes.includes('folder-only-evidence'), codes.join(', '));
    configureNodeEligibilityRepoRoot(null);
  });

  /**
   * add_relation, add_relations, replace_relation and patch_concept all land
   * through `patchFrontmatter`, so one case proves all four. It
   * needs `previousFrontmatter` forwarded by `commitDoc`, or every patch re-accuses
   * every existing edge.
   */
  it('a dependency added by a relation write is reported when the citing file never names the target', () => {
    mkdirSync(join(root, 'src', 'lib'), { recursive: true });
    writeFileSync(join(root, 'src', 'lib', 'helper.ts'), 'export const helper = 1;\n');
    writeFileSync(join(root, 'src', 'stranger.ts'), 'export const nothing = "no other file";\n');
    writeFileSync(
      join(root, 'capabilities', 'helper.md'),
      `---\nuid: ${nextTestUid()}\nslug: capabilities/helper\nkind: capability\ntitle: Helper\ndomain: domains/cli\npath: src/lib/helper.ts\n---\n`,
    );
    try {
      configureNodeEligibilityRepoRoot(root);
      patchFrontmatter(root, 'capabilities/entry', { path: 'src/stranger.ts' });
      drainNodeEligibilityFindings();
      // What add_relation({type:"depends_on"}) does.
      patchFrontmatter(root, 'capabilities/entry', {
        dependencies: ['capabilities/helper'],
        relation_notes: { 'capabilities/helper': 'The entry point delegates to the helper.' },
      });
      const findings = drainNodeEligibilityFindings()
        .filter((f) => f.code === 'dependency-unwitnessed');
      assert.equal(findings.length, 1);
      assert.equal(findings[0].key, 'capabilities/helper');
      assert.match(findings[0].message, /src\/stranger\.ts/);
      assert.match(findings[0].message, /src\/lib\/helper\.ts/);

      /*
       * A later unrelated patch must not repeat it. The reset models the next server
       * run, where only `previousFrontmatter` from `commitDoc` can tell the edge is old.
       */
      resetNodeEligibilityGate();
      patchFrontmatter(root, 'capabilities/entry', { title: 'Entry, renamed' });
      assert.deepEqual(
        drainNodeEligibilityFindings().filter((f) => f.code === 'dependency-unwitnessed'),
        [],
      );
    } finally {
      configureNodeEligibilityRepoRoot(null);
    }
  });

  it('a dependency whose citing file does name the target is never mentioned', () => {
    mkdirSync(join(root, 'src', 'lib'), { recursive: true });
    writeFileSync(join(root, 'src', 'lib', 'helper.ts'), 'export const helper = 1;\n');
    writeFileSync(
      join(root, 'src', 'consumer.ts'),
      "import { helper } from './lib/helper';\nexport const used = helper;\n",
    );
    writeFileSync(
      join(root, 'capabilities', 'helper.md'),
      `---\nuid: ${nextTestUid()}\nslug: capabilities/helper\nkind: capability\ntitle: Helper\ndomain: domains/cli\npath: src/lib/helper.ts\n---\n`,
    );
    try {
      configureNodeEligibilityRepoRoot(root);
      patchFrontmatter(root, 'capabilities/entry', { path: 'src/consumer.ts' });
      drainNodeEligibilityFindings();
      patchFrontmatter(root, 'capabilities/entry', { dependencies: ['capabilities/helper'] });
      assert.deepEqual(
        drainNodeEligibilityFindings().filter((f) => f.code === 'dependency-unwitnessed'),
        [],
      );
    } finally {
      configureNodeEligibilityRepoRoot(null);
    }
  });

  /**
   * Wiring only: the creation door notices, attaches the row to the starter rather
   * than the node just written, and says it once however many real nodes follow.
   */
  it('reports the starter example when the first real node of its kind is created', () => {
    writeFileSync(
      join(root, 'domains', 'example-domain.md'),
      `---\nuid: ${nextTestUid()}\nslug: domains/example-domain\nkind: domain\ntitle: Example domain\ncapabilities: [capabilities/example-capability]\n---\n\n# Example domain\n\n- Nothing here has been checked against your code yet: this file is a starter, not an observation.\n\n## How to fill it in\n`,
    );
    writeDoc(root, 'domains/billing', {
      frontmatter: { slug: 'domains/billing', kind: 'domain', title: 'Billing' },
      body: WRITTEN_BODY,
    });
    const findings = drainNodeEligibilityFindings().filter((f) => f.code === 'starter-example-node');
    assert.equal(findings.length, 1);
    // The row names the file to act on, matching the vault-wide row so the queue dedupes.
    assert.equal(findings[0].slug, 'domains/example-domain');
    assert.deepEqual(findings[0].refs, ['domains/billing']);
    assert.match(findings[0].message, /domains\/billing/);
    assert.match(findings[0].message, /delete_concept/);

    // Once per starter: a thirty-node build must not repeat it thirty times.
    writeDoc(root, 'domains/identity', {
      frontmatter: { slug: 'domains/identity', kind: 'domain', title: 'Identity' },
      body: WRITTEN_BODY,
    });
    assert.deepEqual(
      drainNodeEligibilityFindings().filter((f) => f.code === 'starter-example-node'),
      [],
    );
  });

  /*
   * An `init` writing its own scaffold: nothing is wrong yet.
   */
  it('stays silent while the starter is still the only node of its kind', () => {
    writeFileSync(
      join(root, 'domains', 'example-domain.md'),
      `---\nuid: ${nextTestUid()}\nslug: domains/example-domain\nkind: domain\ntitle: Example domain\n---\n`,
    );
    // A capability arriving does not make the domain starter stale.
    writeDoc(root, 'capabilities/charge-card', {
      frontmatter: {
        slug: 'capabilities/charge-card',
        kind: 'capability',
        title: 'Charge a card',
        domain: 'domains/cli',
        path: 'cli/src/index.mjs',
      },
      body: WRITTEN_BODY,
    });
    assert.deepEqual(
      drainNodeEligibilityFindings().filter((f) => f.code === 'starter-example-node'),
      [],
    );
  });

  /*
   * add_concept on the starter address itself is not news to its writer; the
   * vault-wide pass reports it on the next validate_vault.
   */
  it('stays silent when the node being created IS the starter example', () => {
    writeDoc(root, 'domains/billing', {
      frontmatter: { slug: 'domains/billing', kind: 'domain', title: 'Billing' },
      body: WRITTEN_BODY,
    });
    drainNodeEligibilityFindings();
    writeDoc(root, 'domains/example-domain', {
      frontmatter: { slug: 'domains/example-domain', kind: 'domain', title: 'Example domain' },
      body: WRITTEN_BODY,
    });
    assert.deepEqual(
      drainNodeEligibilityFindings().filter((f) => f.code === 'starter-example-node'),
      [],
    );
  });

  it('a create whose `path:` climbs out of the repository lists nothing and reports nothing', () => {
    // Security: `path:` is agent-written, untrusted input.
    const outside = join(root, '..', `outside-${Date.now()}`);
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'private-notes.txt'), 'not for a tool response\n');
    try {
      configureNodeEligibilityRepoRoot(root);
      writeDoc(root, 'capabilities/escape', {
        frontmatter: {
          slug: 'capabilities/escape',
          kind: 'capability',
          title: 'Escape',
          domain: 'domains/cli',
          path: `../${outside.split('/').pop()}`,
        },
        body: WRITTEN_BODY,
      });
      const findings = drainNodeEligibilityFindings();
      assert.deepEqual(findings.filter((f) => f.code === 'folder-only-evidence'), []);
      assert.equal(JSON.stringify(findings).includes('private-notes'), false);
    } finally {
      configureNodeEligibilityRepoRoot(null);
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('updateDoc reports the body it was handed, and patchFrontmatter stays out of a body it never opened', () => {
    // A patch that replaces the body is judged…
    updateDoc(root, 'capabilities/entry', { body: defaultBody('capability', 'Entry') });
    assert.deepEqual(
      codesFor(drainNodeEligibilityFindings(), 'capabilities/entry').filter((code) =>
        code.startsWith('definition') || code.startsWith('boundary') || code.startsWith('uncertainty'),
      ),
      ['boundary-missing', 'boundary-missing', 'definition-missing', 'uncertainty-missing'],
    );
    resetNodeEligibilityGate();
    // …a frontmatter-only write is not, or every unrelated patch repeats the accusation.
    patchFrontmatter(root, 'capabilities/entry', { title: 'Entry, renamed' });
    assert.deepEqual(
      codesFor(drainNodeEligibilityFindings(), 'capabilities/entry').filter((code) =>
        code.startsWith('definition') || code.startsWith('boundary') || code.startsWith('uncertainty'),
      ),
      [],
    );
  });
});
