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
});

test('call sites are found through the identifier filter, and a file that never names the symbol is skipped', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-declaration-index-'));
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'charge.ts'), 'export function charge(amount: number) {\n  return amount;\n}\n');
    writeFileSync(join(root, 'src', 'cart.ts'), "import { charge } from './charge';\nexport function checkout(total: number) {\n  if (total > 0) return charge(total);\n  return 0;\n}\n");
    writeFileSync(join(root, 'src', 'other.ts'), 'export function unrelated() {\n  return chargeback();\n}\n');
    assert.deepEqual(callSitesOf(root, 'charge'), { sites: [{ path: 'src/cart.ts', line: 3 }], total: 1 });
    assert.deepEqual(declarationIndex(root).get('checkout'), [{ path: 'src/cart.ts', line: 2, kind: 'function' }]);
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
