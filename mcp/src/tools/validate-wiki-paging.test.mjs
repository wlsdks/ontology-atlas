import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { schemaErrors } from '../../../scripts/lib/output-schema-errors.mjs';
import { okResponseBytes } from '../server/rpc.mjs';
import { TOOLS_FOR_LIST } from '../server/registry.mjs';

const BUDGET = 128 * 1024;
const outputSchema = TOOLS_FOR_LIST.find((tool) => tool.name === 'validate_wiki').outputSchema;

function assertConforms(answer) {
  assert.deepEqual(schemaErrors(outputSchema, answer).slice(0, 5), [], 'validate_wiki answer must match its outputSchema');
}

/**
 * A page that fits the template. `links` are the pages it links to; a page nobody
 * links to fails only on the advisory `orphan-page`.
 */
function fitPage(title, links = [], facts = 0) {
  return [
    '---',
    `title: ${title}`,
    'created_by: human',
    'compiled_at: 2026-01-01T00:00:00Z',
    'sources: []',
    'source_hash: {}',
    'status: draft',
    `summary: ${title}.`,
    '---',
    '',
    '## Summary',
    '',
    `About ${title}. ${links.map((slug) => `[[${slug}]]`).join(' ')}`,
    '',
    '## Facts',
    '',
    // Uncited bullets: blocking, and long enough to make the page's reply heavy.
    ...Array.from({ length: facts }, (_, index) => `- Claim ${index} that names no source at all.`),
    '',
    '## Decisions',
    '',
    '## Open questions',
    '',
    '## Not in sources',
    '',
  ].join('\n');
}

const pad = (index) => String(index).padStart(4, '0');

/**
 * `fit` pages that link in a ring (no problem), `orphans` fitting pages nobody links
 * (`wiki/a-…`, advisory only), and `broken` pages (`wiki/z-…`) with `facts` uncited
 * facts each, which the ring links so they carry blocking problems only. The broken
 * pages sort after the orphans by path, so only the blocking-first order puts them first.
 */
function wikiVault({ fit = 0, orphans = 0, broken = 0, facts = 1 } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-wiki-paging-')));
  if (fit + orphans + broken === 0) return root;
  mkdirSync(join(root, 'wiki'));
  const ring = Array.from({ length: fit }, (_, index) => `wiki/m-${pad(index)}`);
  const brokenSlugs = Array.from({ length: broken }, (_, index) => `wiki/z-${pad(index)}`);
  ring.forEach((slug, index) => {
    const next = ring[(index + 1) % ring.length];
    // The first ring page also links every broken page, so none of them is an orphan.
    const links = index === 0 ? [next, ...brokenSlugs] : [next];
    writeFileSync(join(root, `${slug}.md`), fitPage(slug, links));
  });
  for (let index = 0; index < orphans; index += 1) {
    writeFileSync(join(root, `wiki/a-${pad(index)}.md`), fitPage(`orphan ${index}`, [ring[0]]));
  }
  for (const slug of brokenSlugs) writeFileSync(join(root, `${slug}.md`), fitPage(slug, [ring[0]], facts));
  return root;
}

/** Module URLs the server-shaped process loads, as `response-bounds.test.mjs` passes them. */
const modules = Object.fromEntries(['tools/validate-vault.mjs', 'server/rpc.mjs', 'library/wiki-report.mjs']
  .map((file) => [file, new URL(`../${file}`, import.meta.url).href]));

/** Runs `body` in a server-shaped process for `root`, where `validateWikiTool` and `ok` are in scope. */
function inServer(root, body) {
  const script = `
    const { validateWikiTool } = await import(${JSON.stringify(modules['tools/validate-vault.mjs'])});
    const { ok } = await import(${JSON.stringify(modules['server/rpc.mjs'])});
    const follow = (first) => {
      const replies = [validateWikiTool(first)];
      for (let guard = 0; guard < 100 && replies.at(-1).nextCall; guard += 1) {
        replies.push(validateWikiTool(replies.at(-1).nextCall.arguments));
      }
      return replies;
    };
    ${body}
  `;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { ...process.env, OATLAS_VAULT: root, OATLAS_REPO_ROOT: root },
    maxBuffer: 64 * 1024 * 1024,
  }));
}

function withVault(shape, body) {
  const root = wikiVault(shape);
  try {
    return inServer(root, body);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const listed = (replies) => replies.flatMap((reply) => reply.pages.map((page) => page.path));

test('following nextCall visits every failing page once, blocking first, and never lists a fitting page', () => {
  const { replies } = withVault({ fit: 5, orphans: 60, broken: 41 }, `
    console.log(JSON.stringify({ replies: follow({}) }));
  `);
  const paths = listed(replies);
  assert.equal(replies.length, 2);
  assert.equal(replies[0].pageCount, 106);
  assert.equal(replies[0].failingCount, 101);
  assert.equal(paths.length, 101);
  assert.equal(new Set(paths).size, 101, 'no page repeats across replies');
  assert.ok(replies.every((reply) => reply.pages.every((page) => page.ok === false)), 'fitting pages are counted, not listed');
  assert.ok(paths.slice(0, 41).every((path) => path.startsWith('wiki/z-')), 'pages with a blocking problem come first');
  assert.deepEqual(paths.slice(0, 41), [...paths.slice(0, 41)].sort());
  assert.deepEqual(paths.slice(41), [...paths.slice(41)].sort(), 'then by path');
  assert.deepEqual(replies[0].pagination, { offset: 0, limit: 100, total: 101, returned: 100, hasMore: true, nextOffset: 100 });
  assert.deepEqual(replies[0].nextCall, { tool: 'validate_wiki', arguments: { offset: 100 } });
  assert.deepEqual(replies[1].pagination, { offset: 100, limit: 100, total: 101, returned: 1, hasMore: false, nextOffset: null });
  assert.equal(replies[1].nextCall, undefined);
  const summary = replies[0].summary;
  assert.deepEqual(summary, replies[1].summary, 'the summary counts the whole folder on every reply');
  assert.equal(summary.blockingPages, 41);
  assert.equal(summary.advisoryOnlyPages, 60);
  assert.deepEqual(summary.byCode['orphan-page'].files.length, 20);
  assert.equal(summary.byCode['orphan-page'].count, 60);
  assert.equal(summary.byCode['orphan-page'].filesOmitted, 40);
  assert.equal(summary.byCode['orphan-page'].severity, 'warning');
  assert.equal(summary.byCode['uncited-fact'].severity, 'error');
  assert.equal(summary.byCode['uncited-fact'].count, 41);
  for (const reply of replies) assertConforms(reply);
});

test('exactly 100 failing pages fit one default reply', () => {
  const { replies } = withVault({ fit: 3, orphans: 100 }, `console.log(JSON.stringify({ replies: follow({}) }));`);
  assert.equal(replies.length, 1);
  assert.deepEqual(replies[0].pagination, { offset: 0, limit: 100, total: 100, returned: 100, hasMore: false, nextOffset: null });
  assert.equal(replies[0].pagesHint, undefined);
  assertConforms(replies[0]);
});

test('limit 500 pages 501 failing pages into 500 and 1, and an offset past the end returns none', () => {
  const { replies, past } = withVault({ fit: 3, orphans: 501 }, `
    console.log(JSON.stringify({ replies: follow({ limit: 500 }), past: validateWikiTool({ offset: 900 }) }));
  `);
  assert.deepEqual(replies.map((reply) => reply.pagination.returned), [500, 1]);
  assert.deepEqual(replies[0].nextCall, { tool: 'validate_wiki', arguments: { offset: 500, limit: 500 } });
  assert.equal(new Set(listed(replies)).size, 501);
  assert.deepEqual(past.pagination, { offset: 501, limit: 100, total: 501, returned: 0, hasMore: false, nextOffset: null });
  assert.deepEqual(past.pages, []);
  for (const reply of [...replies, past]) assertConforms(reply);
});

test('a default reply stops before 128 KiB, and the next calls still reach every failing page', () => {
  const { replies, explicit, sizes } = withVault({ fit: 3, broken: 40, facts: 60 }, `
    const replies = follow({});
    const explicit = validateWikiTool({ limit: 100 });
    console.log(JSON.stringify({
      replies,
      explicit: { returned: explicit.pagination.returned },
      sizes: replies.map((reply) => Buffer.byteLength(JSON.stringify(ok(reply)), 'utf8')),
    }));
  `);
  assert.ok(replies[0].pagination.returned < 40, `the first reply stopped for size (${replies[0].pagination.returned} pages)`);
  assert.ok(replies[0].pagination.returned > 0);
  assert.ok(sizes.every((bytes) => bytes <= BUDGET), `every reply ≤ 128 KiB (${sizes.join(', ')})`);
  assert.equal(sizes[0], okResponseBytes(replies[0]), 'the budget measures what ok() sends');
  assert.match(replies[0].pagesHint, /stopped before 100 pages to stay within 128 KiB/);
  assert.equal(replies[0].pagination.nextOffset, replies[0].pagination.returned, 'the next offset is where this reply stopped');
  const paths = listed(replies);
  assert.equal(paths.length, 40);
  assert.equal(new Set(paths).size, 40);
  assert.equal(explicit.returned, 40, 'an explicit limit is the caller\'s choice and is not cut for size');
  for (const reply of replies) assertConforms(reply);
});

test('an empty wiki answers with zero pages and no next call', () => {
  const { reply } = withVault({}, `console.log(JSON.stringify({ reply: validateWikiTool({}) }));`);
  assert.equal(reply.pageCount, 0);
  assert.equal(reply.failingCount, 0);
  assert.deepEqual(reply.pages, []);
  assert.deepEqual(reply.pagination, { offset: 0, limit: 100, total: 0, returned: 0, hasMore: false, nextOffset: null });
  assert.equal(reply.nextCall, undefined);
  assert.deepEqual(reply.summary, { blockingPages: 0, advisoryOnlyPages: 0, byCode: {} });
  assertConforms(reply);
});

test('named paths list every named page, fitting or not, and refuse offset and limit', () => {
  const { named, refused } = withVault({ fit: 3, orphans: 1 }, `
    const named = validateWikiTool({ paths: ['wiki/m-0000.md', 'wiki/a-0000.md', 'notes/x.md'] });
    let refused = null;
    try { validateWikiTool({ paths: ['wiki/m-0000.md'], limit: 5 }); } catch (error) { refused = error.message; }
    console.log(JSON.stringify({ named, refused }));
  `);
  assert.deepEqual(named.pages.map((page) => [page.path, page.ok]), [
    ['wiki/m-0000.md', true],
    ['wiki/a-0000.md', false],
    ['notes/x.md', false],
  ]);
  assert.equal(named.pageCount, 3);
  assert.equal(named.failingCount, 2);
  assert.equal(named.pagination, undefined);
  assert.match(refused, /pass one or the other/);
  assertConforms(named);
});

test('the summary calls exactly the Library\'s advisory codes warnings, and every other folder code an error', () => {
  const root = wikiVault({ fit: 3 });
  // Two pages written from one source that do not link each other, and one dangling link.
  for (const name of ['s-one', 's-two']) {
    writeFileSync(join(root, `wiki/${name}.md`), fitPage(name, ['wiki/m-0000', 'wiki/missing-page'])
      .replace('sources: []', 'sources: [sources/shared.md]'));
  }
  let reply;
  let library;
  try {
    // The Library's lists are read in the server-shaped process too: that module's
    // consumers are the app's, and the MCP server never loads it.
    ({ reply, library } = inServer(root, `
      const { WIKI_ADVISORY_CODES, WIKI_FOLDER_CODES } = await import(${JSON.stringify(modules['library/wiki-report.mjs'])});
      console.log(JSON.stringify({ reply: validateWikiTool({}), library: { WIKI_ADVISORY_CODES, WIKI_FOLDER_CODES } }));
    `));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  const severities = Object.fromEntries(Object.entries(reply.summary.byCode).map(([code, entry]) => [code, entry.severity]));
  assert.deepEqual(Object.keys(severities).sort(), [...library.WIKI_FOLDER_CODES].sort(), 'the fixture raises every folder code');
  for (const code of library.WIKI_FOLDER_CODES) {
    assert.equal(severities[code], library.WIKI_ADVISORY_CODES.includes(code) ? 'warning' : 'error', code);
  }
  assertConforms(reply);
});
