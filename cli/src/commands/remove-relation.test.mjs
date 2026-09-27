import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { planRemoval, runRemoveRelation } from './remove-relation.mjs';

/**
 * The parts a wrong answer would quietly corrupt: which key is touched, what survives, and that a
 * relation which is not there is reported rather than invented.
 */
describe('remove-relation removes exactly one relation', () => {
  it('removes only that entry and keeps the rest of the array', () => {
    const plan = planRemoval(
      { relates: ['capabilities/a', 'capabilities/b', 'capabilities/c'] },
      'relates',
      'capabilities/b',
    );
    assert.equal(plan.found, true);
    assert.equal(plan.key, 'relates');
    assert.deepEqual(plan.next, ['capabilities/a', 'capabilities/c']);
  });

  it('maps the relation type to its frontmatter key (depends_on is dependencies)', () => {
    // ⚠️ The public type and the frontmatter key differ, and writing to the type name would create a
    // second key holding half the graph while the real one still says the relation exists.
    const plan = planRemoval({ dependencies: ['capabilities/x'] }, 'depends_on', 'capabilities/x');
    assert.equal(plan.key, 'dependencies');
    assert.deepEqual(plan.next, []);
  });

  it('hand-authored depends_on: aliases read as the dependencies edge family', () => {
    // A doc carrying `depends_on: [x]` holds the dependencies edge; the MCP remover folds the alias too.
    const plan = planRemoval({ depends_on: ['capabilities/x'] }, 'depends_on', 'capabilities/x');
    assert.equal(plan.found, true);
    assert.equal(plan.key, 'dependencies');
    assert.deepEqual(plan.next, []);
    assert.deepEqual(plan.aliasKeys, ['depends_on']);
  });

  it('refs split across dependencies: and depends_on: are one deduped family', () => {
    const plan = planRemoval(
      { dependencies: ['capabilities/a'], depends_on: ['capabilities/b', 'capabilities/a'] },
      'depends_on',
      'capabilities/b',
    );
    assert.equal(plan.found, true);
    assert.deepEqual(plan.next, ['capabilities/a']);
    assert.deepEqual(plan.aliasKeys, ['depends_on']);
  });

  it('treats domain as a single value, not an array', () => {
    const plan = planRemoval({ domain: 'domains/core' }, 'domain', 'domains/core');
    assert.equal(plan.found, true);
    assert.equal(plan.next, null);
  });

  it('refuses to remove a different domain and reports the current value', () => {
    const plan = planRemoval({ domain: 'domains/core' }, 'domain', 'domains/other');
    assert.equal(plan.found, false);
    assert.match(plan.reason, /domains\/core/);
  });

  /*
   * "The list has no such slug" means the slug is wrong; "this document has no such list" means the type
   * is wrong. One "not found" for both would hide a mistyped type behind a mistyped slug.
   */
  it('distinguishes a missing relation from an unknown relation type', () => {
    const missingSlug = planRemoval({ relates: ['capabilities/a'] }, 'relates', 'capabilities/zz');
    assert.equal(missingSlug.found, false);
    assert.match(missingSlug.reason, /not in relates/);

    const missingKey = planRemoval({ relates: ['capabilities/a'] }, 'contains', 'capabilities/a');
    assert.equal(missingKey.found, false);
    assert.match(missingKey.reason, /no contains/);
  });

  it('normalises duplicates before removing', () => {
    const plan = planRemoval(
      { relates: ['capabilities/a', 'capabilities/a', 'capabilities/b'] },
      'relates',
      'capabilities/a',
    );
    assert.deepEqual(plan.next, ['capabilities/b']);
  });
});

/*
 * The file must read as if the relation had never been written; only a kind's scaffold list (a
 * capability's `elements`) returns to the `[]` that creating the node writes.
 */
describe('remove-relation — the bytes it leaves', () => {
  const doc = (lines) =>
    [
      '---',
      'uid: c9f6fc1b-8321-47ce-bd51-78b1f1c1389f',
      'slug: capabilities/wiki-pages',
      'kind: capability',
      'title: Wiki pages',
      'domain: domains/meaning',
      ...lines,
      '---',
      '',
      'Pages that cite their sources.',
      '',
    ].join('\n');

  async function removeFrom(content, to, type) {
    const root = mkdtempSync(join(tmpdir(), 'oatlas-remove-relation-'));
    try {
      mkdirSync(join(root, 'capabilities'), { recursive: true });
      const file = join(root, 'capabilities/wiki-pages.md');
      writeFileSync(file, content);
      const code = await runRemoveRelation(['capabilities/wiki-pages', to, type, '--vault', root, '--json'], {
        recordCliWrite: async () => {},
      });
      assert.equal(code, 0);
      return readFileSync(file, 'utf8');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('deletes the key with its only entry', async () => {
    const written = await removeFrom(
      doc(['elements: []', 'relates: [capabilities/library]']),
      'capabilities/library',
      'relates',
    );
    assert.equal(written, doc(['elements: []']));
  });

  it('deletes relation_notes with the only reason it held', async () => {
    const written = await removeFrom(
      doc([
        'elements: []',
        'dependencies: [elements/frontmatter-parser]',
        'relation_notes: { elements/frontmatter-parser: "wiki-schema.mjs imports parser.mjs." }',
      ]),
      'elements/frontmatter-parser',
      'depends_on',
    );
    assert.equal(written, doc(['elements: []']));
  });

  it("returns a kind's scaffold list to []", async () => {
    const written = await removeFrom(
      doc(['elements: [elements/page-contract]']),
      'elements/page-contract',
      'elements',
    );
    assert.equal(written, doc(['elements: []']));
  });
});
