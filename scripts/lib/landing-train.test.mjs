import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_BATCH,
  EJECTED_MARKER,
  MIN_BATCH,
  MIN_HISTORY,
  RED_CLOSE_PREFIX,
  adaptiveBatch,
  describeTrains,
  estimateRedRate,
  maySpeculate,
  requeueAfterDiscard,
  trainHistoryRows,
  trainSizeFromTitle,
  EMPTY_BEFORE_REFIRE,
  LANDED_MARKER,
  QUEUE_LABEL,
  componentCommit,
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

  it('refuses a change that overlaps the speculative train, not only the head one', () => {
    const held = (trains) => ({ state: 'held', holder: { pr: 1900, train: trains[0], trains } });
    const head = { pr: 1900, files: ['src/b.ts'] };
    assert.equal(fastPathEligibility({ ...base, lock: held([head, { pr: 1901, files: ['src/c.ts'] }]) }).eligible, true);
    const overlap = fastPathEligibility({ ...base, lock: held([head, { pr: 1901, files: ['src/a.ts'] }]) });
    assert.deepEqual(failing(overlap), ['no-overlapping-train']);
    assert.match(overlap.rules.find((r) => r.rule === 'no-overlapping-train').detail, /the 2 trains in flight also change src\/a.ts/);
    // The speculative train is still assembling: nothing can be proven disjoint yet.
    assert.deepEqual(failing(fastPathEligibility({ ...base, lock: held([head, { pr: null, files: null }]) })), ['no-overlapping-train']);
    assert.equal(fastPathEligibility({ ...base, lock: held([]) }).eligible, true);
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

  it('turns one pull request into one commit: its title and number, its author, other authors as trailers', () => {
    const commit = componentCommit({
      component: { number: 12, title: 'feat: one' },
      coAuthors: ['Ada <ada@example.com>', 'Claude <noreply@anthropic.com>', 'ada <ADA@example.com>'],
    });
    assert.equal(commit.message, 'feat: one (#12)\n\nCo-authored-by: Claude <noreply@anthropic.com>');
    assert.deepEqual(commit.author, { name: 'Ada', email: 'ada@example.com' });
    assert.deepEqual(componentCommit({ component: { number: 3, title: '' } }), { message: 'Pull request #3 (#3)', author: null });
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

describe('the train size, measured from recent trains', () => {
  const trainPr = (number, title, state, comments = []) => ({ number, title, state, headRefName: `train/20260926T100000Z-${number}`, comments });

  it('counts the pull requests a train carried from its title', () => {
    assert.equal(trainSizeFromTitle('chore(train): land #1911'), 1);
    assert.equal(trainSizeFromTitle('chore(train): land #1889 #1890 #1891 #1892'), 4);
    assert.equal(trainSizeFromTitle('chore(train): land #1 #2 #3 and 17 more'), 20);
    assert.equal(trainSizeFromTitle('feat: something else'), 0);
  });

  it('reads merged trains as green and trains closed red as red, and ignores the rest', () => {
    const rows = trainHistoryRows([
      trainPr(1, 'chore(train): land #10 #11', 'MERGED'),
      trainPr(2, 'chore(train): land #12', 'CLOSED', [{ body: `${RED_CLOSE_PREFIX}Unit · Contract FAILURE; #12 is ejected from the queue.` }]),
      trainPr(3, 'chore(train): land #13', 'CLOSED', [{ body: 'Green, but main moved into src/a.ts while CI ran. Rebuilt on the new main.' }]),
      trainPr(4, 'chore(train): land #14', 'CLOSED', [{ body: 'Discarded: it was cut on top of train #2, which went red.' }]),
      trainPr(5, 'chore(train): land #15', 'OPEN'),
      { number: 6, title: 'chore(train): land #16', state: 'MERGED', headRefName: 'feat/not-a-train', comments: [] },
    ]);
    assert.deepEqual(rows, [{ number: 1, size: 2, red: false }, { number: 2, size: 1, red: true }]);
  });

  it('estimates the per-PR red rate by maximum likelihood', () => {
    assert.equal(estimateRedRate([{ size: 5, red: false }]), 0);
    // 12 of 20 ten-PR trains green: (1 - p)^10 = 0.6, so p = 1 - 0.6^0.1, about 5 %.
    const rows = [...Array(12).fill({ size: 10, red: false }), ...Array(8).fill({ size: 10, red: true })];
    assert.ok(Math.abs(estimateRedRate(rows) - (1 - 0.6 ** 0.1)) < 0.001);
  });

  it('chooses the largest train that is green at least half the time', () => {
    const rows = [...Array(12).fill({ size: 10, red: false }), ...Array(8).fill({ size: 10, red: true })];
    const choice = adaptiveBatch(rows);
    assert.equal(choice.size, 13, 'floor(ln 0.5 / ln 0.95) at p = 5 %');
    assert.ok((1 - choice.p) ** choice.size >= 0.5);
    assert.match(choice.reason, /20 recent train\(s\), 8 red; about 5\.0 % of pull requests break a train, so a train of 13 is green about 5\d % of the time/);
  });

  it('keeps the default with too little history or no red train, and never goes below two', () => {
    const few = adaptiveBatch(Array(MIN_HISTORY - 1).fill({ size: 1, red: true }));
    assert.equal(few.size, DEFAULT_BATCH);
    assert.match(few.reason, /fewer than 8 to measure a red rate/);
    assert.equal(adaptiveBatch(Array(30).fill({ size: 20, red: false })).size, DEFAULT_BATCH);
    assert.equal(adaptiveBatch(Array(30).fill({ size: 1, red: true })).size, MIN_BATCH);
  });
});

describe('speculation', () => {
  const parent = { pr: 2001, head: 'abc', verdict: null };
  it('cuts a second train only on an open, unfailed parent, with a free slot', () => {
    assert.equal(maySpeculate({ inFlight: 1, parent }), true);
    assert.equal(maySpeculate({ inFlight: 1, parent: { ...parent, verdict: { kind: 'green' } } }), true);
    assert.equal(maySpeculate({ inFlight: 1, parent: { ...parent, verdict: { kind: 'red' } } }), false);
    assert.equal(maySpeculate({ inFlight: 2, parent }), false, 'at most two trains in flight');
    assert.equal(maySpeculate({ inFlight: 1, parent, enabled: false }), false);
    assert.equal(maySpeculate({ inFlight: 1, parent, blockedOn: 2001 }), false, 'a cut that opened nothing waits for the parent');
    assert.equal(maySpeculate({ inFlight: 1, parent: { ...parent, head: null } }), false);
  });

  it('puts a discarded split half back behind the failed train\'s own halves', () => {
    const discarded = [{ source: 'split', numbers: [3, 4] }];
    assert.deepEqual(requeueAfterDiscard({ splits: [[5]], headSplits: [[1], [2]], discarded }), [[1], [2], [3, 4], [5]]);
    // A speculative train cut from the queue needs nothing: its pull requests are still queued.
    assert.deepEqual(requeueAfterDiscard({ splits: [], headSplits: [[1], [2]], discarded: [{ source: 'queue', numbers: [3] }] }), [[1], [2]]);
  });

  it('describes both trains in flight', () => {
    const now = Date.parse('2026-09-26T11:00:00Z');
    const payload = { trains: [{ pr: 2001, components: [1] }, { pr: 2002, onTopOf: 2001, components: [2, 3] }] };
    assert.equal(describeTrains(payload, now), 'train #2001 carrying #1; train #2002 on top of train #2001 carrying #2 #3');
    assert.equal(describeTrains({ train: null }, now), 'between trains');
    assert.equal(describeTrains({ trains: [] }, now), 'between trains');
  });
});
