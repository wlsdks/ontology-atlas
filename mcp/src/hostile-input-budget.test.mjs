import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { inferImports } from './infer-imports.mjs';
import { dependencyWitnessFinding } from './meaning-findings.mjs';
import { OUTLINE_LINE_CHARS, outlineSource } from './source-outline.mjs';

const FILE_BYTES = 256 * 1024;
// Measured 2026-09-27: at most 5 ms per case; origin/main took 0.4 s to hours.
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

function assertWithinBudget(t, name, run) {
  const started = performance.now();
  run();
  const elapsed = performance.now() - started;
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

describe('oversized files are named, not read', () => {
  const OVER_TWO_MIB = 2 * 1024 * 1024 + 1;

  it('reports a JavaScript file over 2 MiB as unread source text instead of scanning it', () => {
    const repo = repoWith({ 'src/huge.js': `import z from 'HUGE-MODULE';\n`.padEnd(OVER_TWO_MIB, ' ') });
    const result = inferImports(repo);
    assert.ok(
      result.unresolved.some((row) => row.from === 'src/huge.js' && row.spec === '<source-text>'),
      'the oversized file must be reported',
    );
    assert.equal(result.externalImports.some((row) => row.spec === 'HUGE-MODULE'), false, 'the oversized file was scanned');
  });

  it('does not judge a dependency witness from a cited file over 2 MiB', () => {
    const repo = repoWith({ 'src/lib.rs': 'fn main() {}\n'.padEnd(OVER_TWO_MIB, ' '), 'src/target.rs': 'pub fn t() {}\n' });
    const findings = dependencyWitnessFinding({
      slug: 'capabilities/a',
      frontmatter: { kind: 'capability', path: 'src/lib.rs', dependencies: ['elements/target'] },
      repoRoot: repo,
      resolveTargetPath: () => 'src/target.rs',
    });
    assert.deepEqual(findings, []);
  });
});
