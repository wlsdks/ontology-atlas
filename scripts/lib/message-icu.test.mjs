import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { analyzeMessage, flattenMessages, literalText, sameMultiset, visibleVariants } from './message-icu.mjs';

describe('flattenMessages', () => {
  it('flattens nested objects to dotted keys in order', () => {
    assert.deepEqual(flattenMessages({ a: { b: 'x', c: { d: 'y' } }, e: 'z', n: 1 }), [
      ['a.b', 'x'],
      ['a.c.d', 'y'],
      ['e', 'z'],
    ]);
  });
});

describe('analyzeMessage', () => {
  it('separates plain arguments from selectors', () => {
    const result = analyzeMessage('{name} has {count, plural, one {# file} other {# files}}');
    assert.deepEqual([...result.plain], ['name']);
    assert.deepEqual([...result.selectors], ['count']);
    assert.deepEqual([...result.args].sort(), ['count', 'name']);
  });

  it('counts rich tags and records plural branches, including nested ones', () => {
    const result = analyzeMessage('<b>{n, plural, =0 {none} one {<b>x</b>} other {many}}</b>');
    assert.equal(result.tags.get('b'), 2);
    assert.deepEqual(result.plurals, [{ arg: 'n', ordinal: false, branches: ['=0', 'one', 'other'] }]);
  });

  it('marks ordinals and tolerates a missing other branch', () => {
    const result = analyzeMessage('{n, selectordinal, one {#st}}');
    assert.equal(result.plurals[0].ordinal, true);
  });

  it('throws on invalid ICU', () => {
    assert.throws(() => analyzeMessage('{unclosed'));
  });
});

describe('visibleVariants and literalText', () => {
  it('renders each plural branch as its own sentence with arguments in braces', () => {
    assert.deepEqual(visibleVariants('{n, plural, one {# file} other {# files}}'), ['{#} file', '{#} files']);
    assert.deepEqual(visibleVariants('Hi {name}<b>!</b>'), ['Hi {name}<b>!</b>']);
  });

  it('keeps only literal text', () => {
    assert.equal(literalText('Hi {name}, <b>bold</b>').replace(/\s+/g, ' '), 'Hi , bold');
  });
});

describe('sameMultiset', () => {
  it('compares counts', () => {
    assert.equal(sameMultiset(new Map([['b', 2]]), new Map([['b', 2]])), true);
    assert.equal(sameMultiset(new Map([['b', 2]]), new Map([['b', 1]])), false);
    assert.equal(sameMultiset(new Map(), new Map([['b', 1]])), false);
  });
});
