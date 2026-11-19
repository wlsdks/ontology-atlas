import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { zipFile } from '../../../tests/fixtures/source-passage-cases.mjs';
import { inferImports } from '../infer-imports.mjs';
import { dependencyWitnessFinding } from '../meaning/meaning-findings.mjs';
import { OUTLINE_LINE_CHARS, outlineSource } from './source-outline.mjs';
import { readSourceText } from '../library/source-text.mjs';
import { importsOf } from './import-bindings.mjs';
import { readSourceEvidence } from './source-evidence.mjs';

const FILE_BYTES = 256 * 1024;
// Cases take at most 5 ms each; the budget leaves wide headroom.
const BUDGET_MS = 200;
const scratchRoots = [];

after(() => {
  for (const root of scratchRoots) rmSync(root, { recursive: true, force: true });
});

function repoWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-hostile-'));
  scratchRoots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function linesOf(line) {
  return Array.from({ length: Math.floor(FILE_BYTES / (line.length + 1)) }, () => line).join('\n');
}

function fastestRunMs(run) {
  let fastest = Infinity;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const started = performance.now();
    run();
    fastest = Math.min(fastest, performance.now() - started);
    if (fastest < BUDGET_MS || fastest > BUDGET_MS * 10) break;
  }
  return fastest;
}

function assertWithinBudget(t, name, run) {
  const elapsed = fastestRunMs(run);
  t.diagnostic(`${name}: ${elapsed.toFixed(1)} ms`);
  assert.ok(elapsed < BUDGET_MS, `${name} took ${elapsed.toFixed(0)} ms, over the ${BUDGET_MS} ms budget`);
}

describe('hostile source text costs time linear in its size', () => {
  it('outlines a 256 KiB file of each hostile shape within the budget', (t) => {
    const spaces = ' '.repeat(OUTLINE_LINE_CHARS - 16);
    const cases = [
      ['Java lines ending in ;{', 'Evil.java', linesOf(`${'a(b) '.repeat(199)};{`)],
      ['TypeScript class lines with a space run', 'evil.ts', `class A {\n${linesOf(`  static${spaces}x) {`)}`],
      ['one 256 KiB Java line', 'Evil.java', 'a(b) '.repeat(FILE_BYTES / 5)],
      ['Rust impl lines with a space run', 'evil.rs', linesOf(`impl x${spaces}y`)],
    ];
    for (const [name, path, text] of cases) assertWithinBudget(t, name, () => outlineSource(text, path));
  });

  it('infers imports from a 256 KiB file of each hostile shape within the budget', (t) => {
    const cases = [
      ['export keyword lines', linesOf('export a')],
      ['import keyword lines', linesOf('import a')],
      ['import then a space run', `import${' '.repeat(FILE_BYTES / 2)}${'a'.repeat(FILE_BYTES / 2 - 6)}`],
    ];
    for (const [name, text] of cases) {
      const repo = repoWith({ 'src/evil.js': text });
      assertWithinBudget(t, name, () => inferImports(repo));
    }
  });

  it('judges a dependency witness in a 256 KiB file of each hostile shape within the budget', (t) => {
    const cases = [
      ['use keyword lines', linesOf('use a')],
      ['blank lines', '\n'.repeat(FILE_BYTES)],
      ['use then a space run', `use a${' '.repeat(FILE_BYTES - 7)}b\n`],
      ['require then a space run', `require${' '.repeat(FILE_BYTES - 8)}x`],
      ['unclosed Go import blocks', linesOf('import (')],
      ['a relation note of one long punctuation token', 'use target;\n'],
    ];
    for (const [name, text] of cases) {
      const repo = repoWith({ 'src/lib.rs': text, 'src/target.rs': 'pub fn t() {}\n' });
      const note = name.startsWith('a relation note') ? `${')'.repeat(FILE_BYTES / 4)}x src/other.rs` : 'src/lib.rs imports it';
      assertWithinBudget(t, name, () => dependencyWitnessFinding({
        slug: 'capabilities/a',
        frontmatter: {
          kind: 'capability',
          path: 'src/lib.rs',
          dependencies: ['elements/target'],
          relation_notes: { 'elements/target': note },
        },
        repoRoot: repo,
        resolveTargetPath: () => 'src/target.rs',
      }));
    }
  });
});

/*
 * A symbol read resolves callees one call deeper, looks up the classes a method
 * inherits, the qualifier before each call, docstrings around call sites and
 * the named constants a file declares. Each scan is one pass per line.
 */
describe('a symbol read over hostile source stays within the budget', () => {
  it('reads a symbol whose callee and caller files are 256 KiB of each hostile shape', (t) => {
    const helperBody = (line) => linesOf(line);
    const cases = [
      ['Python docstring quotes', 'evil.py', `def target(x):\n    return helper(x)\n\ndef helper(x):\n${helperBody(`    target(x) ${'"""'.repeat(60)} ${"'''".repeat(60)}`)}\n`],
      ['Python bases chain', 'evil.py', `class A(${'B'.repeat(250)}):\n    def target(self):\n        return self.helper()\n\n    def helper(self):\n${helperBody(`        if self.${'a.'.repeat(150)}target(): return self.x.helper()`)}\n`],
      ['Go constant block lines', 'evil.go', `package x\n\nfunc target() {\n\thelper()\n}\n\nfunc helper() {\n\tif ok(${'a, '.repeat(100)}) { return }\n}\n\nconst (\n${linesOf(`\t${'a '.repeat(195)}= `)}\n)\n`],
      ['TypeScript dotted calls', 'evil.ts', `export function target() {\n  return helper();\n}\n\nexport function helper() {\n${helperBody(`  if (${'this.a.'.repeat(40)}target(${'('.repeat(20)}) ?? x) throw y;`)}\n}\n`],
    ];
    for (const [name, path, text] of cases) {
      const root = repoWith({ [path]: text.slice(0, FILE_BYTES), [`caller${path.slice(path.indexOf('.'))}`]: text.slice(0, FILE_BYTES) });
      assertWithinBudget(t, name, () => {
        const [row] = readSourceEvidence(root, [{ path, symbol: 'target' }]).rows;
        assert.notEqual(row.status, 'refused');
      });
    }
  });
});

/*
 * A callee's text was once scanned for calls with a pattern that restarted at
 * every character of a long identifier: one 250 KB line in a callee took 40 s.
 * Calls are found one identifier at a time, a line over 2,000 characters is not
 * scanned, and a file's import lines are read with the same caps.
 */
describe('a symbol read over a hostile callee or import block stays within the budget', () => {
  const entry = (imports) => `${imports}\nexport function entry(x) {\n  if (x) return helper(x);\n  return 0;\n}\n`;
  const helper = (lines) => `export function helper(x) {\n${lines}  if (x) throw new Error('no');\n  return inner(x);\n}\nexport function inner(x) {\n  if (x) return 1;\n  return 2;\n}\n`;
  const spaces = ' '.repeat(1990);
  const cases = [
    ['a callee line of 250 KB of word characters', { 'src/entry.ts': entry("import { helper } from './helper';"), 'src/helper.ts': helper(`  ${'a'.repeat(250 * 1024)}\n`) }],
    ['200 callee lines of 1,900 word characters', { 'src/entry.ts': entry("import { helper } from './helper';"), 'src/helper.ts': helper(`  ${'a'.repeat(1900)}(\n`.repeat(200)) }],
    ['200 callee condition lines of 1,900 word characters', { 'src/entry.ts': entry("import { helper } from './helper';"), 'src/helper.ts': helper(`  if (${'a'.repeat(1900)}) x;\n`.repeat(200)) }],
    ['import lines that never name a module', { 'src/entry.ts': entry(linesOf(`import {${spaces}a`)), 'src/helper.ts': helper('') }],
    ['import lines of space runs between names', { 'src/entry.ts': entry(linesOf(`import { a${spaces.slice(0, 900)}as${spaces.slice(0, 900)}b`)), 'src/helper.ts': helper('') }],
  ];
  const python = [
    ['an unclosed Python import list of space runs', `from pkg import (\n${linesOf(`    a${spaces.slice(0, 900)}as${spaces.slice(0, 900)}b,`)}`],
    ['Python import lines of dotted names', linesOf(`from ${'a.'.repeat(990)} x`)],
  ];
  const rust = [
    ['Rust use lines that never end', linesOf(`use a${spaces.slice(0, 900)}::${spaces.slice(0, 900)}b`)],
  ];
  it('reads a symbol whose callee or own imports are 256 KiB of each hostile shape', (t) => {
    for (const [name, files] of cases) {
      const root = repoWith(Object.fromEntries(Object.entries(files).map(([path, text]) => [path, text.slice(0, FILE_BYTES * 2)])));
      assertWithinBudget(t, name, () => {
        const [row] = readSourceEvidence(root, [{ path: 'src/entry.ts', symbol: 'entry' }]).rows;
        assert.equal(row.status, 'read');
      });
    }
    for (const [name, imports] of python) {
      const root = repoWith({ 'pkg/entry.py': `${imports.slice(0, FILE_BYTES)}\n\n\ndef entry(x):\n    if x:\n        return helper(x)\n    return 0\n`, 'pkg/helper.py': 'def helper(x):\n    return x\n' });
      assertWithinBudget(t, name, () => {
        const [row] = readSourceEvidence(root, [{ path: 'pkg/entry.py', symbol: 'entry' }]).rows;
        assert.equal(row.status, 'read');
      });
    }
    for (const [name, imports] of rust) {
      const root = repoWith({ 'src/lib.rs': `${imports.slice(0, FILE_BYTES)};\n\npub fn entry(x: u8) -> u8 {\n    if x > 1 { return helper(x); }\n    0\n}\n`, 'src/helper.rs': 'pub fn helper(x: u8) -> u8 {\n    x\n}\n' });
      assertWithinBudget(t, name, () => {
        const [row] = readSourceEvidence(root, [{ path: 'src/lib.rs', symbol: 'entry' }]).rows;
        assert.equal(row.status, 'read');
      });
    }
  });
});

/*
 * The import rule once checked every declaration of a name against every
 * import of the file: one name imported 78,000 times and declared in 1,500
 * modules took 23 s per read, and one 76 KB Rust `use` held 456 MB. Imports
 * are now deduplicated and capped per file and per name, matched by set
 * lookups, and a name declared in more than 64 places is not followed.
 */
describe('the import rule costs time and memory linear in the imports', () => {
  const wrapped = (unit, bytes, indent = '    ') => {
    const line = `${indent}${unit.repeat(Math.floor(1900 / unit.length))}\n`;
    return line.repeat(Math.floor(bytes / line.length));
  };
  const pythonRepo = (importBytes, modules) => {
    const imports = Array.from({ length: 3 }, (_, at) => `from pkg${at}.missing import (\n${wrapped('x, ', importBytes)})\n`).join('');
    const files = { 'src/entry.py': `${imports}\n\nclass Service:\n    def entry(self, v):\n        if v:\n            return x(v) + self.store.x(v)\n        return 0\n` };
    for (let at = 0; at < modules; at += 1) files[`lib/m${at}/mod.py`] = 'def x(v):\n    if v:\n        return 1\n    return 0\n\n\nclass Store:\n    def x(self, v):\n        return v\n';
    return repoWith(files);
  };
  const read = (root, path, symbol) => () => {
    const [row] = readSourceEvidence(root, [{ path, symbol }]).rows;
    assert.equal(row.status, 'read');
  };

  it('reads past each hostile import shape within the budget', (t) => {
    const cases = [
      ['one name imported 78,000 times, declared in 400 modules', pythonRepo(78 * 1024, 400), 'src/entry.py', 'Service.entry'],
      ['a Rust use of a 13,000-segment prefix and 19,000 items', repoWith({
        'src/lib.rs': `use ${wrapped('a::', 38 * 1024, '').trimEnd()}\n{\n${wrapped('b,', 38 * 1024, '')}};\n\npub fn entry(v: u32) -> u32 {\n    if v > 1 { return b(v); }\n    0\n}\n`,
        'src/a/b.rs': 'pub fn b(v: u32) -> u32 {\n    v\n}\n',
      }), 'src/lib.rs', 'entry'],
      ['250 KB of Python `from` lines of dots', repoWith({
        'src/entry.py': `${`from ${'.'.repeat(1990)}\n`.repeat(125)}\ndef entry(v):\n    if v:\n        return helper(v)\n    return 0\n\ndef helper(v):\n    return v\n`,
      }), 'src/entry.py', 'entry'],
    ];
    for (const [name, root, path, symbol] of cases) assertWithinBudget(t, name, read(root, path, symbol));
  });

  it('holds at most 256 modules and 1,024 names for one file', () => {
    const lines = [`from pkg.missing import (\n${wrapped('x, ', 64 * 1024)})`];
    for (let at = 0; at < 2000; at += 100) lines.push(`from pkg import ${Array.from({ length: 100 }, (_, n) => `n${at + n}`).join(', ')}`);
    const bindings = importsOf({ path: 'src/entry.py', lines: lines.join('\n').split('\n').map((line) => `${line}\n`) });
    assert.equal(bindings.specs.length, 256);
    assert.equal(bindings.names.size, 1024);
    assert.equal(bindings.names.get('x').length, 1, 'a name imported thousands of times from one module is one binding');
  });

  it('doubling the imports and the modules declaring the name about doubles the time', (t) => {
    const small = pythonRepo(20 * 1024, 300);
    const large = pythonRepo(40 * 1024, 600);
    const smallMs = fastestRunMs(read(small, 'src/entry.py', 'Service.entry'));
    const largeMs = fastestRunMs(read(large, 'src/entry.py', 'Service.entry'));
    t.diagnostic(`${smallMs.toFixed(1)} ms -> ${largeMs.toFixed(1)} ms`);
    assert.ok(largeMs < smallMs * 3 + 20, `doubled input took ${largeMs.toFixed(0)} ms against ${smallMs.toFixed(0)} ms`);
  });
});

describe('hostile document sources cost time linear in their size', () => {
  const workbook = { name: 'xl/workbook.xml', text: '<sheet name="a" r:id="r1"/>' };
  const zipped = (...entries) => Buffer.from(zipFile(entries));

  it('reads a 256 KiB source of each hostile shape within the budget', (t) => {
    const cases = [
      ['DOCX of unclosed paragraphs', 'sources/a.docx', zipped({ name: 'word/document.xml', text: '<w:p>'.repeat(FILE_BYTES / 5) })],
      ['XLSX of unclosed shared strings', 'sources/a.xlsx', zipped(workbook, { name: 'xl/sharedStrings.xml', text: '<si>'.repeat(FILE_BYTES / 4) })],
      ['XLSX of unclosed rows', 'sources/a.xlsx', zipped(workbook, { name: 'xl/worksheets/sheet1.xml', text: '<row r="1">'.repeat(FILE_BYTES / 11) })],
      ['XLSX of unclosed cells', 'sources/a.xlsx', zipped(workbook, { name: 'xl/worksheets/sheet1.xml', text: `<row r="1">${'<c r="A1">'.repeat(FILE_BYTES / 10)}</row>` })],
      ['HTML of unclosed scripts', 'sources/a.html', Buffer.from('<script'.repeat(FILE_BYTES / 7))],
      ['HTML of bare angle brackets', 'sources/a.html', Buffer.from('<'.repeat(FILE_BYTES))],
    ];
    for (const [name, path, bytes] of cases) assertWithinBudget(t, name, () => readSourceText(bytes, path));
  });

  it('refuses a workbook that names one large sheet many times instead of unpacking it again', () => {
    const bytes = zipped(
      { name: 'xl/workbook.xml', text: '<sheet name="a" r:id="r1"/>'.repeat(20) },
      { name: 'xl/_rels/workbook.xml.rels', text: '<Relationship Id="r1" Target="worksheets/sheet1.xml"/>' },
      { name: 'xl/worksheets/sheet1.xml', text: ' '.repeat(8 * 1024 * 1024) },
    );
    assert.throws(() => readSourceText(bytes, 'sources/a.xlsx'), /past \d+ unpacked bytes/);
  });

  it('refuses a workbook whose sheets share one entry\'s data instead of unpacking it once per name', () => {
    const bytes = zipped(
      { name: 'xl/workbook.xml', text: '<sheet name="a" r:id="r1"/><sheet name="b" r:id="r2"/><sheet name="c" r:id="r3"/>' },
      { name: 'xl/worksheets/sheet1.xml', text: '<row r="1"></row>'.repeat(4096), store: true },
      { name: 'xl/worksheets/sheet2.xml', aliasOf: 'xl/worksheets/sheet1.xml' },
      { name: 'xl/worksheets/sheet3.xml', aliasOf: 'xl/worksheets/sheet1.xml' },
    );
    assert.throws(() => readSourceText(bytes, 'sources/a.xlsx'), /overlaps an entry already read/);
  });
});

describe('oversized files are named, not read', () => {
  const OVER_TWO_MIB = 2 * 1024 * 1024 + 1;

  it('reports a JavaScript file over 2 MiB as unread source text instead of scanning it', () => {
    const repo = repoWith({ 'src/huge.js': `import z from 'HUGE-MODULE';\n`.padEnd(OVER_TWO_MIB, ' ') });
    const result = inferImports(repo);
    assert.ok(
      result.unresolved.some((row) => row.from === 'src/huge.js' && row.spec === '<source-text>' && row.reason === 'file-too-large'),
      'the oversized file must be reported',
    );
    assert.equal(result.externalImports.some((row) => row.spec === 'HUGE-MODULE'), false, 'the oversized file was scanned');
  });

  it('says a dependency is not judged when its cited file is over 2 MiB', () => {
    const repo = repoWith({ 'src/lib.rs': 'fn main() {}\n'.padEnd(OVER_TWO_MIB, ' '), 'src/target.rs': 'pub fn t() {}\n' });
    const findings = dependencyWitnessFinding({
      slug: 'capabilities/a',
      frontmatter: { kind: 'capability', path: 'src/lib.rs', dependencies: ['elements/target'] },
      repoRoot: repo,
      resolveTargetPath: () => 'src/target.rs',
    });
    assert.deepEqual(findings.map((finding) => finding.code), ['dependency-unjudged']);
    assert.match(findings[0].message, /src\/lib\.rs/);
  });
});
