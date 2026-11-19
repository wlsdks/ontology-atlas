import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { blankLiterals, importLines } from './code-text.mjs';
import { declarationIndex, declarationsByFile, productFiles } from './declaration-index.mjs';
import { importsOf } from './import-bindings.mjs';
import { outlineSource } from './source-outline.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('offsets are UTF-16 code units: an emoji, a CJK line and a surrogate pair keep every later line in place', () => {
  const text = "// \u{1F680} fast path\nconst title = '測試\u{20BB7}';\n// 日本語の行\nimport { Plugin } from './base';\nexport class Sms extends Plugin {}\n";
  const blanked = blankLiterals(text, 'src/sms.ts');
  assert.equal(blanked.code.length, text.length);
  assert.equal(blanked.uncertain, false);
  assert.deepEqual(blanked.code.split('\n').map((line) => line.length), text.split('\n').map((line) => line.length));
  assert.equal(importLines(text, blanked)[3], "import { Plugin } from './base';");
  assert.match(blanked.code.split('\n')[4], /^export class Sms extends Plugin/);
});

test('a regular expression with a quote, in code or in a template part, does not open a string', () => {
  const text = "export function quote(s: string) {\n  return `'${s.replace(/'/g, \"'\\\\''\")}'`;\n}\nexport function bare(v: string) {\n  return /[\\s\"'`]/.test(v);\n}\nexport const TEMPLATE = `\nexport class NewPlugin extends Plugin {}\n`;\nexport class Real {}\n";
  const blanked = blankLiterals(text, 'src/quote.ts');
  assert.equal(blanked.uncertain, false);
  assert.doesNotMatch(blanked.code, /NewPlugin/);
  assert.match(blanked.code, /export class Real \{\}/);
});

test('what the pass cannot read with certainty it says so', () => {
  const uncertain = (text, path = 'src/a.ts') => blankLiterals(text, path).uncertain;
  assert.equal(uncertain('const a = `open'), true, 'a template open at the end');
  assert.equal(uncertain('/* open'), true, 'a comment open at the end');
  assert.equal(uncertain('x = """open', 'a.py'), true, 'a docstring open at the end');
  assert.equal(uncertain("const a = 'no close\nconst b = 1;\n"), true, 'a quoted string that meets a line break');
  assert.equal(uncertain('const a = total / 2 + "/" + 1;\n'), true, 'a division that could be a regular expression holding a quote');
  assert.equal(uncertain(`const a = ${'`${'.repeat(12)}x${'}`'.repeat(12)};\n`), true, 'templates nested past the cap, closed or not');
  assert.equal(uncertain(`const a = ${'`${'.repeat(3)}x${'}`'.repeat(3)};\n`), false, 'templates nested within the cap');
  assert.equal(uncertain('const a = total / 2;\nconst b = `${a / 4}`;\n'), false, 'a plain division');
  assert.equal(uncertain('return <p>a</p>;\n', 'src/a.tsx'), false, 'a JSX closing tag');
});

test('a JSX closing tag is no regular expression', () => {
  const text = 'export const Hint = () => <p>a</p><b>"q"</b>;\nexport class Real {}\n';
  const { code, uncertain } = blankLiterals(text, 'src/hint.tsx');
  assert.equal(uncertain, false);
  assert.match(code, /<p>a<\/p><b>/);
});

test('the general index lists a declaration written in a string, as it always has; only the family count blanks it', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-code-text-'));
  try {
    writeFileSync(join(root, 'package.json'), '{"name":"tool"}');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'scaffold.ts'), 'export const TEMPLATE = `\nexport class SamplePlugin {}\n`;\n');
    assert.deepEqual(declarationIndex(root).get('SamplePlugin')?.map((row) => row.path), ['src/scaffold.ts']);
    const [file] = [...declarationsByFile(root)];
    assert.equal(file.declarations.some((declaration) => declaration.name === 'SamplePlugin'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the general declaration index reads the plain outline, as before the family count blanked text', () => {
  const files = productFiles(repoRoot, []);
  const expected = new Map();
  for (const file of files) {
    if (file.size > 256 * 1024) continue;
    let text = '';
    try {
      text = readFileSync(join(repoRoot, file.path), 'utf8');
    } catch {
      continue;
    }
    for (const { name, line, kind } of outlineSource(text, file.path).declarations) {
      if (kind === 'section' || kind === 'export') continue;
      for (const key of name.includes('.') ? [name, `*.${name.split('.').pop()}`] : [name]) {
        const rows = expected.get(key) ?? [];
        rows.push({ path: file.path, line, kind, name });
        expected.set(key, rows);
      }
    }
  }
  const sorted = (index) => [...index].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  assert.deepEqual(sorted(declarationIndex(repoRoot, { files })), sorted(expected));
});

test('import reading for other features keeps its 40-line statements; only the family count reads longer ones', () => {
  const names = Array.from({ length: 45 }, (_, at) => `  helper${at},`);
  const lines = ['import {', ...names, '  Plugin as DeliveryPlugin,', "} from './helpers';", ''];
  assert.equal(importsOf({ path: 'src/sms.ts', lines }).names.has('DeliveryPlugin'), false);
  assert.equal(importsOf({ path: 'src/sms.ts', lines }, { family: true }).names.has('DeliveryPlugin'), true);
});
