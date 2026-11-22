import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lexicalTokens, taskIntent } from './task-intent.mjs';

test('a word and its canonical form are both tokens, once each', () => {
  assert.deepEqual(lexicalTokens('Parsing parsers'), ['parsing', 'parse', 'parsers', 'parser']);
  assert.deepEqual(lexicalTokens('Parse parse'), ['parse']);
});

test('dotted names and separators split into their parts', () => {
  const tokens = lexicalTokens('store.cart-items/list');
  for (const expected of ['store.cart', 'store', 'cart', 'items', 'list']) {
    assert.ok(tokens.includes(expected), expected);
  }
});

test('a Korean particle is stripped from a long-enough noun', () => {
  assert.ok(lexicalTokens('장바구니를').includes('장바구니'));
});

test('a task says what it wants and what it rules out', () => {
  const intent = taskIntent('Fix the cart total rounding. Do not change checkout payment.');
  assert.deepEqual(intent.desiredTerms, ['cart', 'total', 'rounding']);
  assert.deepEqual(intent.nonGoalTerms, ['checkout', 'payment']);
  assert.deepEqual(intent.desiredClauseTerms, [['cart', 'total', 'rounding']]);
  assert.deepEqual(intent.nonGoalClauseTerms, [['checkout', 'payment']]);
});

test('an inline boundary clause after "and" is a non-goal, not a wish', () => {
  const intent = taskIntent('Update invoice export and do not touch tax rules');
  assert.deepEqual(intent.desiredTerms, ['update', 'invoice', 'export']);
  assert.ok(intent.nonGoalTerms.includes('tax'));
  assert.ok(!intent.desiredTerms.includes('tax'));
});

test('Korean boundary phrasing marks a non-goal', () => {
  const intent = taskIntent('장바구니 합계 수정. 결제 모듈은 범위 밖');
  assert.ok(intent.nonGoalTerms.some((term) => term.startsWith('결제')));
  assert.ok(!intent.desiredTerms.some((term) => term.startsWith('결제')));
});

test('writing and parsing words expand to the canonical verbs', () => {
  assert.ok(taskIntent('serializer output').allTerms.includes('write'));
  assert.ok(taskIntent('decoder input').allTerms.includes('parse'));
});

test('filler words and single letters never count as terms', () => {
  assert.deepEqual(taskIntent('Fix the a of it').allTerms, []);
});
