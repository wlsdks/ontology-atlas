import assert from 'node:assert/strict';
import test from 'node:test';

import { builderFocusParam, normalizeBuilderFocusInput, normalizeCanvasPosition } from './builder-focus.mjs';

test('a node is focused by its kind and the part of its slug after the folder', () => {
  assert.equal(builderFocusParam({ kind: 'capability', slug: 'capabilities/export' }), 'capability:export');
  assert.equal(builderFocusParam({ kind: 'document', slug: 'docs/guide' }), 'docs/guide');
  assert.equal(builderFocusParam(null), '');
});

test('a typed focus is turned back into the slug of its folder', () => {
  assert.equal(normalizeBuilderFocusInput('capability:export'), 'capabilities/export');
  assert.equal(normalizeBuilderFocusInput('domain:billing'), 'domains/billing');
  assert.equal(normalizeBuilderFocusInput('project:shop'), 'shop');
  assert.equal(normalizeBuilderFocusInput('/ontology/element:db'), 'elements/db');
});

test('a slug, an unknown kind and a non-string pass through unchanged', () => {
  assert.equal(normalizeBuilderFocusInput('capabilities/export'), 'capabilities/export');
  assert.equal(normalizeBuilderFocusInput('widget:x'), 'widget:x');
  assert.equal(normalizeBuilderFocusInput(undefined), undefined);
});

test('a canvas position needs finite x and y', () => {
  assert.deepEqual(normalizeCanvasPosition({ x: 1, y: -2, extra: true }), { x: 1, y: -2 });
  assert.equal(normalizeCanvasPosition({ x: 1 }), null);
  assert.equal(normalizeCanvasPosition({ x: Infinity, y: 0 }), null);
  assert.equal(normalizeCanvasPosition(null), null);
});
