import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { callSitesOf, declarationIndex } from './declaration-index.mjs';
import { decidesLine } from './symbol-context.mjs';

test('one very long line is judged in linear time, with the same answers as before', () => {
  const line = `x${' ? y'.repeat(62_000)}`;
  const started = performance.now();
  assert.equal(decidesLine(line), false);
  assert.ok(performance.now() - started < 500, 'a 248 KB line with no colon took seconds when the ternary match backtracked');
  assert.equal(decidesLine('const v = ready ? run() : wait();'), true);
  assert.equal(decidesLine('const v = a ? b: c ? d : e;'), true, 'a later ternary still counts');
  assert.equal(decidesLine('const v = a ? b:c;'), false, 'the colon needs spaces, as before');
  assert.equal(decidesLine('const label = "Ready?";'), false);
  assert.equal(decidesLine(`${'x'.repeat(5000)} if (late) run();`), false, 'only the head of a minified line is examined');
  assert.equal(decidesLine('\tprevSessionHeader = "X-RESTORE-SID"\n'), true, 'a served line keeps its newline, and its default still counts');
  assert.equal(decidesLine('\treturn nil, errors.New("presence not supported")\r\n'), true, 'a Go refusal decides');
});

test('call sites are found through the identifier filter, and a file that never names the symbol is skipped', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-declaration-index-'));
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'charge.ts'), 'export function charge(amount: number) {\n  return amount;\n}\n');
    writeFileSync(join(root, 'src', 'cart.ts'), "import { charge } from './charge';\nexport function checkout(total: number) {\n  if (total > 0) return charge(total);\n  return 0;\n}\n");
    writeFileSync(join(root, 'src', 'other.ts'), 'export function unrelated() {\n  return chargeback();\n}\n');
    assert.deepEqual(callSitesOf(root, 'charge'), { sites: [{ path: 'src/cart.ts', line: 3 }], total: 1 });
    assert.deepEqual(declarationIndex(root).get('checkout'), [{ path: 'src/cart.ts', line: 2, kind: 'function', name: 'checkout' }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/*
 * A class docstring's example (`>>> agg.add_batch(x)`) was once shown as the
 * caller of `add_batch`, and its window displaced the docstring's own rule.
 */
test('an example or sentence inside a Python docstring is no call site', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-declaration-docstring-'));
  try {
    writeFileSync(join(root, 'aggregator.py'), [
      'class Aggregator:',               // 1
      '    """Stitches patches.',         // 2
      '',                                 // 3
      '    Call add_batch(x) per batch.', // 4
      '    >>> agg = Aggregator()',       // 5
      '    >>> agg.add_batch(x)',         // 6
      '    """',                          // 7
      '',                                 // 8
      '    def add_batch(self, x):',      // 9
      '        return x',                 // 10
      '',                                 // 11
      'def run(agg, x):',                 // 12
      "    '''Runs add_batch(x).'''",     // 13
      '    agg.add_batch(x)',             // 14
      '',
    ].join('\n'));
    assert.deepEqual(callSitesOf(root, 'add_batch'), { sites: [{ path: 'aggregator.py', line: 14 }], total: 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/*
 * The index once held every product file's text for the life of the server:
 * 20 MB of source stayed on the heap after one symbol read. Texts are now held
 * within a character budget, so the heap left after a full index stays small.
 */
test('the index keeps declarations, not whole file texts', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-declaration-memory-'));
  try {
    mkdirSync(join(root, 'src'));
    const filler = `// ${'x'.repeat(96)}\n`.repeat(1000);
    for (let index = 0; index < 200; index += 1) {
      writeFileSync(join(root, 'src', `part${index}.ts`), `export function part${index}(value: number) {\n  if (value > ${index}) return shared(value);\n  return 0;\n}\n${filler}`);
    }
    const script = `
      const { callSitesOf, declarationIndex } = await import(${JSON.stringify(new URL('./declaration-index.mjs', import.meta.url).href)});
      const heap = () => { globalThis.gc(); globalThis.gc(); return process.memoryUsage().heapUsed; };
      const before = heap();
      declarationIndex(${JSON.stringify(root)}).get('part7');
      callSitesOf(${JSON.stringify(root)}, 'shared');
      process.stdout.write(String(heap() - before));
    `;
    const retained = Number(execFileSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', script], { encoding: 'utf8' }));
    assert.ok(retained < 12 * 1024 * 1024, `20 MB of source left ${(retained / 1048576).toFixed(1)} MB on the heap`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
