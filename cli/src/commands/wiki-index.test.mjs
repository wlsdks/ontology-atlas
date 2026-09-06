import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildWikiIndex, renderWikiIndex, runWikiIndex } from './wiki-index.mjs';

function page(title, sources, links = [], extra = '') {
  return [
    '---',
    `title: ${title}`,
    'created_by: agent:claude',
    'compiled_at: 2026-09-06T10:00:00Z',
    'sources:',
    ...sources.map((s) => `  - ${s}`),
    'source_hash:',
    ...sources.map((s) => `  ${s}: 3b1f0a00000000000000000000000000000000000000000000000000000000ab`),
    'status: draft',
    `summary: About ${title}.`,
    '---',
    '',
    '## Summary',
    '',
    `${title}. ${links.map((l) => `See [[${l}]].`).join(' ')}`,
    '',
    '## Facts',
    '',
    `- A fact. [[src:${sources[0]}#p1]]${extra}`,
    '',
    '## Decisions',
    '',
    '## Open questions',
    '',
    '## Not in sources',
    '',
  ].join('\n');
}

function vault() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-wiki-index-'));
  mkdirSync(join(root, 'wiki'));
  mkdirSync(join(root, 'sources'));
  writeFileSync(join(root, 'sources', 'plan.pdf'), 'x');
  writeFileSync(join(root, 'sources', 'notes.txt'), 'x');
  writeFileSync(join(root, 'wiki', '_template.md'), page('<the page name>', ['sources/<file>']));
  writeFileSync(join(root, 'wiki', 'plan.md'), page('Plan', ['sources/plan.pdf'], ['wiki/notes']));
  writeFileSync(join(root, 'wiki', 'notes.md'), page('Notes', ['sources/notes.txt']));
  return root;
}

test('the index is computed from the pages: furniture out, links both ways, problems on', () => {
  const index = buildWikiIndex(vault());
  assert.equal(index.pageCount, 2);
  assert.deepEqual(index.pages.map((p) => p.slug), ['wiki/notes', 'wiki/plan']);
  const plan = index.pages.find((p) => p.slug === 'wiki/plan');
  const notes = index.pages.find((p) => p.slug === 'wiki/notes');
  assert.deepEqual(plan.linksOut, ['wiki/notes']);
  assert.deepEqual(notes.linksIn, ['wiki/plan']);
  assert.deepEqual(plan.sources, ['sources/plan.pdf']);
  // nobody links the plan page: the folder half says so on the row
  assert.deepEqual(plan.problems, ['orphan-page']);
  assert.deepEqual(notes.problems, []);
});

test('the Markdown carries one section per page with its links, and --write leaves marked furniture', async () => {
  const root = vault();
  const md = renderWikiIndex(buildWikiIndex(root));
  assert.match(md, /^# Wiki index — 2 pages/);
  assert.match(md, /## \[\[wiki\/plan\|Plan\]\] — orphan-page/);
  assert.match(md, /linked from: \[\[wiki\/plan\]\]/);
  const cwd = process.cwd();
  const out = [];
  const write = process.stdout.write;
  process.stdout.write = (chunk) => (out.push(String(chunk)), true);
  try {
    assert.equal(await runWikiIndex([root, '--write']), 0);
  } finally {
    process.stdout.write = write;
    process.chdir(cwd);
  }
  const written = join(root, 'wiki', '_index.md');
  assert.ok(existsSync(written));
  const text = readFileSync(written, 'utf8');
  assert.match(text, /^---\ntitle: Wiki index\ngenerated_at: /);
  assert.match(text, /rerun to refresh, never edit/);
  // and the file it just wrote is not a page in its own index
  assert.equal(buildWikiIndex(root).pageCount, 2);
});
