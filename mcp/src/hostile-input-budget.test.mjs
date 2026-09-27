import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { zipFile } from '../../tests/fixtures/source-passage-cases.mjs';
import { inferImports } from './infer-imports.mjs';
import { dependencyWitnessFinding } from './meaning-findings.mjs';
import { OUTLINE_LINE_CHARS, outlineSource } from './source-outline.mjs';
import { readSourceText } from './source-text.mjs';

const FILE_BYTES = 256 * 1024;
// Measured 2026-09-27: at most 5 ms per case.
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
