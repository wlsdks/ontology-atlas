import assert from 'node:assert/strict';
import test from 'node:test';

import { removeRelation } from './write-relations.mjs';

const replacing = (replaceWith) => () => removeRelation({
  from: 'capabilities/refund',
  to: 'elements/ledger',
  type: 'depends_on',
  replaceWith,
});

test('a replacement target or type with a line break in it is refused as the old newTo and newType were', () => {
  for (const terminator of ['\u2028', '\u2029', '\n', '\r']) {
    const codePoint = terminator.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    assert.throws(
      replacing({ to: `elements/pay${terminator}ments`, type: 'depends_on' }),
      { message: `replaceWith.to must be a single line: it contains U+${codePoint}, a control or invisible formatting character that breaks a line.` },
    );
    assert.throws(
      replacing({ to: 'elements/payments', type: `depends_on${terminator}x` }),
      { message: `replaceWith.type must be a single line: it contains U+${codePoint}, a control or invisible formatting character that breaks a line.` },
    );
  }
});
