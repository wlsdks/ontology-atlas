import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeDependencyImpactTypes,
  normalizeIterations,
  normalizeMatchEdgesTypes,
  normalizeNodeKind,
  normalizeNodeSort,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  normalizePattern,
  normalizeStringSet,
  normalizeTraversalDirection,
} from './query-arguments.mjs';

test('an optional string is absent, or non-blank and untouched by whitespace', () => {
  assert.equal(normalizeOptionalString(undefined, 'x'), null);
  assert.equal(normalizeOptionalString('a', 'x'), 'a');
  assert.throws(() => normalizeOptionalString(3, 'x'), /x must be a string\./);
  assert.throws(() => normalizeOptionalString('  ', 'x'), /x must be a non-empty string\./);
  assert.throws(() => normalizeOptionalString(' a', 'x'), /x must not have leading or trailing whitespace\./);
  assert.throws(() => normalizeOptionalString('a\0b', 'x'), /x must not contain a null byte\./);
});

test('a count is absent or a non-negative integer', () => {
  assert.equal(normalizeNonNegativeInteger(null, 'n'), null);
  assert.equal(normalizeNonNegativeInteger(0, 'n'), 0);
  assert.throws(() => normalizeNonNegativeInteger(-1, 'n'), /n must be a non-negative integer/);
  assert.throws(() => normalizeNonNegativeInteger(1.5, 'n'), /n must be a non-negative integer/);
});

test('iterations default to 20 and stay within 1 to 100', () => {
  assert.equal(normalizeIterations(undefined), 20);
  assert.equal(normalizeIterations(100), 100);
  assert.throws(() => normalizeIterations(0), /iterations must be a positive integer\./);
  assert.throws(() => normalizeIterations(101), /iterations must be <= 100\./);
});

test('a node sort defaults to degree and names the allowed values for a bad one', () => {
  assert.equal(normalizeNodeSort(undefined), 'degree');
  assert.equal(normalizeNodeSort('slug'), 'slug');
  assert.throws(() => normalizeNodeSort('size'), /sort/);
});

test('a node kind is checked against the kinds a node can have', () => {
  assert.equal(normalizeNodeKind(undefined, 'kind'), null);
  assert.equal(normalizeNodeKind('capability', 'kind'), 'capability');
  assert.throws(() => normalizeNodeKind('widget', 'kind'), /kind/);
});

test('a traversal direction falls back to the caller default only when omitted', () => {
  assert.equal(normalizeTraversalDirection(undefined, 'both'), 'both');
  assert.equal(normalizeTraversalDirection('incoming', 'both'), 'incoming');
  assert.throws(() => normalizeTraversalDirection('sideways', 'both'), /direction/);
});

test('a string set keeps its items, refuses blanks and values outside the allowed ones, and is null when empty', () => {
  assert.deepEqual([...normalizeStringSet(['a', 'b'], 'tags')], ['a', 'b']);
  assert.equal(normalizeStringSet([], 'tags'), null);
  assert.throws(() => normalizeStringSet('a', 'tags'), /tags must be an array of strings\./);
  assert.throws(() => normalizeStringSet(['a', ' '], 'tags'), /tags items must be non-empty strings\./);
  assert.throws(() => normalizeStringSet(['c'], 'tags', new Set(['a'])), /tags items/);
});

test('a relation pattern is a non-empty list of relation names, cut at 20 steps', () => {
  assert.throws(() => normalizePattern([]), /pattern \(non-empty string array\) is required for pattern_walk\./);
  assert.throws(() => normalizePattern([3]), /pattern must be an array of strings\./);
  assert.equal(normalizePattern(Array.from({ length: 25 }, () => 'relates')).length, 20);
});

test('edge matching takes either a list of types or one relation, never a malformed one', () => {
  assert.equal(normalizeMatchEdgesTypes({}), null);
  assert.equal(normalizeMatchEdgesTypes({ relation: 'relates' }).size, 1);
  assert.throws(() => normalizeMatchEdgesTypes({ type: 3 }), /type must be a string\./);
  assert.throws(() => normalizeMatchEdgesTypes({ relation: ' relates' }), /relation must not have leading or trailing whitespace\./);
});

test('dependency impact accepts dependencies alone', () => {
  assert.deepEqual([...normalizeDependencyImpactTypes(undefined)], ['dependencies']);
  assert.throws(() => normalizeDependencyImpactTypes(['relates']), /dependency impact only accepts depends_on relations/);
});
