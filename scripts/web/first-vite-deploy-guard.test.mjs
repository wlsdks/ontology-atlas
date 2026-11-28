import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { isViteBuilt, judgeFirstViteDeploy, readAcceptedChanges } from './first-vite-deploy-guard.mjs';

const BASE = 'https://ontologyatlas.com';
const nextPage = (text) => `<html><head><title>Atlas</title><script src="/_next/static/a.js"></script></head><body><main>${text}</main></body></html>`;
const vitePage = (text) => `<html><head><title>Atlas</title><script type="module" crossorigin src="/assets/index-a1.js"></script></head><body><main>${text}</main></body></html>`;
const parkedPage = '<html><head><title>Parked</title></head><body>This domain is parked</body></html>';

/** A site folder written as the Vite build writes it: one index file per page, all listed in the sitemap. */
function makeSite(pages) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'first-vite-deploy-'));
  fs.writeFileSync(path.join(outDir, 'sitemap.xml'), Object.keys(pages).map((p) => `<url><loc>${BASE}${p}</loc></url>`).join(''));
  for (const [pathname, text] of Object.entries(pages)) {
    fs.mkdirSync(path.join(outDir, pathname), { recursive: true });
    fs.writeFileSync(path.join(outDir, pathname, 'index.html'), vitePage(text));
  }
  return outDir;
}

/** A live site: a page's HTML, `404` for a page it lacks; a page not named at all times out. */
const live = (pages) => async (url) => {
  const pathname = new URL(url).pathname;
  if (!(pathname in pages)) throw new Error('timeout');
  if (pages[pathname] === 404) return { status: 404, ok: false, text: async () => '' };
  return { status: 200, ok: true, text: async () => pages[pathname] };
};

const judge = (outDir, fetchPage, accepted = []) => judgeFirstViteDeploy({ outDir, base: BASE, accepted, log: () => {}, fetchPage });

test('proceeds when the live site is Next-built and no page changes text', async () => {
  const outDir = makeSite({ '/en/': 'Hello', '/en/guide/': 'Guide' });
  const verdict = await judge(outDir, live({ '/en/': nextPage('Hello'), '/en/guide/': nextPage('Guide') }));
  assert.deepEqual([verdict.armed, verdict.ok, verdict.changed], [true, true, []]);
});

test('a page the live site lacks proceeds only when the gate report accepted it; any other change stops', async () => {
  const outDir = makeSite({ '/en/': 'Hello', '/en/guide/': 'Guide, reworded', '/en/sample/': 'Sample' });
  const liveSite = live({ '/en/': nextPage('Hello'), '/en/guide/': nextPage('Guide'), '/en/sample/': 404 });

  const unlisted = await judge(outDir, liveSite, ['/en/sample/']);
  assert.equal(unlisted.ok, false);
  assert.deepEqual(unlisted.unlisted, [`${BASE}/en/guide/`]);

  const accepted = await judge(outDir, liveSite, ['/en/sample/', '/en/guide/']);
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.changed, [`${BASE}/en/guide/`, `${BASE}/en/sample/`]);
});

test('stops when the live site did not answer a page that is not accepted: no change was seen, so none is assumed', async () => {
  const outDir = makeSite({ '/en/': 'Hello', '/en/guide/': 'Guide' });
  const liveSite = live({ '/en/': nextPage('Hello') });
  const verdict = await judge(outDir, liveSite);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.unlisted, [`${BASE}/en/guide/`]);
  assert.equal((await judge(outDir, liveSite, ['/en/guide/'])).ok, true);
});

test('stops when the live site cannot be read at all', async () => {
  const outDir = makeSite({ '/en/': 'Hello' });
  assert.deepEqual((await judge(outDir, live({}))).ok, false);
  assert.equal((await judge(outDir, async () => ({ status: 503, ok: false, text: async () => '' }))).ok, false);
});

test('lets go only once the live site is positively Vite-built, and still reports what changed for IndexNow', async () => {
  const outDir = makeSite({ '/en/': 'Hello', '/en/guide/': 'Guide, reworded' });
  const later = await judge(outDir, live({ '/en/': vitePage('Hello'), '/en/guide/': vitePage('Guide') }));
  assert.deepEqual([later.armed, later.ok, later.changed], [false, true, [`${BASE}/en/guide/`]]);
});

test('a live page that looks like neither build stops the deploy', async () => {
  const outDir = makeSite({ '/en/': 'Hello' });
  const verdict = await judge(outDir, live({ '/en/': parkedPage }));
  assert.deepEqual([verdict.armed, verdict.ok], [true, false]);
  assert.match(verdict.reason, /neither build/);
});

test("Vite's mark is a module script under /assets/, not any script or any module", () => {
  assert.equal(isViteBuilt(vitePage('x')), true);
  assert.equal(isViteBuilt('<script src="/assets/old.js"></script>'), false);
  assert.equal(isViteBuilt('<script type="module" src="/other/app.js"></script>'), false);
  assert.equal(isViteBuilt(nextPage('x')), false);
});

test('the accepted list needs each page with the commit that changed it', () => {
  const write = (content) => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'accepted-')), 'accepted.json');
    fs.writeFileSync(file, JSON.stringify(content));
    return file;
  };
  assert.deepEqual(readAcceptedChanges(write({ pages: [{ path: '/en/sample/', commit: 'abc123' }] })), ['/en/sample/']);
  assert.throws(() => readAcceptedChanges(write({ pages: [{ path: '/en/sample/' }] })), /commit/);
  assert.throws(() => readAcceptedChanges(write({})), /list/);
});
