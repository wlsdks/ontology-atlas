import test from 'node:test';
import assert from 'node:assert/strict';
import { comparableCode, commentLanguageOf } from './comparable-code.mjs';
import { COMPARABLE_CODE_CASES } from '../../../tests/fixtures/comparable-code-cases.mjs';

for (const testCase of COMPARABLE_CODE_CASES) {
  test(`comparableCode: ${testCase.name}`, () => {
    const same = comparableCode(testCase.before, testCase.path) === comparableCode(testCase.after, testCase.path);
    assert.equal(same, testCase.same);
  });
}

test('every extension the spec lists has a comment language', () => {
  const listed = 'js mjs cjs ts tsx jsx mts cts rs java kt kts go swift c h cc cpp hpp cs scala dart css scss py sh bash zsh rb toml yaml yml';
  for (const extension of listed.split(' ')) assert.ok(commentLanguageOf(`a/b.${extension}`), extension);
  assert.equal(commentLanguageOf('a/b.txt'), null);
  assert.equal(commentLanguageOf('a/Makefile'), null);
  assert.equal(commentLanguageOf('a/.env'), null);
});

test('a Go build directive is code, not a comment', () => {
  const before = '//go:build linux\npackage a\n';
  const after = '//go:build darwin\npackage a\n';
  assert.notEqual(comparableCode(before, 'a.go'), comparableCode(after, 'a.go'));
});

test('a C# verbatim string keeps its backslash and its //', () => {
  const before = 'var p = @"C:\\dir\\"; // a\nvar u = "x";\n';
  const after = 'var p = @"C:\\dir\\"; // b\nvar u = "x";\n';
  assert.equal(comparableCode(before, 'a.cs'), comparableCode(after, 'a.cs'));
  assert.notEqual(comparableCode('var u = @"a//b";', 'a.cs'), comparableCode('var u = @"a//c";', 'a.cs'));
});

test('import bindings are kept, sorted and without their module', () => {
  const text = "import b, { z as y, a } from './m';\nimport * as ns from 'n';\nexport { q } from 'r';\n";
  assert.match(comparableCode(text, 'a.ts'), /\0imports\nexport q\nimport \* as ns\nimport a\nimport default as b\nimport z as y$/);
});
