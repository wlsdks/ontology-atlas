import assert from 'node:assert/strict';
import test from 'node:test';

import { hasCode } from './source-files.mjs';

test('a file of comments, imports and re-exports holds no code', () => {
  const barrel = [
    '// public surface',
    "import { a } from './a';",
    "export { a } from './a';",
    "export * from './b';",
    '/* block',
    '   comment */',
  ].join('\n');
  assert.equal(hasCode(barrel, 'src/index.ts'), false);
});

test('one real statement among imports makes it code', () => {
  assert.equal(hasCode("import { a } from './a';\nexport const b = a + 1;\n", 'src/index.ts'), true);
});

test('a python module of a docstring and imports holds no code, and a function makes it code', () => {
  const init = ['"""Package docs."""', 'from .core import run', '# comment', '__all__ = ["run"]'].join('\n');
  assert.equal(hasCode(init, 'pkg/__init__.py'), false);
  assert.equal(hasCode(`${init}\ndef main():\n    return 1\n`, 'pkg/__init__.py'), true);
});
