import assert from 'node:assert/strict';
import test from 'node:test';

import { decideExit, groupIssuesByCode } from './issue-summary.mjs';

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
