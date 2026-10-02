import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { ACCEPTED, checkCatalog, checkEntry, checkLocale } from './check-translation-coverage.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixtureRoot(catalogs) {
  const root = mkdtempSync(path.join(tmpdir(), 'coverage-'));
  roots.push(root);
  for (const [locale, namespaces] of Object.entries(catalogs)) {
    mkdirSync(path.join(root, 'messages', locale), { recursive: true });
    for (const [namespace, value] of Object.entries(namespaces)) {
      writeFileSync(path.join(root, 'messages', locale, `${namespace}.json`), `${JSON.stringify(value, null, 2)}\n`);
    }
  }
  return root;
}

const rules = (result) => result.errors.map((error) => error.rule).sort();

describe('a four-locale catalog', () => {
  const base = {
    en: { Menu: { open: 'Open {count} files with MCP', plural: '{n, plural, one {# file} other {# files}}' } },
    ko: { Menu: { open: 'MCP로 파일 {count}개 열기', plural: '{n, plural, other {#개}}' } },
    ja: { Menu: { open: 'MCP接続で{count}件を開く', plural: '{n, plural, other {#件}}' } },
    zh: { Menu: { open: '用 MCP 打开 {count} 个文件', plural: '{n, plural, other {# 个文件}}' } },
  };

  it('passes for every locale', () => {
    const root = fixtureRoot(base);
    for (const locale of ['en', 'ko', 'ja', 'zh']) {
      const result = checkLocale(locale, { root });
      assert.deepEqual(result.errors, [], locale);
      assert.equal(result.checked, 2);
    }
  });

  it('turns exactly the matching rule red for each defect', () => {
    const defects = [
      ['ja', 'open', 'MCP接続で件を開く', ['arguments']],
      ['ja', 'open', '接続で{count}件を開く', ['keep-terms']],
      ['ja', 'open', 'MCP 接続で{count}件を開く', ['typography']],
      ['ja', 'plural', '{n, plural, one {#件} other {#件}}', ['plural']],
      ['zh', 'open', '用 MCP 打开 {count} 个文件 열기', ['script']],
      ['zh', 'open', '用MCP打开{count}个文件', ['typography']],
      ['zh', 'open', 'Open {count} files with MCP', ['residue']],
    ];
    for (const [locale, key, text, expected] of defects) {
      const root = fixtureRoot({ ...base, [locale]: { Menu: { ...base[locale].Menu, [key]: text } } });
      assert.deepEqual(rules(checkLocale(locale, { root, accepted: {} })), expected, `${locale} ${text}`);
    }
  });

  it('reports a missing and an unknown key', () => {
    const root = fixtureRoot({ ...base, ja: { Menu: { open: base.ja.Menu.open, extra: 'x' } } });
    assert.deepEqual(rules(checkLocale('ja', { root })), ['keys', 'keys']);
  });

  it('restricts the run to the named namespaces', () => {
    const root = fixtureRoot({
      ...base,
      en: { ...base.en, Other: { a: 'Hello' } },
      ja: { ...base.ja, Other: { a: 'Hello' } },
    });
    assert.deepEqual(rules(checkLocale('ja', { root, namespaces: ['Menu'] })), []);
    assert.deepEqual(rules(checkLocale('ja', { root })), ['residue']);
  });

  it('warns on a length outlier without failing', () => {
    const catalogs = {
      en: { Menu: { a: 'Open' } },
      ko: { Menu: { a: '열기' } },
      ja: { Menu: { a: '開くとても長い文字列' } },
      zh: { Menu: { a: '打开这个很长的文字' } },
    };
    const root = fixtureRoot(catalogs);
    for (const locale of ['ja', 'zh']) {
      const result = checkLocale(locale, { root });
      assert.deepEqual(result.errors, [], locale);
      assert.deepEqual(result.warnings.map((warning) => warning.rule), ['length'], locale);
    }
  });
});

describe('checkEntry', () => {
  it('fails a locale that has no script column', () => {
    assert.deepEqual(rules(checkEntry({ locale: 'fr', key: 'a.b', text: 'Ouvrir' })), ['script']);
  });

  it('reports invalid ICU instead of crashing', () => {
    assert.deepEqual(rules(checkEntry({ locale: 'ja', key: 'a.b', text: '{open' })), ['arguments']);
  });

  it('lets a residue check ignore code, links, numbers, paths and keep-terms', () => {
    const text = '`mcp serve` https://example.com/docs Git v2 ./a/b.json Claude Code';
    assert.deepEqual(checkEntry({ locale: 'ja', key: 'a.b', text, reference: text }).errors, []);
    const english = checkEntry({ locale: 'ja', key: 'a.b', text: 'Open the folder', reference: 'Open the folder' });
    assert.deepEqual(rules(english), ['residue']);
  });

  it('does not apply residue to a language name', () => {
    assert.deepEqual(checkEntry({ locale: 'ja', key: 'locale.english', text: 'English', reference: 'English' }).errors, []);
  });

  it('honours an accepted entry', () => {
    const accepted = { residue: { 'a.b': 'reason' } };
    const call = (table) =>
      checkEntry({ locale: 'ja', key: 'a.b', text: 'Open folder', reference: 'Open folder', accepted: table });
    assert.deepEqual(rules(call({})), ['residue']);
    assert.deepEqual(call(accepted).errors, []);
  });
});

describe('the shipped catalog', () => {
  it('has no errors in en or ko', () => {
    for (const locale of ['en', 'ko']) assert.deepEqual(checkLocale(locale).errors, [], locale);
  });

  it('needs every accepted entry', () => {
    for (const locale of ['ko']) {
      const found = new Set(checkLocale(locale, { accepted: {} }).errors.map((error) => `${error.rule}:${error.key}`));
      const listed = Object.entries({ ...ACCEPTED['*'], ...ACCEPTED[locale] }).flatMap(([rule, keys]) =>
        Object.keys(keys).map((key) => `${rule}:${key}`),
      );
      assert.deepEqual(listed.filter((entry) => !found.has(entry)), [], 'an accepted entry no longer needed');
    }
  });

  it('gives every accepted entry a reason', () => {
    for (const table of Object.values(ACCEPTED)) {
      for (const keys of Object.values(table)) {
        for (const reason of Object.values(keys)) assert.ok(reason.length > 10);
      }
    }
  });

  it('checkCatalog accepts an injected list of entries', () => {
    const result = checkCatalog({
      locale: 'zh',
      entries: [['a', '打开']],
      referenceEntries: [['a', 'Open'], ['b', 'Close']],
    });
    assert.deepEqual(rules(result), ['keys']);
  });
});
