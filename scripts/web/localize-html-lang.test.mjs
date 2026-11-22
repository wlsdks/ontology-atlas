import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { localizeExport, readHtmlLangs } from './localize-html-lang.mjs';

test('reads every locale from the app table', () => {
  const langs = readHtmlLangs(readFileSync('src/i18n/locales.ts', 'utf8'));
  assert.deepEqual(langs, { en: 'en', ko: 'ko', ja: 'ja', zh: 'zh-Hans' });
});

test('gives each localized page its own root language and leaves English alone', () => {
  const out = mkdtempSync(join(tmpdir(), 'html-lang-'));
  const page = '<!DOCTYPE html><html lang="en" class="x"><body></body></html>';
  for (const directory of ['en/download', 'ko/download', 'zh/guide/cli']) {
    mkdirSync(join(out, directory), { recursive: true });
    writeFileSync(join(out, directory, 'index.html'), page);
  }
  assert.equal(localizeExport(out, { en: 'en', ko: 'ko', zh: 'zh-Hans' }), 2);
  assert.match(readFileSync(join(out, 'ko/download/index.html'), 'utf8'), /<html lang="ko" class="x">/);
  assert.match(readFileSync(join(out, 'zh/guide/cli/index.html'), 'utf8'), /<html lang="zh-Hans"/);
  assert.match(readFileSync(join(out, 'en/download/index.html'), 'utf8'), /<html lang="en"/);
  assert.equal(localizeExport(out, { ko: 'ko' }), 0, 'a second run changes nothing');
});
