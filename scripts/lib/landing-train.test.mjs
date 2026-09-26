import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_BATCH,
  EJECTED_MARKER,
  EMPTY_BEFORE_REFIRE,
  LANDED_MARKER,
  QUEUE_LABEL,
  composeSquashBody,
  conflictComment,
  describeFastPath,
  describeTrain,
  driftVerdict,
  ejectComment,
  fastPathEligibility,
  intersect,
  landedComment,
  nextTrain,
  parseCoAuthors,
  queueOrder,
  redTrainPlan,
  runIdsFromChecks,
  splitTrain,
  trainBody,
  trainBranchName,
  trainCiStep,
  trainTitle,
  waiterOutcome,
  waiterPollSeconds,
} from './landing-train.mjs';

const pr = (number, extra = {}) => ({ number, title: `change ${number}`, headRefName: `feat/${number}`, headRefOid: `${number}`.padEnd(40, 'a'), ...extra });
const green = { state: 'green', pending: [], failed: [], unrun: [], neverRan: false };
const clear = { state: 'clear', failed: [], accepted: [], unmatched: [] };

describe('queue order', () => {
  const labeled = (at, name = QUEUE_LABEL) => ({ createdAt: at, label: { name } });
  it('orders by the latest time the queue label went on, then by number', () => {
    const rows = queueOrder([
      { number: 3, timelineItems: { nodes: [labeled('2026-09-26T10:05:00Z')] } },
      { number: 1, timelineItems: { nodes: [labeled('2026-09-26T10:01:00Z'), labeled('2026-09-26T10:09:00Z')] } },
      { number: 2, timelineItems: { nodes: [labeled('2026-09-26T10:05:00Z'), labeled('2026-09-26T09:00:00Z', 'bug')] } },
    ]);
    // #1 was re-queued at 10:09, so it went to the back; #2 and #3 tie and break on number.
    assert.deepEqual(rows.map((row) => row.number), [2, 3, 1]);
    assert.equal(rows[2].queuedAt, '2026-09-26T10:09:00.000Z');
    assert.equal('timelineItems' in rows[0], false);
  });

  it('keeps a node with no readable event, after every dated one', () => {
    const rows = queueOrder([{ number: 9, timelineItems: { nodes: [] } }, { number: 5, timelineItems: { nodes: [labeled('2026-09-26T10:00:00Z')] } }, null, {}]);
    assert.deepEqual(rows.map((row) => [row.number, row.queuedAt]), [[5, '2026-09-26T10:00:00.000Z'], [9, null]]);
  });
});

describe('batch selection', () => {
  const queue = Array.from({ length: 25 }, (_, i) => pr(i + 1));
  it('takes the oldest batch by default', () => {
    const { batch, splits } = nextTrain({ queue });
    assert.equal(batch.length, DEFAULT_BATCH);
    assert.deepEqual(batch.slice(0, 3).map((c) => c.number), [1, 2, 3]);
    assert.deepEqual(splits, []);
    assert.equal(nextTrain({ queue, batchSize: 3 }).batch.length, 3);
    assert.deepEqual(nextTrain({ queue: [] }).batch, []);
  });

  it('runs a pending bisect half before new arrivals, and drops members that left the queue', () => {
    const next = nextTrain({ queue, splits: [[7, 99, 3], [4]], batchSize: 5 });
    assert.deepEqual(next.batch.map((c) => c.number), [7, 3]);
    assert.deepEqual(next.splits, [[4]]);
  });

  it('skips a half whose members all left, then falls back to the queue', () => {
    const next = nextTrain({ queue: queue.slice(0, 2), splits: [[40, 41]], batchSize: 5 });
    assert.deepEqual(next.batch.map((c) => c.number), [1, 2]);
    assert.deepEqual(next.splits, []);
  });
});

describe('bisect', () => {
  it('halves with the larger half first and never yields an empty half', () => {
    assert.deepEqual(splitTrain([1, 2, 3, 4, 5]), [[1, 2, 3], [4, 5]]);
    assert.deepEqual(splitTrain([1, 2]), [[1], [2]]);
    assert.deepEqual(splitTrain([1]), [[1]]);
  });

  it('splits a red train of several and ejects a red train of one', () => {
    const failed = [{ name: 'Unit · Contract' }];
    assert.deepEqual(redTrainPlan({ components: [1, 2, 3], failed }).action, 'split');
    assert.deepEqual(redTrainPlan({ components: [1, 2, 3], failed }).halves, [[1, 2], [3]]);
    assert.equal(redTrainPlan({ components: [1], failed }).action, 'eject');
  });

  it('reruns once when every failing context is flaky, at any size, then bisects', () => {
    const failed = [{ name: 'Playwright (chromium 2/3)' }];
    const flaky = ['Playwright (chromium 2/3)'];
    assert.equal(redTrainPlan({ components: [1], failed, flaky, reruns: 0 }).action, 'rerun');
    assert.equal(redTrainPlan({ components: [1, 2], failed, flaky, reruns: 0 }).action, 'rerun');
    assert.equal(redTrainPlan({ components: [1], failed, flaky, reruns: 1 }).action, 'eject');
    // One non-flaky failure beside a flaky one is a real failure.
    assert.equal(redTrainPlan({ components: [1], failed: [...failed, { name: 'MCP' }], flaky }).action, 'eject');
    assert.equal(redTrainPlan({ components: [1], failed: [], flaky }).action, 'eject');
  });

  it('finds the one breaker in log2(n) trains when the halves run in order', () => {
    // Simulated: #6 breaks CI. Each train is red when it carries #6.
    let splits = [];
    let queue = Array.from({ length: 8 }, (_, i) => pr(i + 1));
    const trains = [];
    for (let guard = 0; guard < 20; guard += 1) {
      const next = nextTrain({ queue, splits, batchSize: 8 });
      splits = next.splits;
      if (next.batch.length === 0) break;
      const numbers = next.batch.map((c) => c.number);
      trains.push(numbers);
      if (!numbers.includes(6)) {
        queue = queue.filter((c) => !numbers.includes(c.number));
        continue;
      }
      const plan = redTrainPlan({ components: numbers, failed: [{ name: 'MCP' }] });
      if (plan.action === 'split') splits = [...plan.halves, ...splits];
      else queue = queue.filter((c) => c.number !== 6);
    }
    assert.deepEqual(trains, [[1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4], [5, 6, 7, 8], [5, 6], [5], [6], [7, 8]]);
    assert.deepEqual(queue, []);
  });
});

describe('train CI, one poll at a time', () => {
  const waiting = { state: 'waiting', pending: ['MCP'], failed: [], unrun: [], neverRan: false };
  const never = { state: 'waiting', pending: [], failed: [], unrun: ['MCP'], neverRan: true };
  it('waits, refires once after repeated silence, and reads red and green', () => {
    assert.equal(trainCiStep({ checks: waiting, other: clear }).action, 'wait');
    assert.equal(trainCiStep({ checks: never, other: clear, emptyRollupObservations: 1 }).action, 'wait');
    assert.equal(trainCiStep({ checks: never, other: clear, emptyRollupObservations: EMPTY_BEFORE_REFIRE }).action, 'refire');
    assert.equal(trainCiStep({ checks: never, other: clear, emptyRollupObservations: 9, refires: 1 }).action, 'wait');
    assert.equal(trainCiStep({ checks: never, other: clear, emptyRollupObservations: 9, inFlight: true }).action, 'wait');
    assert.equal(trainCiStep({ checks: green, other: clear }).action, 'green');
    const failed = { ...green, state: 'failed', failed: [{ name: 'MCP', conclusion: 'FAILURE' }] };
    assert.deepEqual(trainCiStep({ checks: failed, other: clear }).failed.map((c) => c.name), ['MCP']);
  });

  it('treats an unaccepted red unrequired lane as red, but only once the required ones are done', () => {
    const other = { state: 'failed', failed: [{ name: 'Verify unsigned Windows x64 beta' }] };
    assert.equal(trainCiStep({ checks: waiting, other }).action, 'wait');
    assert.equal(trainCiStep({ checks: green, other }).action, 'red');
  });

  it('names each failing workflow run once for a rerun', () => {
    assert.deepEqual(runIdsFromChecks([
      { url: 'https://github.com/o/r/actions/runs/111/job/1' },
      { url: 'https://github.com/o/r/actions/runs/111/job/2' },
      { url: 'https://github.com/o/r/actions/runs/222/job/3' },
      { url: null },
    ]), ['111', '222']);
  });
});

describe('main moving under a train', () => {
  it('is safe only outside the train files', () => {
    assert.deepEqual(driftVerdict({ trainFiles: ['a.ts'], mainFiles: ['b.ts'] }), { state: 'clear', overlap: [] });
    assert.deepEqual(driftVerdict({ trainFiles: ['a.ts', 'b.ts'], mainFiles: ['b.ts'] }), { state: 'overlap', overlap: ['b.ts'] });
    assert.equal(driftVerdict({ trainFiles: null, mainFiles: [] }).state, 'unknown');
    assert.deepEqual(intersect(['b', 'a', 'a'], ['a', 'b', 'c']), ['a', 'b']);
  });
});

describe('fast-path eligibility', () => {
  const base = {
    checks: green,
    other: clear,
    mergeClean: true,
    prFiles: ['src/a.ts'],
    mainFiles: ['src/b.ts'],
    lock: { state: 'free' },
    fullPlan: { full: false, reason: 'comparable change' },
  };
  const failing = (verdict) => verdict.rules.filter((row) => !row.ok).map((row) => row.rule);

  it('qualifies when every rule holds, and says why for each', () => {
    const verdict = fastPathEligibility(base);
    assert.equal(verdict.eligible, true);
    assert.deepEqual(verdict.rules.map((row) => row.rule), ['ready-green', 'clean-merge', 'disjoint-from-main', 'no-overlapping-train', 'not-full-plan']);
    assert.ok(describeFastPath(verdict).every((line) => line.startsWith('pass ')));
  });

  it('disqualifies each rule on its own', () => {
    assert.deepEqual(failing(fastPathEligibility({ ...base, checks: { state: 'waiting', pending: [], failed: [], unrun: ['MCP'] } })), ['ready-green']);
    assert.deepEqual(failing(fastPathEligibility({ ...base, other: { state: 'failed', failed: [{ name: 'Windows' }] } })), ['ready-green']);
    assert.deepEqual(failing(fastPathEligibility({ ...base, mergeClean: false })), ['clean-merge']);
    assert.deepEqual(failing(fastPathEligibility({ ...base, mainFiles: ['src/a.ts'] })), ['disjoint-from-main']);
    assert.deepEqual(failing(fastPathEligibility({ ...base, fullPlan: { full: true, reason: 'CI impact authority changed' } })), ['not-full-plan']);
  });

  it('fails a rule whose input could not be read, instead of guessing a pass', () => {
    const verdict = fastPathEligibility({ ...base, checks: null, mergeClean: null, prFiles: null, fullPlan: null, lock: { state: 'unknown' } });
    assert.equal(verdict.eligible, false);
    assert.deepEqual(failing(verdict), ['ready-green', 'clean-merge', 'disjoint-from-main', 'no-overlapping-train', 'not-full-plan']);
  });

  it('reads the train in flight from the lock payload', () => {
    const held = (payload) => ({ state: 'held', holder: { pr: 1900, ...payload } });
    assert.equal(fastPathEligibility({ ...base, lock: held({ train: { files: ['src/b.ts'] } }) }).eligible, true);
    assert.deepEqual(failing(fastPathEligibility({ ...base, lock: held({ train: { files: ['src/a.ts'] } }) })), ['no-overlapping-train']);
    // Assembling: the file set is not written yet, so nothing can be proven disjoint.
    assert.deepEqual(failing(fastPathEligibility({ ...base, lock: held({ train: { files: null } }) })), ['no-overlapping-train']);
    // Between trains: the next train is cut from main after this merge, and checks drift before merging.
    assert.equal(fastPathEligibility({ ...base, lock: held({ train: null }) }).eligible, true);
    // A lock from the per-PR pr:land records no train at all.
    assert.deepEqual(failing(fastPathEligibility({ ...base, lock: held({}) })), ['no-overlapping-train']);
    assert.deepEqual(failing(fastPathEligibility({ ...base, lock: { state: 'unreadable' } })), ['no-overlapping-train']);
    // A stale conductor's recorded files still count until the lock is gone.
    assert.deepEqual(failing(fastPathEligibility({ ...base, lock: { state: 'stale', holder: { pr: 1, train: { files: ['src/a.ts'] } } } })), ['no-overlapping-train']);
  });
});

describe('what the train says', () => {
  const components = [
    { ...pr(12), title: 'feat: one', coAuthors: ['Ada <ada@example.com>', 'Claude <noreply@anthropic.com>'] },
    { ...pr(13), title: 'fix: two', coAuthors: ['ADA <Ada@Example.com>', 'Bo <bo@example.com>'] },
  ];

  it('names the branch by time and first component', () => {
    assert.equal(trainBranchName(Date.parse('2026-09-26T10:15:30.123Z'), 12), 'train/20260926T101530Z-12');
  });

  it('titles the train with every number, shortened past 100 characters', () => {
    assert.equal(trainTitle(components), 'chore(train): land #12 #13');
    const many = Array.from({ length: 30 }, (_, i) => pr(1900 + i));
    const title = trainTitle(many);
    assert.ok(title.length <= 100, title);
    assert.match(title, /^chore\(train\): land #1900 #1901 .* and \d+ more$/);
    const shown = title.match(/#\d+/g).length;
    assert.equal(shown + Number(title.match(/and (\d+) more/)[1]), 30);
  });

  it('lists each component as #n branch@sha title in the body', () => {
    const body = trainBody({ components, base: 'f'.repeat(40) });
    assert.match(body, /main@fffffffff/);
    assert.match(body, /- #12 `feat\/12@12aaaaaaa` feat: one/);
    assert.match(body, /## Summary[\s\S]*## Test plan/);
  });

  it('carries every component title and each co-author once in the squash body', () => {
    const body = composeSquashBody({ components, trainNumber: 1999 });
    assert.match(body, /^Landed by train #1999:/);
    assert.match(body, /- feat: one \(#12, feat\/12@12aaaaaaa\)/);
    assert.match(body, /- fix: two \(#13, feat\/13@13aaaaaaa\)/);
    const trailers = body.split('\n').filter((line) => line.startsWith('Co-authored-by: '));
    assert.deepEqual(trailers, [
      'Co-authored-by: Ada <ada@example.com>',
      'Co-authored-by: Claude <noreply@anthropic.com>',
      'Co-authored-by: Bo <bo@example.com>',
    ]);
    assert.doesNotMatch(composeSquashBody({ components: [pr(1)], trainNumber: 2 }), /Co-authored-by/);
  });

  it('reads authors and trailers out of a component log', () => {
    const log = [
      'Co-authored-by: Stark <stark@example.com>',
      'feat: thing',
      '',
      'Body line.',
      '',
      'Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>',
      'Co-authored-by: stark <STARK@example.com>',
      'Not a trailer: Co-authored-by: X <x@y>',
    ].join('\n');
    assert.deepEqual(parseCoAuthors(log), ['Stark <stark@example.com>', 'Claude Opus 5.5 (1M context) <noreply@anthropic.com>']);
    assert.deepEqual(parseCoAuthors(''), []);
  });

  it('marks the conductor comments so a waiter can read its outcome', () => {
    assert.ok(landedComment({ trainNumber: 5, trainUrl: 'u', sha: 'abc' }).startsWith(LANDED_MARKER));
    assert.match(landedComment({ trainNumber: 5, trainUrl: 'u', sha: 'abc', branchKept: true }), /did \*\*not\*\* land/);
    const conflict = conflictComment({ ahead: [pr(7), pr(8)] });
    assert.ok(conflict.startsWith(EJECTED_MARKER));
    assert.match(conflict, /#7 #8, which are ahead of it/);
    assert.match(conflict, /docs-vault:resolve-conflicts/);
    assert.match(conflictComment({}), /merged onto `main`/);
    const red = ejectComment({ reason: 'train #9 failed with it alone.', failed: [{ name: 'MCP', conclusion: 'FAILURE', url: 'https://x/actions/runs/1' }], trainNumber: 9 });
    assert.match(red, /after train #9/);
    assert.match(red, /- MCP FAILURE https:\/\/x\/actions\/runs\/1/);
  });

  it('describes the train in flight', () => {
    const now = Date.parse('2026-09-26T11:00:00Z');
    assert.equal(describeTrain(null, now), 'between trains');
    assert.equal(describeTrain({ pr: 1999, components: [12, 13], startedAt: '2026-09-26T10:48:00Z' }, now), 'train #1999 carrying #12 #13, 12 min');
    assert.equal(describeTrain({ branch: 'train/x', components: [] }, now), 'train train/x carrying nothing yet');
  });
});

describe('a waiter reads its outcome from GitHub alone', () => {
  const since = '2026-09-26T10:00:00Z';
  const comment = (body, createdAt = '2026-09-26T10:30:00Z') => ({ body, createdAt });
  it('reports merged, landed through a train, and still queued', () => {
    assert.deepEqual(waiterOutcome({ pr: { state: 'MERGED' } }), { state: 'merged', exitCode: 0 });
    assert.equal(waiterOutcome({ pr: { state: 'CLOSED' }, comments: [comment(`${LANDED_MARKER}\nLanded`)], sinceIso: since }).state, 'landed');
    assert.equal(waiterOutcome({ pr: { state: 'OPEN', labels: [{ name: QUEUE_LABEL }] } }).exitCode, null);
  });

  it('fails on ejection, on a close without landing, and on a hand dequeue', () => {
    const ejected = waiterOutcome({ pr: { state: 'OPEN', labels: [] }, comments: [comment(`${EJECTED_MARKER}\nconflict`)], sinceIso: since });
    assert.deepEqual([ejected.state, ejected.exitCode], ['ejected', 1]);
    assert.equal(waiterOutcome({ pr: { state: 'CLOSED' }, comments: [], sinceIso: since }).state, 'closed');
    assert.equal(waiterOutcome({ pr: { state: 'OPEN', labels: [] }, comments: [] }).state, 'dequeued');
  });

  it('ignores an outcome comment older than this attempt', () => {
    const stale = [comment(`${EJECTED_MARKER}\nold`, '2026-09-25T10:00:00Z')];
    assert.equal(waiterOutcome({ pr: { state: 'OPEN', labels: [] }, comments: stale, sinceIso: since }).state, 'dequeued');
    const oldLanding = [comment(`${LANDED_MARKER}`, '2026-09-25T10:00:00Z')];
    assert.equal(waiterOutcome({ pr: { state: 'CLOSED' }, comments: oldLanding, sinceIso: since }).state, 'closed');
  });

  it('backs off with queue position to protect the shared REST budget', () => {
    assert.equal(waiterPollSeconds(1), 30);
    assert.equal(waiterPollSeconds(DEFAULT_BATCH), 30);
    assert.equal(waiterPollSeconds(DEFAULT_BATCH + 3), 60);
    assert.equal(waiterPollSeconds(400), 300);
    assert.equal(waiterPollSeconds(null), 30);
  });
});
