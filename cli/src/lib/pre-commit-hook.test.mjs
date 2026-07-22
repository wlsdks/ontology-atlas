import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  PRE_COMMIT_MARKER_START,
  buildPreCommitHookContent,
  hasManagedPreCommitBlock,
} from './pre-commit-hook.mjs';

test('buildPreCommitHookContent — no existing hook creates one with shebang + managed block', () => {
  const { content, action } = buildPreCommitHookContent(null);
  assert.equal(action, 'created');
  assert.match(content, /^#!\/bin\/sh\n/);
  assert.match(content, /ontology-atlas preflight --staged/);
  assert.ok(hasManagedPreCommitBlock(content));
});

test('buildPreCommitHookContent — empty string existing content is treated as absent', () => {
  const { action } = buildPreCommitHookContent('');
  assert.equal(action, 'created');
});

test('buildPreCommitHookContent — existing foreign hook gets the block appended, not overwritten', () => {
  const existing = '#!/bin/sh\necho "running lint"\nnpx lint-staged\n';
  const { content, action } = buildPreCommitHookContent(existing);
  assert.equal(action, 'appended');
  assert.ok(content.startsWith(existing));
  assert.match(content, /ontology-atlas preflight --staged/);
});

test('buildPreCommitHookContent — already-installed hook is left untouched (idempotent)', () => {
  const existing = buildPreCommitHookContent(null).content;
  const second = buildPreCommitHookContent(existing);
  assert.equal(second.action, 'already-installed');
  assert.equal(second.content, existing);
});

test('buildPreCommitHookContent — appending to a foreign hook missing a trailing newline still separates cleanly', () => {
  const existing = '#!/bin/sh\necho "no trailing newline"';
  const { content } = buildPreCommitHookContent(existing);
  assert.ok(content.includes('echo "no trailing newline"\n\n' + PRE_COMMIT_MARKER_START));
});

test('hasManagedPreCommitBlock — false for unrelated content', () => {
  assert.equal(hasManagedPreCommitBlock('#!/bin/sh\necho hi\n'), false);
  assert.equal(hasManagedPreCommitBlock(''), false);
  assert.equal(hasManagedPreCommitBlock(undefined), false);
});
