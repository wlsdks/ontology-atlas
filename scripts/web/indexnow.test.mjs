import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { changedUrls, exportedFileOf, INDEXNOW_KEY, submissionOf, submit, visibleText } from './indexnow.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const page = (text, chunk) =>
  `<html><head><title>Atlas</title><meta name="description" content="A map"><script src="/_next/${chunk}.js"></script></head><body><main><h1>${text}</h1></main><script>self.__next_f.push(["${chunk}"])</script></body></html>`;

test('the key the engines fetch is served at the site root', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'public', `${INDEXNOW_KEY}.txt`), 'utf8').trim(), INDEXNOW_KEY);
});

test('visible text ignores scripts and build hashes but not words', () => {
  assert.equal(visibleText(page('Hello', 'a1')), visibleText(page('Hello', 'b2')));
  assert.notEqual(visibleText(page('Hello', 'a1')), visibleText(page('Hello again', 'a1')));
});

test('a sitemap URL maps to its exported index file', () => {
  assert.equal(exportedFileOf('https://ontologyatlas.com/ko/download/', 'out'), path.join('out', 'ko', 'download', 'index.html'));
});

test('only pages whose text changed or that are new are reported; an unreachable page is left out', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'indexnow-'));
  const urls = ['same', 'edited', 'new', 'down'].map((name) => `https://ontologyatlas.com/en/${name}/`);
  fs.writeFileSync(path.join(outDir, 'sitemap.xml'), urls.map((url) => `<url><loc>${url}</loc></url>`).join(''));
  for (const name of ['same', 'edited', 'new', 'down']) {
    fs.mkdirSync(path.join(outDir, 'en', name), { recursive: true });
    fs.writeFileSync(path.join(outDir, 'en', name, 'index.html'), page(name === 'edited' ? 'Now' : 'Then', 'new-build'));
  }
  const live = {
    same: { status: 200, text: page('Then', 'old-build') },
    edited: { status: 200, text: page('Then', 'old-build') },
    new: { status: 404, text: '' },
  };
  const fetchPage = async (url) => {
    const name = new URL(url).pathname.split('/')[2];
    if (!live[name]) throw new Error('timeout');
    return { status: live[name].status, ok: live[name].status === 200, text: async () => live[name].text };
  };
  const changed = await changedUrls({ outDir, fetchPage, log: () => {} });
  assert.deepEqual(changed, [urls[1], urls[2]]);
});

test('the submission names the host, the key and where the key lives, and nothing is posted when nothing changed', async () => {
  assert.deepEqual(submissionOf(['https://ontologyatlas.com/en/'], 'https://ontologyatlas.com'), {
    host: 'ontologyatlas.com',
    key: INDEXNOW_KEY,
    keyLocation: `https://ontologyatlas.com/${INDEXNOW_KEY}.txt`,
    urlList: ['https://ontologyatlas.com/en/'],
  });
  let posted = false;
  await submit({ urls: [], base: 'https://ontologyatlas.com', post: async () => ((posted = true), { status: 200 }) });
  assert.equal(posted, false);
});
