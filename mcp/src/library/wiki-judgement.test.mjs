import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { generatedWikiFolder, writeWikiFolderVault } from '../../../tests/fixtures/wiki-page-cases.mjs';
import { createVaultDocCache } from '../vault/documents/document-cache.mjs';
import { judgeLoadedWikiPages, wikiFolderBuildCount } from './wiki-judgement.mjs';

/** The generated folder on disk; `tests/contract/library/wiki-page-schema.contract.test.ts` holds its verdicts to the text validators. */
function generatedVault(t, count) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-wiki-judgement-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const folder = generatedWikiFolder(count);
  writeWikiFolderVault(root, folder);
  return { root, knownSources: new Set(folder.knownSources) };
}

/**
 * A document cache over `root` that counts every file read, a load pass's and a body read
 * back alike. The clock runs a minute ahead so no file just written counts as racily clean.
 */
function countingCache(root) {
  const reads = [];
  const cache = createVaultDocCache(root, {
    readSnapshot(path) {
      reads.push(path);
      return { raw: readFileSync(path, 'utf8'), stats: statSync(path) };
    },
    now: () => Date.now() + 60_000,
  });
  return { cache, reads };
}

const shown = (judged) => JSON.stringify(judged.map((page) => ({ path: page.path, ok: page.ok, codes: [...page.codes].sort(), problems: page.problems })));

/** The folder judged by a cache that has never seen it, so nothing kept from an earlier call can answer. */
const coldJudgement = (root, knownSources) => judgeLoadedWikiPages(createVaultDocCache(root).load(), knownSources);

const pageOf = (judged, path) => judged.find((page) => page.path === path);

test('a warm repeat reads no page, a shown page is read once, and an edit reads only the edited page', (t) => {
  const { root, knownSources } = generatedVault(t, 120);
  const { cache, reads } = countingCache(root);
  judgeLoadedWikiPages(cache.load(), knownSources);
  assert.ok(reads.length > 120, 'the first pass read the folder');

  reads.length = 0;
  const judged = judgeLoadedWikiPages(cache.load(), knownSources);
  assert.deepEqual(reads, [], 'a repeat over unchanged files read pages');
  const failing = judged.filter((page) => !page.ok).slice(0, 5);
  for (const page of failing) assert.ok(page.problems.length > 0);
  assert.deepEqual(reads.map((path) => path.slice(root.length + 1)), failing.map((page) => page.path));

  const edited = join(root, 'wiki/page-7.md');
  writeFileSync(edited, `${readFileSync(edited, 'utf8')}\nSee [[wiki/nowhere]].\n`);
  reads.length = 0;
  const afterEdit = judgeLoadedWikiPages(cache.load(), knownSources);
  assert.deepEqual(reads, [edited, edited], 'the load pass and the facts each read the edited page once');
  assert.ok(pageOf(afterEdit, 'wiki/page-7.md').codes.includes('dangling-wikilink'));
  assert.equal(shown(afterEdit), shown(coldJudgement(root, knownSources)));
});

test('calls on one loaded version judge the folder once, and a changed file judges it again', (t) => {
  const { root, knownSources } = generatedVault(t, 60);
  const { cache } = countingCache(root);
  const before = wikiFolderBuildCount();
  judgeLoadedWikiPages(cache.load(), knownSources);
  judgeLoadedWikiPages(cache.load(), knownSources);
  judgeLoadedWikiPages(cache.load(), knownSources, ['wiki/page-3.md']);
  assert.equal(wikiFolderBuildCount() - before, 1);

  const edited = join(root, 'wiki/page-3.md');
  writeFileSync(edited, `${readFileSync(edited, 'utf8')}\nSee [[wiki/page-4]].\n`);
  judgeLoadedWikiPages(cache.load(), knownSources);
  assert.equal(wikiFolderBuildCount() - before, 2);
});

test('the source list each call is handed decides a missing citation, though no page changed', (t) => {
  const { root, knownSources } = generatedVault(t, 20);
  writeFileSync(join(root, 'wiki/citer.md'), '---\ntitle: Citer\nsources:\n  - sources/later.pdf\n---\n\n## Facts\n\n- A claim. [[src:sources/later.pdf#p1]]\n');
  const { cache } = countingCache(root);
  const citer = (sources) => pageOf(judgeLoadedWikiPages(cache.load(), sources), 'wiki/citer.md');
  const missing = (page) => [page.codes.includes('citation-target-missing'), page.problems.some((entry) => entry.code === 'citation-target-missing')];
  assert.deepEqual(missing(citer(knownSources)), [true, true]);
  const builds = wikiFolderBuildCount();

  assert.deepEqual(missing(citer(new Set([...knownSources, 'sources/later.pdf']))), [false, false]);
  assert.deepEqual(missing(citer(knownSources)), [true, true]);
  assert.equal(wikiFolderBuildCount(), builds, 'the loaded version moved, so this did not test a kept folder');
});

test('a concept deleted between calls makes the page that describes it name a missing target', (t) => {
  const { root, knownSources } = generatedVault(t, 20);
  writeFileSync(join(root, 'capabilities/judged-later.md'), '---\nkind: capability\ntitle: Judged later\n---\n\nA concept.\n');
  writeFileSync(join(root, 'wiki/describer.md'), '---\ntitle: Describer\ndescribes:\n  - capabilities/judged-later\n---\n\n## Summary\n\nAbout it.\n');
  const { cache } = countingCache(root);
  const describer = (judged) => pageOf(judged, 'wiki/describer.md');
  assert.equal(describer(judgeLoadedWikiPages(cache.load(), knownSources)).codes.includes('describes-target-missing'), false);

  unlinkSync(join(root, 'capabilities/judged-later.md'));
  const afterDelete = describer(judgeLoadedWikiPages(cache.load(), knownSources));
  assert.ok(afterDelete.codes.includes('describes-target-missing'));
  assert.ok(afterDelete.problems.some((entry) => entry.code === 'describes-target-missing'));
});
