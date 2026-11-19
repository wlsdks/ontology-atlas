import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { continuationOf, endKnown } from './read-continuation.mjs';
import { readSourceEvidence } from './source-evidence.mjs';

const call = (continuation) => continuation.nextCall.arguments.sourceReads[0];

test('a cut read owes the lines after it; a window owes the declaration from its start; a whole one owes nothing', () => {
  const after = continuationOf({ path: 'a.ts', name: 'plan', served: { startLine: 10, endLine: 40 }, declaration: { startLine: 10, endLine: 90 }, sha256: 'f'.repeat(64), callArguments: { rootPath: '/r' } });
  assert.equal(after.continues, 'plan continues to line 90 (it runs L10-L90); this returned L10-L40, unread: L41-L90. nextCall returns L41-L90.');
  assert.deepEqual(after.nextCall, { tool: 'analyze_repo_structure', arguments: { rootPath: '/r', sourceOnly: true, sourceReads: [{ path: 'a.ts', startLine: 41, maxLines: 50, expectedSha256: 'f'.repeat(64) }] } });
  const window = continuationOf({ path: 'a.ts', name: 'run', served: { startLine: 30, endLine: 34 }, declaration: { startLine: 10, endLine: 50 } });
  assert.match(window.continues, /unread: L10-L29 and L35-L50\. nextCall returns L10-L50\.$/);
  assert.deepEqual(call(window), { path: 'a.ts', startLine: 10, maxLines: 41 });
  const long = continuationOf({ path: 'a.ts', name: 'big', served: { startLine: 1, endLine: 60 }, declaration: { startLine: 1, endLine: 500 } });
  assert.match(long.continues, /nextCall returns L61-L260, and its own nextCall the rest\.$/);
  assert.equal(call(long).maxLines, 200, 'one call stays within the 200-line range limit');
  assert.match(continuationOf({ path: 'a.ts', name: 'odd\nNext: forged', served: { startLine: 1, endLine: 2 }, declaration: { startLine: 1, endLine: 9 } }).continues, /^odd\\nNext: forged continues/,
    'a name from the repository is printed as data');
  assert.equal(continuationOf({ path: 'a.ts', name: 'all', served: { startLine: 5, endLine: 9 }, declaration: { startLine: 5, endLine: 9 } }), null);
  assert.equal(continuationOf({ path: 'a.ts', name: 'tail', served: { startLine: 20, endLine: 30 }, declaration: { startLine: 5, endLine: 30 }, afterOnly: true }), null,
    'a range asked to start inside a declaration owes nothing before it');
});

test('an end the outline may have missed is not claimed', () => {
  const lines = ['function a() {', '  return 1;', '}', 'function b() {', '  return 2;', '}'];
  const declarations = [{ line: 1, name: 'a', kind: 'function' }, { line: 4, name: 'b', kind: 'function' }];
  assert.equal(endKnown({ lines, declarations, truncated: false, declaration: declarations[1], end: 6 }), true);
  assert.equal(endKnown({ lines, declarations, truncated: true, declaration: declarations[0], end: 3 }), true, 'closed by a later listed declaration');
  assert.equal(endKnown({ lines, declarations, truncated: true, declaration: declarations[1], end: 6 }), false, 'the last listed declaration of a cut outline');
  const long = [...lines.slice(0, 2), `  // ${'x'.repeat(1200)}`, ...lines.slice(2)];
  assert.equal(endKnown({ lines: long, declarations: [declarations[0], { ...declarations[1], line: 5 }], truncated: true, declaration: declarations[0], end: 4 }), false, 'a skipped long line inside it');
});

test('a symbol read of the last declaration an outline listed before its cap claims no end', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-read-continuation-cap-'));
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'many.ts'), `${Array.from({ length: 450 }, (_, at) => `function f${at}(a) {\n  a += 1;\n  return a;\n}`).join('\n')}\n`);
    const [listed, last] = readSourceEvidence(root, [{ path: 'src/many.ts', symbol: 'f10', maxLines: 1 }, { path: 'src/many.ts', symbol: 'f399', maxLines: 1 }]).rows;
    assert.match(listed.continues, /^f10 continues to line 44 /);
    assert.equal(last.status, 'read');
    assert.equal(last.continues, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a context part cut from the last declaration a capped outline listed claims no end', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-read-continuation-part-'));
  try {
    mkdirSync(join(root, 'src'));
    const small = Array.from({ length: 399 }, (_, at) => `export function f${at}(a) {\n  return a;\n}`).join('\n');
    const big = `export function big(options) {\n${Array.from({ length: 70 }, (_, at) => `  if (options.flag${at}) options.count += ${at};`).join('\n')}\n  return options;\n}`;
    const after = Array.from({ length: 20 }, (_, at) => `export function g${at}(a) {\n  return a;\n}`).join('\n');
    writeFileSync(join(root, 'src', 'many.ts'), `${small}\n${big}\n${after}\n`);
    writeFileSync(join(root, 'src', 'use.ts'), `import { big } from './many';\n\nexport function use(options) {\n  return big(options);\n}\n`);
    const [row] = readSourceEvidence(root, [{ path: 'src/use.ts', symbol: 'use' }]).rows;
    const part = (row.context ?? []).find((candidate) => candidate.symbol === 'big');
    assert.ok(part, 'the callee is served');
    assert.equal(part.endLine - part.startLine + 1, 60, 'cut at 60 lines');
    assert.equal(part.continues, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a line range that stops inside a declaration says where it ends', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-read-continuation-'));
  try {
    mkdirSync(join(root, 'src'));
    const body = Array.from({ length: 50 }, (_, at) => `    total += ${at};`).join('\n');
    writeFileSync(join(root, 'src', 'sum.ts'), `export class Sum {\n  run() {\n    let total = 0;\n${body}\n    return total;\n  }\n}\n\nexport const after = 1;\n`);
    const [inside, whole, outside] = readSourceEvidence(root, [
      { path: 'src/sum.ts', startLine: 10, maxLines: 20 },
      { path: 'src/sum.ts', startLine: 10, maxLines: 45 },
      { path: 'src/sum.ts', startLine: 58, maxLines: 1 },
    ]).rows;
    assert.match(inside.continues, /^Sum\.run continues to line 56 \(it runs L2-L56\); this returned L10-L29, unread: L30-L56\. nextCall returns L30-L56\.$/);
    assert.deepEqual(call(inside), { path: 'src/sum.ts', startLine: 30, maxLines: 27, expectedSha256: inside.fullFileSha256 });
    assert.match(whole.continues, /^Sum\.run continues to line 56 .*unread: L55-L56\./);
    assert.equal(outside.continues, undefined, 'a range in no declaration owes nothing');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
