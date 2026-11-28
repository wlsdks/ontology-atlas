import assert from 'node:assert/strict';
import test from 'node:test';
import { compareCodePoints } from './compare-code-points.mjs';

test('a character outside the basic plane sorts after U+FFFF, as its UTF-8 bytes do', () => {
  const emoji = '\u{1F600}';
  const highBasic = '�';
  assert.ok(compareCodePoints(emoji, highBasic) > 0);
  assert.ok(compareCodePoints(highBasic, emoji) < 0);
  assert.ok(emoji < highBasic, 'plain comparison orders them the other way, which is why it is not used');
  assert.ok(compareCodePoints('a', 'a/b') < 0);
  assert.equal(compareCodePoints('same', 'same'), 0);
});
