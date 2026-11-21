import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findDanglingGraphReferenceIssues,
  findDuplicateSlugIssues,
  findDuplicateUidIssues,
} from './graph-reference-checks.mjs';

const entry = (slug, frontmatter = {}) => ({ file: `/vault/${slug}.md`, slug, frontmatter, body: '' });
const codes = (issues) => issues.map(({ issue }) => issue.code);

test('two documents claiming one slug are both reported, each naming the other', () => {
  const issues = findDuplicateSlugIssues([
    entry('domains/a', { slug: 'shared' }),
    entry('domains/b', { slug: 'shared' }),
    entry('domains/c', { slug: 'alone' }),
  ]);
  assert.equal(issues.length, 2);
  assert.deepEqual(codes(issues), ['duplicate-slug', 'duplicate-slug']);
  assert.match(issues[0].issue.message, /\(domains\/b\)/);
  assert.match(issues[1].issue.message, /\(domains\/a\)/);
});

test('a merged uid counts as a claim, and one document repeating a uid claims it once', () => {
  const issues = findDuplicateUidIssues([
    entry('a', { uid: 'u1', merged_uids: ['u1', 'u2'] }),
    entry('b', { uid: 'u3', merged_uids: ['u2'] }),
  ]);
  assert.equal(issues.length, 2);
  assert.match(issues[0].issue.message, /UID u2/);
});

test('a reference resolves by slug, declared slug or last segment, and a missing one is reported', () => {
  const entries = [
    entry('domains/billing', { kind: 'domain', slug: 'money' }),
    entry('capabilities/pay', {
      kind: 'capability',
      domain: 'billing',
      domains: ['money'],
      relates: ['domains/billing', 'gone'],
    }),
  ];
  const issues = findDanglingGraphReferenceIssues(entries);
  assert.equal(issues.length, 1);
  assert.match(issues[0].issue.message, /`relates:` graph reference "gone" resolves to no node/);
});

test('a reference to a file without a kind says it is not a node, and a path-like element is skipped', () => {
  const entries = [
    entry('notes/minutes', {}),
    entry('capabilities/pay', {
      kind: 'capability',
      relates: ['notes/minutes'],
      elements: ['src/pay.ts', 'index.mjs'],
    }),
  ];
  const issues = findDanglingGraphReferenceIssues(entries);
  assert.equal(issues.length, 1);
  assert.match(issues[0].issue.message, /\*\*not a node\*\*/);
});
