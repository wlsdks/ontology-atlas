import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleSpecifiers, pathTokensIn } from './source-evidence-findings.mjs';

test('module specifiers are read from JavaScript, Python, Go, Rust and C imports', () => {
  assert.deepEqual(moduleSpecifiers("import { a } from './a.js';\nimport './side-effect';\nconst b = require('./b');"), [
    './a.js',
    './side-effect',
    './b',
  ]);
  assert.deepEqual(moduleSpecifiers('from pkg.data import image\nimport os.path'), ['pkg/data', 'os/path']);
  assert.deepEqual([...new Set(moduleSpecifiers('import (\n  "fmt"\n  "example.com/app/store"\n)'))], ['fmt', 'example.com/app/store']);
  assert.deepEqual(moduleSpecifiers('use crate::store::Cart;'), ['crate::store::Cart']);
  assert.deepEqual(moduleSpecifiers('#include "store/cart.h"'), ['store/cart.h']);
});

test('a bare word that merely resembles an import is not a specifier', () => {
  assert.deepEqual(moduleSpecifiers('const from = 1; // import the store later'), []);
});

test('a multi-line import is read as one specifier', () => {
  assert.deepEqual(moduleSpecifiers("import {\n  a,\n  b,\n} from './pair.ts';"), ['./pair.ts']);
});

test('path tokens in a relation note drop punctuation and line suffixes, and skip URLs and bare words', () => {
  const tokens = pathTokensIn('Calls `src/store/cart.ts`:42, see (src/ui/page.tsx#L10-L20) and https://example.com/a.html plus README');
  assert.deepEqual([...tokens].sort(), ['src/store/cart.ts', 'src/ui/page.tsx']);
});

test('a token with no folder or no extension is not a path', () => {
  assert.deepEqual([...pathTokensIn('cart.ts src/store')], []);
});
