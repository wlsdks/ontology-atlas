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
const modules = Object.fromEntries(['tools/validate-vault.mjs', 'server/rpc.mjs']
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

test('following nextCall visits every failing page once, by path, and never lists a fitting page', () => {
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
  assert.deepEqual(paths, [...paths].sort(), 'the walk goes by path alone');
  const pages = replies.flatMap((reply) => reply.pages);
  assert.ok(pages.every((page) => page.blocking === page.path.startsWith('wiki/z-')), 'each page says whether it is blocking');
  assert.deepEqual(replies[0].pagination, { offset: 0, limit: 100, total: 101, returned: 100, hasMore: true, nextOffset: 100 });
  // 60 orphans (`wiki/a-…`), then the 40th broken page.
  assert.deepEqual(replies[0].nextCall, { tool: 'validate_wiki', arguments: { afterPath: 'wiki/z-0039.md' } });
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
  assert.deepEqual(replies[0].nextCall, { tool: 'validate_wiki', arguments: { afterPath: 'wiki/a-0499.md', limit: 500 } });
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
  assert.match(replies[0].pagesHint, /stopped short to stay within 128 KiB/);
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


/** Writes `wiki/<name>.md` into `root` as one more page. */
const addPage = (root, name, text) => writeFileSync(join(root, `wiki/${name}.md`), text);

const replyBytes = 'replies.map((reply) => Buffer.byteLength(JSON.stringify(ok(reply)), "utf8"))';

test('a path holding a line break is listed as the folder names it and still matches the schema', () => {
  const root = wikiVault({ fit: 3 });
  addPage(root, 'a\nb', fitPage('broken', ['wiki/m-0000'], 1));
  try {
    const { reply, named } = inServer(root, `
      const reply = validateWikiTool({});
      console.log(JSON.stringify({ reply, named: validateWikiTool({ paths: reply.pages.map((page) => page.path) }) }));
    `);
    assert.deepEqual(reply.pages.map((page) => page.path), ['wiki/a\nb.md']);
    assert.deepEqual(reply.summary.byCode['uncited-fact'].files, ['wiki/a\nb.md']);
    assert.equal(named.pages[0].ok, false, 'the listed path round-trips into `paths`');
    assertConforms(reply);
    assertConforms(named);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a page shows at most 20 problems and counts the rest, in both shapes', () => {
  const { reply, named } = withVault({ fit: 3, broken: 1, facts: 300 }, `
    console.log(JSON.stringify({ reply: validateWikiTool({}), named: validateWikiTool({ paths: ['wiki/z-0000.md'] }) }));
  `);
  for (const answer of [reply, named]) {
    assert.equal(answer.pages[0].problems.length, 20);
    assert.equal(answer.pages[0].problemsOmitted, 280);
    assertConforms(answer);
  }
  assert.equal(reply.summary.byCode['uncited-fact'].count, 1);
});

test('pages that share one source page under 128 KiB each and are all reached', () => {
  const root = wikiVault({ fit: 3 });
  const cluster = Array.from({ length: 200 }, (_, index) => `c-${pad(index)}`);
  // Each page links the ring, the first ring page links none of them: 199 unlinked partners each.
  for (const name of cluster) addPage(root, name, fitPage(name, ['wiki/m-0000']).replace('sources: []', 'sources: [sources/handbook.pdf]'));
  try {
    const { replies, sizes } = inServer(root, `
      const replies = follow({});
      console.log(JSON.stringify({ replies, sizes: ${replyBytes} }));
    `);
    assert.ok(sizes.every((bytes) => bytes <= BUDGET), `every reply ≤ 128 KiB (largest ${Math.max(...sizes)})`);
    const paths = listed(replies);
    assert.equal(new Set(paths).size, 200);
    assert.equal(paths.length, 200);
    assert.ok(replies.every((reply) => reply.pages.every((page) => page.problems.length <= 20)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a single page larger than a reply is cut to fit, so the walk never stalls', () => {
  const root = wikiVault({ fit: 3 });
  // Two pages whose primary source is a 150,000-character path: the one finding that
  // names it is larger than a whole reply on its own.
  const source = `sources/${'a'.repeat(150_000)}.pdf`;
  for (const name of ['g-one', 'g-two']) {
    addPage(root, name, fitPage(name, ['wiki/m-0000']).replace('sources: []', `sources: [${source}]`));
  }
  // A hub links both, so that oversized finding is each page's only problem.
  addPage(root, 'h-hub', fitPage('hub', ['wiki/g-one', 'wiki/g-two']));
  addPage(root, 'z-small', fitPage('small', ['wiki/m-0000'], 1));
  try {
    const { replies, sizes } = inServer(root, `
      const replies = follow({});
      console.log(JSON.stringify({ replies, sizes: ${replyBytes} }));
    `);
    assert.ok(sizes.every((bytes) => bytes <= BUDGET), `every reply ≤ 128 KiB (${sizes.join(', ')})`);
    assert.ok(replies.every((reply) => reply.pagination.returned >= 1), 'no reply comes back empty while pages remain');
    assert.deepEqual(listed(replies), ['wiki/g-one.md', 'wiki/g-two.md', 'wiki/h-hub.md', 'wiki/z-small.md']);
    const cut = replies.find((reply) => reply.pages[0].path === 'wiki/g-one.md').pages[0].problems[0];
    assert.match(cut.message, /\.\.\.\(\+\d+ chars\)$/, 'the cut is counted');
    for (const reply of replies) assertConforms(reply);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('repairing each reply\'s pages before following nextCall still reaches every failing page', () => {
  const root = wikiVault({ fit: 3, broken: 300 });
  const tool = modules['tools/validate-vault.mjs'];
  try {
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { writeFileSync } from 'node:fs';
      const { validateWikiTool } = await import(${JSON.stringify(tool)});
      const fixed = ${JSON.stringify(fitPage('fixed', ['wiki/m-0000']))};
      const seen = [];
      let reply = validateWikiTool({});
      for (let guard = 0; guard < 20; guard += 1) {
        seen.push(...reply.pages.map((page) => page.path));
        for (const page of reply.pages) writeFileSync(${JSON.stringify(root)} + '/' + page.path, fixed);
        if (!reply.nextCall) break;
        reply = validateWikiTool(reply.nextCall.arguments);
      }
      console.log(JSON.stringify({ seen, after: validateWikiTool({}).failingCount }));
    `], { encoding: 'utf8', env: { ...process.env, OATLAS_VAULT: root, OATLAS_REPO_ROOT: root } }));
    assert.equal(result.seen.length, 300);
    assert.equal(new Set(result.seen).size, 300, 'no page is skipped or repeated as earlier pages leave the list');
    assert.equal(result.after, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('afterPath and offset are one or the other, and afterPath is a page path', () => {
  const { refusals } = withVault({ fit: 3, orphans: 2 }, `
    const refusals = [];
    for (const args of [{ afterPath: 'wiki/a-0000.md', offset: 1 }, { afterPath: '' }]) {
      try { validateWikiTool(args); refusals.push(null); } catch (error) { refusals.push(error.message); }
    }
    console.log(JSON.stringify({ refusals }));
  `);
  assert.match(refusals[0], /one or the other/);
  assert.match(refusals[1], /is a page path/);
});

test('the summary samples blocking pages first, though the walk goes by path', () => {
  const root = wikiVault({ fit: 3, orphans: 25 });
  // Three pages that are orphans and also carry an uncited fact: blocking, and after `a-…` by path.
  for (let index = 0; index < 3; index += 1) addPage(root, `z-${pad(index)}`, fitPage('blocked', [], 1));
  try {
    const reply = inServer(root, `console.log(JSON.stringify(validateWikiTool({})));`);
    const files = reply.summary.byCode['orphan-page'].files;
    assert.deepEqual(files.slice(0, 3), ['wiki/z-0000.md', 'wiki/z-0001.md', 'wiki/z-0002.md']);
    assert.deepEqual(files.slice(3), [...files.slice(3)].sort());
    assert.equal(reply.pages[0].path, 'wiki/a-0000.md');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a page that turns blocking mid-walk is not skipped: deleting a listed page leaves its link dangling', () => {
  // The reviewer's sequence: the orphan `a-0010` links `z-0003`; deleting `z-0003` after it
  // is listed gives `a-0010` a dangling link. Every page failing for the whole walk is listed once.
  const root = wikiVault({ fit: 3, broken: 6 });
  addPage(root, 'a-0010', fitPage('linker', ['wiki/z-0003']));
  const tool = modules['tools/validate-vault.mjs'];
  try {
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { rmSync } from 'node:fs';
      const { validateWikiTool } = await import(${JSON.stringify(tool)});
      const seen = [];
      let reply = validateWikiTool({ limit: 2 });
      for (let guard = 0; guard < 20; guard += 1) {
        seen.push(...reply.pages.map((page) => page.path));
        if (seen.includes('wiki/z-0003.md')) rmSync(${JSON.stringify(root)} + '/wiki/z-0003.md', { force: true });
        if (!reply.nextCall) break;
        reply = validateWikiTool(reply.nextCall.arguments);
      }
      console.log(JSON.stringify({ seen, after: validateWikiTool({}).pages.map((page) => [page.path, page.blocking]) }));
    `], { encoding: 'utf8', env: { ...process.env, OATLAS_VAULT: root, OATLAS_REPO_ROOT: root } }));
    const failingThroughout = ['wiki/a-0010.md', ...[0, 1, 2, 4, 5].map((index) => `wiki/z-${pad(index)}.md`)];
    for (const path of failingThroughout) assert.equal(result.seen.filter((seen) => seen === path).length, 1, path);
    assert.ok(result.after.some(([path, blocking]) => path === 'wiki/a-0010.md' && blocking), 'the probe did turn a-0010 blocking');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('line and paragraph separators and bidi overrides in a page name never reach prose raw', () => {
  const root = wikiVault({ fit: 3 });
  const names = ['p\u2028a', 'p\u0085b', 'p\u202ec'];
  for (const name of names) addPage(root, name, fitPage(name, ['wiki/m-0000']).replace('sources: []', 'sources: [sources/one.pdf]'));
  try {
    const { replies } = inServer(root, `console.log(JSON.stringify({ replies: follow({ limit: 1 }) }));`);
    const raw = /[\u2028\u0085\u202e]/;
    const prose = replies.flatMap((reply) => [reply.pagesHint ?? '', ...reply.pages.flatMap((page) => page.problems.map((entry) => entry.message))]);
    assert.ok(prose.some((text) => text.includes('\\u2028') || text.includes('\\u{85}') || text.includes('\\u{202e}')), 'messages name the pages, escaped');
    for (const text of prose) assert.doesNotMatch(text, raw);
    assert.deepEqual(listed(replies).sort(), names.map((name) => `wiki/${name}.md`).sort(), 'exact paths still walk the folder');
    assert.ok(replies.slice(0, -1).every((reply) => raw.test(reply.nextCall.arguments.afterPath)), 'the cursor keeps the exact path');
    for (const reply of replies) assertConforms(reply);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a page too large for a reply keeps as many whole problems as fit before any is cut', () => {
  const root = wikiVault({ fit: 3 });
  const targets = Array.from({ length: 20 }, (_, index) => `wiki/${String(index).padStart(2, '0')}${'x'.repeat(4000)}`);
  addPage(root, 'b-long-links', fitPage('long', ['wiki/m-0000', ...targets]));
  try {
    const { reply, size } = inServer(root, `
      const reply = validateWikiTool({});
      console.log(JSON.stringify({ reply, size: Buffer.byteLength(JSON.stringify(ok(reply)), 'utf8') }));
    `);
    const [page] = reply.pages;
    assert.equal(reply.pagination.returned, 1);
    assert.ok(size <= BUDGET, `${size} bytes`);
    assert.ok(page.problems.length > 1, `kept ${page.problems.length} problems instead of cutting to one`);
    assert.ok(page.problemsOmitted > 0);
    assert.ok(page.problems.every((entry) => entry.detail.values.target.length > 4000), 'kept problems are whole');
    assertConforms(reply);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a source added or removed between two calls changes the citation verdict, though no page changed', () => {
  const root = wikiVault({ fit: 3 });
  const cited = fitPage('citer', ['wiki/m-0000'])
    .replace('sources: []', 'sources: [sources/later.pdf]')
    .replace('## Facts\n', '## Facts\n\n- A claim. [[src:sources/later.pdf#p1]]\n');
  addPage(root, 'b-citer', cited);
  mkdirSync(join(root, 'sources'));
  try {
    const { verdicts } = inServer(root, `
      const { unlinkSync, writeFileSync } = await import('node:fs');
      const source = ${JSON.stringify(join(root, 'sources/later.pdf'))};
      const codes = () => validateWikiTool({ paths: ['wiki/b-citer.md'] }).pages[0].problems.map((entry) => entry.code);
      const verdicts = [codes()];
      writeFileSync(source, 'the source');
      verdicts.push(codes());
      unlinkSync(source);
      verdicts.push(codes());
      console.log(JSON.stringify({ verdicts }));
    `);
    assert.deepEqual(verdicts.map((codes) => codes.includes('citation-target-missing')), [true, false, true]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
