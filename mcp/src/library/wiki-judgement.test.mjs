import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { WIKI_PAGE_NODES, generatedWikiFolder } from '../../../tests/fixtures/wiki-page-cases.mjs';
import { createVaultDocCache } from '../vault/documents.mjs';
import { judgeLoadedWikiPages } from './wiki-judgement.mjs';
import { buildWikiNodeIndex, isWikiFurnitureSlug, validateWikiFolder, validateWikiPage } from './wiki-schema.mjs';

/** The generated folder on disk, with the concepts its `describes:` entries name and the template. */
function generatedVault(count) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-wiki-judgement-')));
  const folder = generatedWikiFolder(count);
  const write = (relative, text) => {
    mkdirSync(dirname(join(root, relative)), { recursive: true });
    writeFileSync(join(root, relative), text);
  };
  for (const page of folder.pages) write(page.path, page.raw);
  for (const node of WIKI_PAGE_NODES) {
    if (node.slug.startsWith('wiki/')) continue;
    const alias = node.alias ? `slug: ${node.alias}\n` : '';
    write(`${node.slug}.md`, `---\nkind: ${node.kind}\n${alias}title: ${node.slug}\n---\n\nA concept.\n`);
  }
  write('wiki/_template.md', '---\ntitle: template\n---\n');
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

/** What `validate_wiki` judged before page facts: every page's text through both validators. */
function judgedFromText(docs, knownSources) {
  const nodes = buildWikiNodeIndex(docs.map((doc) => ({ slug: doc.slug, kind: doc.frontmatter?.kind, alias: doc.frontmatter?.slug })));
  const folderDocs = docs.filter((doc) => doc.slug.startsWith('wiki/') && !isWikiFurnitureSlug(doc.slug));
  const folder = new Map(validateWikiFolder(folderDocs.map((doc) => ({ path: `${doc.slug}.md`, raw: doc.raw, parsed: doc })))
    .map((entry) => [entry.path, entry.problems]));
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  return [...folder.keys()].sort().map((path) => {
    const doc = bySlug.get(path.slice(0, -3));
    const problems = [...validateWikiPage(doc.raw, { knownSources, nodes, parsed: doc }).problems, ...folder.get(path)];
    return { path, ok: problems.length === 0, problems };
  });
}

const shown = (judged) => judged.map((page) => ({ path: page.path, ok: page.ok, problems: page.problems }));
const distinctCodes = (problems) => [...new Set(problems.map((entry) => entry.code))].sort();

test('judging from page facts returns what judging every page text returned, page for page', (t) => {
  const { root, knownSources } = generatedVault(300);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { cache } = countingCache(root);
  const docs = cache.load();
  const judged = judgeLoadedWikiPages(docs, knownSources);
  const expected = judgedFromText(docs, knownSources);
  assert.ok(expected.length === 300 && expected.some((page) => !page.ok), 'the folder judged nothing worth comparing');
  assert.equal(JSON.stringify(shown(judged)), JSON.stringify(expected));
  for (const page of judged) {
    assert.deepEqual([...page.codes].sort(), distinctCodes(page.problems), page.path);
    assert.equal(page.blocking, page.problems.some((entry) => !['orphan-page', 'shared-source-unlinked'].includes(entry.code)), page.path);
  }
});

test('a warm repeat reads no page, a shown page is read once, and an edit reads only the edited page', (t) => {
  const { root, knownSources } = generatedVault(120);
  t.after(() => rmSync(root, { recursive: true, force: true }));
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
  const docs = cache.load();
  const afterEdit = judgeLoadedWikiPages(docs, knownSources);
  assert.deepEqual(reads, [edited, edited], 'the load pass and the facts each read the edited page once');
  const page = afterEdit.find((entry) => entry.path === 'wiki/page-7.md');
  assert.ok(page.codes.includes('dangling-wikilink'));
  assert.equal(JSON.stringify(shown(afterEdit)), JSON.stringify(judgedFromText(docs, knownSources)));
});
