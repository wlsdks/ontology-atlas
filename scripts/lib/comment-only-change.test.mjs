import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isCommentOnlyChange } from './comment-only-change.mjs';

const CASES = [
  ['a line comment reworded', 'x.ts', 'const a = 1; // old\n', 'const a = 1; // new reason\n', true],
  ['a block comment removed', 'x.mjs', '/** why */\nexport const a = 1;\n', 'export const a = 1;\n', true],
  ['a JSX comment changed', 'x.tsx', 'const v = <div>{/* old */}<b /></div>;\n', 'const v = <div>{/* new */}<b /></div>;\n', true],
  ['only formatting changed', 'x.ts', 'const a=1;\n', 'const a = 1;\n', true],
  ['a string that looks like a comment changed', 'x.ts', "const u = 'http://a';\n", "const u = 'http://b';\n", false],
  ['a template literal changed', 'x.ts', 'const t = `/* a */`;\n', 'const t = `/* b */`;\n', false],
  ['code changed beside a comment', 'x.ts', 'const a = 1; // c\n', 'const a = 2; // c\n', false],
  ['the file is new', 'x.ts', null, 'const a = 1;\n', false],
  ['the new text does not parse', 'x.ts', 'const a = 1;\n', 'const a = ;\n', false],
  ['a file type the parser does not read', 'x.css', 'a{}/* x */', 'a{}/* y */', false],
];

for (const [name, path, before, after, expected] of CASES) {
  test(`comment-only change: ${name}`, () => {
    assert.equal(isCommentOnlyChange(before, after, path), expected);
  });
}
