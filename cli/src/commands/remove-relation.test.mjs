import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { planRemoval, runRemoveRelation } from './remove-relation.mjs';

/**
 * Owner, 2026-08-25: *"make every feature usable from the CLI alone."* Measured the same day: the
 * CLI could **create** a relation with `relate` and had nothing to remove one, so a person working
 * only in the terminal had to open the Markdown and hand-edit frontmatter to undo their own typo.
 *
 * These hold the part a wrong answer would quietly corrupt: which key is touched, what survives it,
 * and that a relation which is not there is reported rather than invented.
 */
describe('remove-relation — 관계 하나를 정확히 덜어낸다', () => {
  it('배열에서 그 하나만 빼고 나머지는 그대로 둔다', () => {
    const plan = planRemoval(
      { relates: ['capabilities/a', 'capabilities/b', 'capabilities/c'] },
      'relates',
      'capabilities/b',
    );
    assert.equal(plan.found, true);
    assert.equal(plan.key, 'relates');
    assert.deepEqual(plan.next, ['capabilities/a', 'capabilities/c']);
  });

  it('관계 타입을 프론트매터 키로 옮긴다 — depends_on 은 dependencies 다', () => {
    // ⚠️ The public type and the frontmatter key differ, and writing to the type name would create a
    // second key holding half the graph while the real one still says the relation exists.
    const plan = planRemoval({ dependencies: ['capabilities/x'] }, 'depends_on', 'capabilities/x');
    assert.equal(plan.key, 'dependencies');
    assert.deepEqual(plan.next, []);
  });

  it('hand-authored depends_on: aliases read as the dependencies edge family', () => {
    // Bug sweep 2026-09-01: the remover read only the literal canonical key, so a
    // doc carrying `depends_on: [x]` answered "this document has no dependencies"
    // for an edge the map plainly renders. The MCP remover already folds the alias.
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

  it('domain 은 배열이 아니라 하나짜리 값이다', () => {
    const plan = planRemoval({ domain: 'domains/core' }, 'domain', 'domains/core');
    assert.equal(plan.found, true);
    assert.equal(plan.next, null);
  });

  it('다른 도메인을 지우라고 하면 지우지 않고 현재 값을 알려 준다', () => {
    const plan = planRemoval({ domain: 'domains/core' }, 'domain', 'domains/other');
    assert.equal(plan.found, false);
    assert.match(plan.reason, /domains\/core/);
  });

  /*
   * ⚠️ Two different failures, and a person can act on only one of them. "The list has no such slug"
   * means the slug is wrong; "this document has no such list" means the relation *type* is wrong.
   * Reporting both as "not found" would hide a mistyped type behind a mistyped slug.
   */
  it('없는 관계와 없는 종류를 구분해서 말한다', () => {
    const missingSlug = planRemoval({ relates: ['capabilities/a'] }, 'relates', 'capabilities/zz');
    assert.equal(missingSlug.found, false);
    assert.match(missingSlug.reason, /not in relates/);

    const missingKey = planRemoval({ relates: ['capabilities/a'] }, 'contains', 'capabilities/a');
    assert.equal(missingKey.found, false);
    assert.match(missingKey.reason, /no contains/);
  });

  it('중복이 들어 있어도 정규화한 뒤 뺀다', () => {
    const plan = planRemoval(
      { relates: ['capabilities/a', 'capabilities/a', 'capabilities/b'] },
      'relates',
      'capabilities/a',
    );
    assert.deepEqual(plan.next, ['capabilities/b']);
  });
});

/*
 * Owner inspection, 2026-09-26: removing the only `relates` entry of capabilities/wiki-pages left
 * `relates: []` in the file (the map's editor), and this command wrote the same residue plus
 * `relation_notes: {  }`. The file must read as if the relation had never been written; only a
 * kind's scaffold list (a capability's `elements`) returns to the `[]` creating the node writes.
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
