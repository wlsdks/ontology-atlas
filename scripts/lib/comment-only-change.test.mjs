import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isCommentOnlyChange } from './comment-only-change.mjs';

test('a change to comments and layout alone is comment-only', () => {
  const before = '// old banner\nexport const TOOLS = [\n  "a", // first\n];\n';
  const after = 'export const TOOLS = [ "a", ];\n/* why the list is ordered */\n';
  assert.equal(isCommentOnlyChange('registry.mjs', before, after), true);
});

test('a changed token is not comment-only, even inside a string that looks like a comment', () => {
  assert.equal(isCommentOnlyChange('registry.mjs', 'const a = "// x";', 'const a = "// y";'), false);
  assert.equal(isCommentOnlyChange('registry.mjs', 'export const TOOLS = ["a"];', 'export const TOOLS = ["a", "b"];'), false);
});
