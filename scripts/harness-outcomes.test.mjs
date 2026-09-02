import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { countFixes, releaseIntervals, summarizePrepush, summarizePullRequest } from './harness-outcomes.mjs';
import { appendPrepushRecord, prepushRecord } from './harness-prepush-ledger.mjs';

/**
 * The outcome numbers are the first thing downstream of the harness that can
 * say whether it earns its minutes, so the way they are counted has to be
 * exact: a refused push counted twice, or a flaky shard counted as a defect,
 * would argue for the wrong change.
 */

const NOW = Date.parse('2026-09-02T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const row = (daysAgo, failed) => JSON.stringify({ at: new Date(NOW - daysAgo * DAY).toISOString(), files: 3, lanes: ['lint', 'unit'], failed });

describe('pre-push ledger', () => {
  it('turns the three strings the hook has into a well-formed record', () => {
    const record = prepushRecord({ files: '12', lanes: ' typecheck lint unit', failed: ' lint', now: NOW });
    assert.deepEqual(record, { at: '2026-09-02T00:00:00.000Z', files: 12, lanes: ['typecheck', 'lint', 'unit'], failed: ['lint'] });
  });

  it('records a clean push with an empty failed list, not a missing one', () => {
    assert.deepEqual(prepushRecord({ files: '1', lanes: 'docs', failed: '' }).failed, []);
  });

  it('appends under .tmp/harness of the given root', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prepush-ledger-'));
    try {
      appendPrepushRecord({ files: '2', lanes: 'lint', failed: 'lint', now: NOW }, { cwd: dir });
      appendPrepushRecord({ files: '2', lanes: 'lint', failed: '', now: NOW + 1 }, { cwd: dir });
      const lines = readFileSync(join(dir, '.tmp', 'harness', 'prepush.jsonl'), 'utf8').trim().split('\n');
      assert.equal(lines.length, 2);
      assert.equal(JSON.parse(lines[0]).failed[0], 'lint');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('counts a push once however many lanes refused it, and each lane once per push', () => {
    const summary = summarizePrepush([row(1, ['lint', 'unit']), row(2, ['lint']), row(3, []), 'not json', row(40, ['docs'])], NOW - 14 * DAY);
    assert.equal(summary.pushes, 3, 'the 40-day-old push is outside the window');
    assert.equal(summary.blocked, 2);
    assert.deepEqual(summary.byLane, { lint: 2, unit: 1 });
  });
});

describe('CI round-trips per pull request', () => {
  const pr = {
    number: 1370,
    title: 'feat: fast-sensor lane',
    mergedAt: '2026-09-01T10:00:00Z',
    commits: [
      { sha: '91b52011111', checkRuns: [{ name: 'Unit · Contract', conclusion: 'failure' }, { name: 'Lint', conclusion: 'success' }] },
      { sha: 'cd94c122222', checkRuns: [{ name: 'Unit · Contract', conclusion: 'failure' }, { name: 'Unit · Contract', conclusion: 'success' }] },
      { sha: 'dbebc7c3333', checkRuns: [{ name: 'Unit · Contract', conclusion: 'success' }] },
      { sha: 'aaaaaaa4444', checkRuns: [] },
    ],
  };

  it('counts commits with at least one failed check, naming the check once', () => {
    const summary = summarizePullRequest(pr);
    assert.equal(summary.commits, 4);
    assert.equal(summary.ciFailures, 2);
    assert.deepEqual(summary.failedChecks, [
      { sha: '91b5201', checks: ['Unit · Contract'] },
      { sha: 'cd94c12', checks: ['Unit · Contract'] },
    ]);
  });

  it('does not count a commit that never reached CI as a pass or a failure', () => {
    assert.equal(summarizePullRequest({ ...pr, commits: [pr.commits[3]] }).ciFailures, 0);
  });
});

describe('escaped defects per release', () => {
  it('pairs each release tag with the next and the last with HEAD, ignoring prereleases', () => {
    assert.deepEqual(releaseIntervals(['v1.0.0-rc.19', 'v1.0.0', 'v1.0.1', 'v1.0.2'], 'main'), [
      { from: 'v1.0.0', to: 'v1.0.1' },
      { from: 'v1.0.1', to: 'v1.0.2' },
      { from: 'v1.0.2', to: 'main' },
    ]);
  });

  it('counts conventional fix subjects, scoped or not, and nothing else', () => {
    assert.deepEqual(countFixes(['fix: a', 'fix(mcp): b', 'feat: c', 'chore: fix typo', '', 'refactor: d']), { total: 5, fixes: 2 });
  });
});
