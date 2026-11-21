// The rules `validate` applies to a whole vault, tested without a vault on disk.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findDanglingGraphReferenceIssues,
  findDuplicateSlugIssues,
  findDuplicateUidIssues,
} from './validate/graph-reference-checks.mjs';
import { decideExit, groupIssuesByCode } from './validate/issue-summary.mjs';

const entry = (slug, frontmatter = {}) => ({ file: `/vault/${slug}.md`, slug, frontmatter, body: '' });
const codes = (issues) => issues.map(({ issue }) => issue.code);

test('an unreadable file fails every mode, even when nothing else is wrong', () => {
  assert.equal(decideExit(0, 0, false, null, [], 1), 1);
  assert.equal(decideExit(0, 0, false, ['x'], [], 1), 1);
});

test('--fail-on decides by the listed codes alone and overrides errors and --strict', () => {
  const groups = [{ code: 'a' }];
  assert.equal(decideExit(3, 3, true, ['b'], groups), 0);
  assert.equal(decideExit(0, 0, false, ['a'], groups), 1);
});

test('errors fail, warnings fail only under --strict', () => {
  assert.equal(decideExit(1, 0, false, null, []), 1);
  assert.equal(decideExit(0, 2, false, null, []), 0);
  assert.equal(decideExit(0, 2, true, null, []), 1);
});

test('issues group by code: the worst severity wins, files count once, errors come first, then by count', () => {
  const reports = [
    { file: 'a.md', report: { issues: [{ code: 'w', severity: 'warning' }, { code: 'w', severity: 'warning' }] } },
    { file: 'b.md', report: { issues: [{ code: 'w', severity: 'error' }, { code: 'e', severity: 'error' }] } },
    { file: 'c.md', report: { issues: [{ code: 'o', severity: 'warning' }] } },
  ];
  const groups = groupIssuesByCode(reports);
  assert.deepEqual(groups.map((g) => [g.code, g.severity, g.count, g.files]), [
    ['w', 'error', 2, ['a.md', 'b.md']],
    ['e', 'error', 1, ['b.md']],
    ['o', 'warning', 1, ['c.md']],
  ]);
});

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
