import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { judgeFirstViteDeploy } from './first-vite-deploy-guard.mjs';

const BASE = 'https://ontologyatlas.com';
const nextPage = (text) => `<html><head><title>Atlas</title><script src="/_next/static/a.js"></script></head><body><main>${text}</main></body></html>`;
const vitePage = (text) => `<html><head><title>Atlas</title><script type="module" src="/assets/index-a1.js"></script></head><body><main>${text}</main></body></html>`;

/** A site folder holding `en/` and `en/guide/`, written as the Vite build would write them. */
function makeSite(texts) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'first-vite-deploy-'));
  const pages = { '/en/': texts.home, '/en/guide/': texts.guide };
  fs.writeFileSync(path.join(outDir, 'sitemap.xml'), Object.keys(pages).map((p) => `<url><loc>${BASE}${p}</loc></url>`).join(''));
  for (const [pathname, text] of Object.entries(pages)) {
    fs.mkdirSync(path.join(outDir, pathname), { recursive: true });
    fs.writeFileSync(path.join(outDir, pathname, 'index.html'), vitePage(text));
  }
  return outDir;
}

const live = (pages) => async (url) => {
  const pathname = new URL(url).pathname;
  if (!(pathname in pages)) throw new Error('timeout');
  const body = pages[pathname];
  return { status: 200, ok: true, text: async () => body };
};

test('proceeds when the live site is Next-built and no page changes text', async () => {
  const outDir = makeSite({ home: 'Hello', guide: 'Guide' });
  const verdict = await judgeFirstViteDeploy({ outDir, base: BASE, log: () => {}, fetchPage: live({ '/en/': nextPage('Hello'), '/en/guide/': nextPage('Guide') }) });
  assert.deepEqual([verdict.armed, verdict.ok], [true, true]);
});

test('stops, naming the page, when one page would read differently', async () => {
  const outDir = makeSite({ home: 'Hello', guide: 'Guide, reworded' });
  const verdict = await judgeFirstViteDeploy({ outDir, base: BASE, log: () => {}, fetchPage: live({ '/en/': nextPage('Hello'), '/en/guide/': nextPage('Guide') }) });
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.changed, [`${BASE}/en/guide/`]);
});

test('stops when the live site did not answer a page: no change was seen, so none is assumed', async () => {
  const outDir = makeSite({ home: 'Hello', guide: 'Guide' });
  const verdict = await judgeFirstViteDeploy({ outDir, base: BASE, log: () => {}, fetchPage: live({ '/en/': nextPage('Hello') }) });
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.unanswered, [`${BASE}/en/guide/`]);
});

test('stops when the live site cannot be read at all, and lets go once the live site is Vite-built', async () => {
  const outDir = makeSite({ home: 'Hello', guide: 'Guide, reworded' });
  const unreadable = await judgeFirstViteDeploy({ outDir, base: BASE, log: () => {}, fetchPage: live({}) });
  assert.deepEqual([unreadable.armed, unreadable.ok], [true, false]);
  const refused = await judgeFirstViteDeploy({ outDir, base: BASE, log: () => {}, fetchPage: async () => ({ status: 503, ok: false, text: async () => '' }) });
  assert.equal(refused.ok, false);

  // Later deploys are ordinary: the live site is Vite's, so the changed text is the point of the deploy.
  const later = await judgeFirstViteDeploy({ outDir, base: BASE, log: () => {}, fetchPage: live({ '/en/': vitePage('Hello'), '/en/guide/': vitePage('Guide') }) });
  assert.deepEqual([later.armed, later.ok], [false, true]);
});
