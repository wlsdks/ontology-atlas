import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CONFLICT_INSTRUCTION,
  FAST_LOCK_REF,
  LEASE_MINUTES,
  LOCK_REF,
  classifyHolderLiveness,
  classifyLock,
  conduct,
  describeCleanup,
  lockTrains,
  describeLock,
  otherCheckState,
  parseArgs,
  parseLockToken,
  protectionFrom,
  readOutcome,
  refuseLanding,
  requiredCheckState,
  runInFlight,
  runPrLand,
  worktreeToRemove,
} from './pr-land.mjs';
import { EJECTED_MARKER, LANDED_MARKER, QUEUE_LABEL, RED_CLOSE_PREFIX, trainCiStep } from './lib/landing-train.mjs';

/**
 * The landing train, driven by `gh` output recorded from this repository and by a fake GitHub.
 * No network: every input here is a literal or the in-memory world below, which is the only way
 * this suite can run in the same lane as the gates it guards.
 *
 * The recorded rollup is PR #1572's: eleven contexts reported, eight of them required, and one of
 * the eight (`Unit · Contract`) red. A lander that read "eleven checks, ten green" would merge it.
 */
const REQUIRED_CONTEXTS = [
  'Types · Lint · Docs',
  'Unit · Contract',
  'MCP',
  'Playwright (static export)',
  'Playwright (web surface)',
  'Playwright (chromium 1/3)',
  'Playwright (chromium 2/3)',
  'Playwright (chromium 3/3)',
];

const RECORDED_ROLLUP = [
  { __typename: 'CheckRun', name: 'Check impact plan', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'Checks' },
  { __typename: 'CheckRun', name: 'E2E impact plan', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'E2E smoke' },
  { __typename: 'CheckRun', name: 'Vault freshness check', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'Vault freshness' },
  { __typename: 'CheckRun', name: 'Types · Lint · Docs', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'Checks' },
  { __typename: 'CheckRun', name: 'Playwright (static export)', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'E2E smoke' },
  {
    __typename: 'CheckRun',
    name: 'Unit · Contract',
    status: 'COMPLETED',
    conclusion: 'FAILURE',
    detailsUrl: 'https://github.com/wlsdks/ontology-atlas/actions/runs/34686397014/job/103534040573',
    workflowName: 'Checks',
  },
  { __typename: 'CheckRun', name: 'Playwright (web surface)', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'E2E smoke' },
  { __typename: 'CheckRun', name: 'MCP', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'Checks' },
  { __typename: 'CheckRun', name: 'Playwright (chromium 1/3)', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'E2E smoke' },
  { __typename: 'CheckRun', name: 'Playwright (chromium 2/3)', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'E2E smoke' },
  { __typename: 'CheckRun', name: 'Playwright (chromium 3/3)', status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'E2E smoke' },
];

const GREEN_ROLLUP = RECORDED_ROLLUP.map((run) =>
  run.name === 'Unit · Contract' ? { ...run, conclusion: 'SUCCESS', detailsUrl: undefined } : run,
);

/**
 * What a draft pull request's checks look like: every job carries
 * `github.event.pull_request.draft == false`, so GitHub reports them `skipped`, and branch
 * protection counts a skipped job as satisfied.
 */
const DRAFT_ROLLUP = REQUIRED_CONTEXTS.map((name) => ({
  __typename: 'CheckRun',
  name,
  status: 'COMPLETED',
  conclusion: 'SKIPPED',
}));

/** `gh pr view 1572 --json ...`, recorded. */
const RECORDED_PR = {
  baseRefName: 'main',
  headRefName: 'fix/route-arrival-flicker',
  headRefOid: 'f52a59c49a139c9edcfdcedc00464bd163081643',
  isCrossRepository: false,
  isDraft: false,
  mergeStateStatus: 'BLOCKED',
  mergeable: 'MERGEABLE',
  number: 1572,
  state: 'OPEN',
  statusCheckRollup: RECORDED_ROLLUP,
  title: 'fix(app): the right pane arrives painted, without a flash, on every rail transition',
  url: 'https://github.com/wlsdks/ontology-atlas/pull/1572',
};

const readyPr = (overrides = {}) => ({
  ...RECORDED_PR,
  isDraft: false,
  mergeStateStatus: 'CLEAN',
  statusCheckRollup: GREEN_ROLLUP,
  ...overrides,
});

const NOW = Date.parse('2026-09-12T12:00:00Z');

/** The train's CI verdict for a rollup, the way the conductor reads it. */
const trainStep = (rollup, extra = {}) => trainCiStep({
  checks: requiredCheckState({ rollup, requiredContexts: REQUIRED_CONTEXTS }),
  other: otherCheckState({ rollup, requiredContexts: REQUIRED_CONTEXTS, allowFailing: extra.allowFailing ?? [] }),
  inFlight: runInFlight({ statusCheckRollup: rollup }),
  emptyRollupObservations: extra.empty ?? 0,
  refires: extra.refires ?? 0,
});

describe('pr:land argument parsing', () => {
  it('reads a number with or without a hash', () => {
    assert.equal(parseArgs(['1572']).number, 1572);
    assert.equal(parseArgs(['#1572']).number, 1572);
    assert.equal(parseArgs(['--', '1572']).number, 1572);
  });

  it('reads the train, fast-path and waiting options', () => {
    const args = parseArgs(['12', '--batch=5', '--no-wait', '--no-fast', '--no-speculate', '--flaky=A,B', '--allow-failing=C']);
    assert.deepEqual([args.batch, args.wait, args.fast, args.speculate, args.flaky, args.allowFailing], [5, false, false, false, ['A', 'B'], ['C']]);
    const defaults = parseArgs(['12']);
    // No --batch: the conductor measures the size from recent trains.
    assert.deepEqual([defaults.batch, defaults.wait, defaults.fast, defaults.speculate], [null, true, true, true]);
    assert.throws(() => parseArgs(['12', '--batch=0']), /positive integer/);
    assert.throws(() => parseArgs(['12', '--flaky=']), /must name at least one/);
  });

  it('plans several pull requests, but lands one per command', () => {
    assert.deepEqual(parseArgs(['--plan', '12', '#13']).numbers, [12, 13]);
    assert.throws(() => parseArgs(['--plan']), /--plan needs/);
    assert.throws(() => parseArgs(['12', '13']), /one pull request per command/);
  });

  it('needs no number to show the queue, release the lock, or conduct', () => {
    assert.equal(parseArgs(['--queue']).queue, true);
    assert.equal(parseArgs(['--release']).release, true);
    assert.equal(parseArgs(['--conduct']).conduct, true);
    assert.equal(parseArgs(['--ci', '1572']).ci, true);
    assert.throws(() => parseArgs(['--ci']), /pull request number/);
    assert.throws(() => parseArgs(['--queue', '--conduct']), /separate commands/);
  });

  it('accepts the retired flags with a note instead of failing a landing that names them', () => {
    const args = parseArgs(['12', '--parallel-ci', '--worktree', '/tmp/wt']);
    assert.equal(args.number, 12);
    assert.equal(args.notes.length, 2);
    assert.match(args.notes.join('\n'), /--parallel-ci is retired/);
    assert.match(args.notes.join('\n'), /--worktree is retired/);
  });

  /**
   * ⚠️ **`--worktree` removes nothing, in either spelling.** On 2026-09-13 an agent believed a
   * landing had deleted its `--worktree` path; it had not. Removal is `--cleanup`'s alone.
   */
  it('removes a worktree only when --cleanup asks, never for --worktree', () => {
    assert.equal(worktreeToRemove(parseArgs(['12', '--worktree', '/tmp/wt'])), null);
    assert.equal(worktreeToRemove(parseArgs(['12', '--worktree=/tmp/wt'])), null);
    assert.equal(worktreeToRemove(parseArgs(['12', '--cleanup', '/tmp/wt'])), '/tmp/wt');
    assert.equal(worktreeToRemove(parseArgs(['12', '--cleanup=/tmp/wt'])), '/tmp/wt');
    assert.equal(worktreeToRemove(parseArgs(['12'])), null);
  });

  it('announces the path and the judgement before removing anything', () => {
    assert.match(describeCleanup({ path: '/tmp/wt', status: '' }), /ignored files are not counted/);
    assert.equal(describeCleanup({ path: '/tmp/wt', status: ' M src/a.ts' }), '/tmp/wt still has uncommitted work; left alone');
    assert.equal(describeCleanup({ path: '/tmp/nope', status: null }), '/tmp/nope is not a Git worktree; left alone');
  });

  it('refuses a landing with no pull request named', () => {
    assert.throws(() => parseArgs([]), /pull request number is required/);
    assert.throws(() => parseArgs(['--cleanup']), /needs a worktree path/);
    assert.throws(() => parseArgs(['--worktree']), /needs a path/);
    assert.throws(() => parseArgs(['12', '--force']), /unknown argument/);
    assert.throws(() => parseArgs(['12', '--timeout-minutes=0']), /must be positive/);
  });
});

describe('pr:land refusals', () => {
  it('lands only an open pull request against main', () => {
    assert.equal(refuseLanding(readyPr()), null);
    assert.match(refuseLanding({ ...RECORDED_PR, state: 'CLOSED' }), /is closed, not open/);
    assert.match(refuseLanding({ ...RECORDED_PR, state: 'MERGED' }), /is merged, not open/);
    assert.match(refuseLanding({ ...RECORDED_PR, baseRefName: 'release' }), /targets release, not main/);
    assert.match(refuseLanding({ ...RECORDED_PR, headRefName: 'train/20260926T101530Z-1' }), /is a landing train/);
  });

  it('hands a conflict back to the author before queueing it', () => {
    const dirty = refuseLanding({ ...RECORDED_PR, mergeStateStatus: 'DIRTY' });
    assert.equal(dirty, CONFLICT_INSTRUCTION);
    assert.match(dirty, /git fetch origin && git merge origin\/main/);
    assert.match(dirty, /pnpm pr:land <number>/);
    assert.match(dirty, /It was not queued/);
    assert.match(dirty, /pnpm docs-vault:resolve-conflicts/);
    assert.equal(refuseLanding({ ...RECORDED_PR, mergeable: 'CONFLICTING' }), CONFLICT_INSTRUCTION);
  });

  it('leaves a fork pull request to a person', () => {
    assert.match(refuseLanding({ ...readyPr(), isCrossRepository: true }), /fork/);
  });
});

describe('the landing lock', () => {
  it('names one ref for trains and one for fast-path merges', () => {
    assert.equal(LOCK_REF, 'refs/atlas/landing-lock');
    assert.equal(FAST_LOCK_REF, 'refs/atlas/landing-fast');
  });

  it('reads a fresh lock as held and an unrefreshed one as stale', () => {
    const payload = { pr: 1570, holder: 'stark', host: 'mbp', acquiredAt: '2026-09-12T11:58:00Z', leaseMinutes: LEASE_MINUTES };
    const held = classifyLock({ payload, nowMs: NOW });
    assert.equal(held.state, 'held');
    assert.equal(Math.round(held.ageMinutes), 2);
    assert.equal(Math.round(held.expiresInMinutes), 43);
    assert.equal(classifyLock({ payload: { ...payload, acquiredAt: '2026-09-12T11:00:00Z' }, nowMs: NOW }).state, 'stale');
  });

  it('treats a lock it cannot parse as taken, not as an open door', () => {
    assert.equal(classifyLock({ payload: {}, nowMs: NOW }).state, 'unreadable');
    assert.equal(classifyLock({ payload: { pr: 'twelve' }, nowMs: NOW }).state, 'unreadable');
    assert.equal(classifyLock({ payload: null, nowMs: NOW }).state, 'free');
  });

  /*
   * An older `pr:land` still running in another session classifies the lock itself. It treats a
   * payload with no numeric `pr` as unreadable and takes it over at once, so a conductor's payload
   * must keep a number there even between trains.
   */
  it('keeps a conductor lock readable by the per-PR pr:land that may still be running elsewhere', () => {
    const between = { pr: 0, token: 't', acquiredAt: '2026-09-12T11:59:00Z', train: null };
    assert.equal(classifyLock({ payload: between, nowMs: NOW, liveness: () => 'unknown' }).state, 'held');
    const riding = { pr: 1999, token: 't', holder: 'stark', host: 'mbp', acquiredAt: '2026-09-12T11:59:00Z', train: { pr: 1999, components: [12, 13], startedAt: '2026-09-12T11:50:00Z' } };
    assert.match(describeLock(classifyLock({ payload: riding, nowMs: NOW, liveness: () => 'unknown' }), NOW), /^train #1999 carrying #12 #13, 10 min held by stark@mbp/);
  });

  /*
   * Observed on 2026-09-19: the REST quota reached 0/5000 and `pnpm pr:queue` printed `nothing is
   * landing` while a lock was held and refreshed every minute. An answer that arrived versus a
   * read that never did.
   */
  it('does not render a read that failed as an open door', () => {
    const failure = { reason: 'rate-limited', detail: 'the shared GitHub REST quota is exhausted' };
    const lock = classifyLock({ payload: null, unreadable: failure, nowMs: NOW });
    assert.equal(lock.state, 'unknown');
    assert.match(describeLock(lock), /could not be read: the shared GitHub REST quota is exhausted/);
  });

  it('tells a ref that is absent from a request that did not happen', () => {
    assert.deepEqual(readOutcome({ failed: true, output: 'gh: Not Found (HTTP 404)' }), { value: null, failure: null });
    assert.equal(readOutcome({ failed: true, output: '{"message":"API rate limit exceeded for user ID 1"}' }).failure.reason, 'rate-limited');
    assert.equal(readOutcome({ failed: true, output: 'dial tcp: lookup api.github.com: no such host' }).failure.reason, 'unreachable');
    assert.deepEqual(readOutcome('{"object":{"sha":"abc"}}').value, { object: { sha: 'abc' } });
  });

  it('never lets a failed read accuse main of having no gate', () => {
    assert.equal(protectionFrom(readOutcome({ failed: true, output: 'API rate limit exceeded' })).contexts, null);
    assert.equal(protectionFrom(readOutcome({ failed: true, output: 'gh: Not Found (HTTP 404)' })).contexts, null);
    assert.deepEqual(protectionFrom(readOutcome('{"contexts":["Unit · Contract"]}')).contexts, ['Unit · Contract']);
  });

  it('honours a lease the holder wrote, not only the default', () => {
    assert.equal(classifyLock({ payload: { pr: 1, acquiredAt: '2026-09-12T11:50:00Z', leaseMinutes: 5 }, nowMs: NOW }).state, 'stale');
  });

  it('reads the machine and the process out of a token, right to left', () => {
    assert.deepEqual(parseLockToken('mbp-pro-local-12426-1789854745891'), { host: 'mbp-pro-local', pid: 12426 });
    assert.equal(parseLockToken('me'), null);
    assert.equal(parseLockToken('mbp-notapid-1789854745891'), null);
    assert.equal(parseLockToken(undefined), null);
  });

  it('proves a holder dead only on this machine, and only by its command line', () => {
    const token = 'mbp-4242-1789854745891';
    assert.equal(classifyHolderLiveness({ token }, { host: 'mbp', readProcessCommand: () => 'node /repo/scripts/pr-land.mjs 1704' }), 'alive');
    assert.equal(classifyHolderLiveness({ token }, { host: 'mbp', readProcessCommand: () => '' }), 'dead');
    assert.equal(classifyHolderLiveness({ token }, { host: 'mbp', readProcessCommand: () => '/usr/bin/vim notes.md' }), 'dead');
    assert.equal(classifyHolderLiveness({ token }, { host: 'other', readProcessCommand: () => '' }), 'unknown');
  });

  it('frees a lock whose process is gone without waiting out the lease', () => {
    const payload = { pr: 1727, holder: 'stark', host: 'mbp', acquiredAt: '2026-09-12T11:58:00Z' };
    const dead = classifyLock({ payload, nowMs: NOW, liveness: () => 'dead' });
    assert.equal(dead.state, 'stale');
    assert.ok(dead.expiresInMinutes > 0, 'the lease has not run out — liveness is what freed it');
    assert.equal(classifyLock({ payload, nowMs: NOW, liveness: () => 'alive' }).state, 'held');
    assert.equal(classifyLock({ payload, nowMs: NOW, liveness: () => 'unknown' }).state, 'held');
  });

  it('says who holds it and for how long, and why a stale one is free', () => {
    const payload = { pr: 1570, holder: 'stark', host: 'mbp', acquiredAt: '2026-09-12T11:30:00Z' };
    assert.match(describeLock(classifyLock({ payload, nowMs: NOW })), /PR #1570 held by stark@mbp since 30 min ago/);
    assert.match(describeLock(classifyLock({ payload: null, nowMs: NOW })), /nothing is landing/);
    assert.match(describeLock(classifyLock({ payload, nowMs: NOW, liveness: () => 'dead' })), /its process is gone/);
  });
});

describe('the required contexts, read from the protection', () => {
  it('is red when one required context failed, even with ten green ones', () => {
    const verdict = requiredCheckState({ rollup: RECORDED_ROLLUP, requiredContexts: REQUIRED_CONTEXTS });
    assert.equal(verdict.state, 'failed');
    assert.deepEqual(verdict.failed.map((check) => check.name), ['Unit · Contract']);
    assert.match(verdict.failed[0].url, /actions\/runs\//);
  });

  /**
   * **The state that wedged the repository** (PR #1578, 2026-09-12). Every context reports twice,
   * `SKIPPED` as a draft and then for real; keeping whichever came last read a real FAILURE as
   * "never ran" and polled for 45 minutes.
   */
  it('resolves a name that reported twice, so a draft skip cannot bury a real failure', () => {
    const draftTwin = (name) => ({ name, status: 'COMPLETED', conclusion: 'SKIPPED', startedAt: '2026-09-12T13:20:00Z', completedAt: '2026-09-12T13:20:01Z' });
    const real = (name, conclusion) => ({
      name, status: 'COMPLETED', conclusion, startedAt: '2026-09-12T13:38:00Z', completedAt: '2026-09-12T13:42:30Z',
      detailsUrl: 'https://github.com/wlsdks/ontology-atlas/actions/runs/34696960152/job/1',
    });
    const mixed = [
      real('Unit · Contract', 'FAILURE'),
      ...REQUIRED_CONTEXTS.filter((name) => name !== 'Unit · Contract').map((name) => real(name, 'SUCCESS')),
      ...REQUIRED_CONTEXTS.map(draftTwin),
      draftTwin('Playwright (chromium ${{ matrix.shard }}/3)'),
    ];
    for (const rollup of [mixed, [...mixed].reverse()]) {
      const verdict = requiredCheckState({ rollup, requiredContexts: REQUIRED_CONTEXTS });
      assert.equal(verdict.state, 'failed', 'a real failure must end the train, not poll');
      assert.deepEqual(verdict.failed.map((check) => check.name), ['Unit · Contract']);
      assert.deepEqual(verdict.skipped, []);
    }
  });

  /**
   * **A landing aborted on its own superseded run** (#1578). A cancelled run and a newer live run
   * for the same name: recency settles it, by `startedAt`.
   */
  it('treats a cancelled context as pending when a newer run for the same head is live', () => {
    const superseded = (name) => ({ name, status: 'COMPLETED', conclusion: 'CANCELLED', startedAt: '2026-09-12T14:34:27Z', completedAt: '2026-09-12T14:34:27Z' });
    const live = (name) => ({ name, status: 'IN_PROGRESS', conclusion: null, startedAt: '2026-09-12T14:34:55Z', completedAt: '0001-01-01T00:00:00Z' });
    const rollup = REQUIRED_CONTEXTS.flatMap((name) => [superseded(name), live(name)]);
    assert.equal(requiredCheckState({ rollup, requiredContexts: REQUIRED_CONTEXTS }).state, 'waiting');
    assert.equal(requiredCheckState({ rollup: [...rollup].reverse(), requiredContexts: REQUIRED_CONTEXTS }).state, 'waiting');
    assert.equal(requiredCheckState({ rollup: REQUIRED_CONTEXTS.map(superseded), requiredContexts: REQUIRED_CONTEXTS }).state, 'failed');
  });

  it('takes the later of two real verdicts, which is what a rerun means', () => {
    const first = { name: 'MCP', status: 'COMPLETED', conclusion: 'FAILURE', completedAt: '2026-09-12T13:00:00Z' };
    const rerun = { name: 'MCP', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-09-12T14:00:00Z' };
    const rest = GREEN_ROLLUP.filter((run) => run.name !== 'MCP');
    assert.equal(requiredCheckState({ rollup: [...rest, first, rerun], requiredContexts: REQUIRED_CONTEXTS }).state, 'green');
    assert.equal(requiredCheckState({ rollup: [...rest, rerun, first], requiredContexts: REQUIRED_CONTEXTS }).state, 'green');
  });

  it('ends on a cancelled required context, not only a failed one', () => {
    const rollup = GREEN_ROLLUP.map((run) => (run.name === 'Unit · Contract' ? { ...run, conclusion: 'CANCELLED' } : run));
    assert.deepEqual(requiredCheckState({ rollup, requiredContexts: REQUIRED_CONTEXTS }).failed.map((c) => c.conclusion), ['CANCELLED']);
  });

  it('refuses a draft skip as green, because a skipped job executed no line', () => {
    const verdict = requiredCheckState({ rollup: DRAFT_ROLLUP, requiredContexts: REQUIRED_CONTEXTS });
    assert.equal(verdict.state, 'waiting');
    assert.equal(verdict.skipped.length, 8);
    assert.equal(verdict.neverRan, true);
  });

  it('waits for a running context and for one that has not reported at all', () => {
    const running = GREEN_ROLLUP.map((run) => (run.name === 'MCP' ? { ...run, status: 'IN_PROGRESS', conclusion: null } : run));
    assert.deepEqual(requiredCheckState({ rollup: running, requiredContexts: REQUIRED_CONTEXTS }).pending, ['MCP']);
    const silent = requiredCheckState({ rollup: GREEN_ROLLUP.filter((run) => run.name !== 'MCP'), requiredContexts: REQUIRED_CONTEXTS });
    assert.deepEqual(silent.missing, ['MCP']);
  });

  it('does not ask GitHub again while a run is on its way', () => {
    const queued = { name: 'MCP', status: 'QUEUED', conclusion: null, startedAt: '2026-09-12T14:34:11Z' };
    assert.equal(runInFlight({ statusCheckRollup: [queued] }), true);
    assert.equal(runInFlight({ statusCheckRollup: [] }), false);
    assert.equal(trainStep([queued], { empty: 0 }).action, 'wait');
    // An empty rollup is the gap between opening the train and GitHub registering its run set.
    assert.equal(trainStep([], { empty: 1 }).action, 'wait');
    assert.equal(trainStep([], { empty: 4 }).action, 'refire');
    assert.equal(trainStep([], { empty: 9, refires: 1 }).action, 'wait');
  });

  it('ignores a green check nobody required', () => {
    const verdict = requiredCheckState({
      rollup: [...GREEN_ROLLUP, { name: 'Verify unsigned Windows x64 beta', status: 'IN_PROGRESS', conclusion: null }],
      requiredContexts: REQUIRED_CONTEXTS,
    });
    assert.equal(verdict.state, 'green');
  });
});

/** **The Windows lane that was red for three landings** (recorded 2026-09-13). */
const ROLLUP_WITH_RED_UNREQUIRED = [
  ...REQUIRED_CONTEXTS.map((name) => ({ __typename: 'CheckRun', name, status: 'COMPLETED', conclusion: 'SUCCESS', workflowName: 'Checks' })),
  {
    __typename: 'CheckRun',
    name: 'Verify unsigned Windows x64 beta',
    status: 'COMPLETED',
    conclusion: 'FAILURE',
    detailsUrl: 'https://github.com/wlsdks/ontology-atlas/actions/runs/34720027112/job/103625133745',
    workflowName: 'Windows x64 Beta Check',
  },
];

describe('checks main does not require', () => {
  it('reads a red unrequired lane as a red train, naming it with its job URL', () => {
    const verdict = otherCheckState({ rollup: ROLLUP_WITH_RED_UNREQUIRED, requiredContexts: REQUIRED_CONTEXTS });
    assert.deepEqual(verdict.failed.map((c) => c.name), ['Verify unsigned Windows x64 beta']);
    assert.match(verdict.failed[0].url, /34720027112/);
    assert.equal(requiredCheckState({ rollup: ROLLUP_WITH_RED_UNREQUIRED, requiredContexts: REQUIRED_CONTEXTS }).state, 'green');
    assert.equal(trainStep(ROLLUP_WITH_RED_UNREQUIRED).action, 'red');
  });

  it('lands when the failing lane is accepted by name', () => {
    assert.equal(trainStep(ROLLUP_WITH_RED_UNREQUIRED, { allowFailing: ['Verify unsigned Windows x64 beta'] }).action, 'green');
  });

  it('refuses a red required context however it is named, so the escape cannot reach one', () => {
    for (const allowFailing of [[], ['Unit · Contract']]) {
      assert.equal(trainStep(RECORDED_ROLLUP, { allowFailing }).action, 'red');
    }
  });

  it('treats a skipped or still-running unrequired lane as no failure', () => {
    const rollup = [
      ...REQUIRED_CONTEXTS.map((name) => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS' })),
      { name: 'inactive lane', status: 'COMPLETED', conclusion: 'SKIPPED' },
      { name: 'still going', status: 'IN_PROGRESS', conclusion: '' },
    ];
    assert.equal(otherCheckState({ rollup, requiredContexts: REQUIRED_CONTEXTS }).state, 'clear');
  });
});

/*
 * ------------------------------------------------------------------------------------------------
 * The conductor against a fake GitHub. Every `gh` and `git` call lands in memory; a write the
 * scenario does not expect is visible in `world.calls`.
 * ------------------------------------------------------------------------------------------------
 */

const green = () => REQUIRED_CONTEXTS.map((name) => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-09-26T10:00:00Z' }));
const red = (names, runId = 777) => REQUIRED_CONTEXTS.map((name) => ({
  name,
  status: 'COMPLETED',
  conclusion: names.includes(name) ? 'FAILURE' : 'SUCCESS',
  startedAt: '2026-09-26T10:00:00Z',
  detailsUrl: `https://github.com/wlsdks/ontology-atlas/actions/runs/${runId}/job/1`,
}));

function component(number, extra = {}) {
  return {
    number,
    title: `feat: change ${number}`,
    url: `https://github.com/wlsdks/ontology-atlas/pull/${number}`,
    state: 'OPEN',
    isDraft: true,
    mergeable: 'MERGEABLE',
    isCrossRepository: false,
    baseRefName: 'main',
    headRefName: `feat/change-${number}`,
    headRefOid: `${number}`.padEnd(40, 'c'),
    statusCheckRollup: DRAFT_ROLLUP,
    files: [`src/change-${number}.ts`],
    ...extra,
  };
}

/**
 * An in-memory GitHub and Git.
 *
 * - `ci(numbers, reruns)` decides a train's rollup from the components it carries.
 * - `conflicts` is the set of component numbers whose merge onto a train answers 409.
 * - `mainDrift(trainIndex)` is the files `main` changed under the n-th train while its CI ran.
 * - `readOnly` makes every write throw, for `--plan`.
 */
function fakeWorld({ prs = [], queued = [], ci = () => green(), conflicts = new Set(), mainDrift = () => [], lock = null, readOnly = false, history = [] } = {}) {
  const calls = [];
  const events = [];
  let clock = Date.parse('2026-09-26T10:00:00Z');
  let labelSeq = 0;
  let nextNumber = 2000;
  const pulls = new Map(prs.map((pr) => [pr.number, { ...pr, labels: [], comments: [] }]));
  for (const number of queued) {
    const pr = pulls.get(number);
    pr.labels = [{ name: QUEUE_LABEL }];
    pr.queuedAt = new Date(clock + (labelSeq += 1)).toISOString();
  }
  const locks = new Map(lock ? [[LOCK_REF, lock]] : []);
  const trains = new Map();
  const branchTrain = new Map();
  const branchBase = new Map();
  let trainCount = 0;
  const write = (name, fn) => (...args) => {
    calls.push([name, ...args]);
    if (readOnly) throw new Error(`--plan wrote to GitHub: ${name}`);
    return fn(...args);
  };
  const view = (pr) => {
    const train = trains.get(pr.number);
    const rollup = train ? (train.rollup ?? []) : pr.statusCheckRollup;
    return { ...pr, statusCheckRollup: rollup };
  };

  const gh = {
    readPr: (number) => {
      calls.push(['readPr', number]);
      const pr = pulls.get(number);
      const train = trains.get(number);
      if (train && pr.state === 'OPEN') {
        train.polls += 1;
        // The first poll sees nothing yet; the next one sees the verdict.
        if (train.polls >= 2) train.rollup = ci(train.components, train.reruns);
      }
      return view(pr);
    },
    readPrComments: (number) => pulls.get(number).comments,
    listQueue: () => [...pulls.values()]
      .filter((pr) => pr.state === 'OPEN' && pr.labels.some((l) => l.name === QUEUE_LABEL))
      .sort((a, b) => Date.parse(a.queuedAt) - Date.parse(b.queuedAt))
      .map((pr) => ({ ...pr })),
    readRequiredContexts: () => ({ contexts: REQUIRED_CONTEXTS, failure: null }),
    listTrainHistory: () => history,
    readLock: (ref) => ({ payload: locks.get(ref) ?? null, unreadable: null }),
    takeLock: write('takeLock', (ref, body, { force = false } = {}) => {
      if (locks.has(ref) && !force) return false;
      locks.set(ref, body);
      events.push(`take ${ref}`);
      return true;
    }),
    refreshLock: write('refreshLock', (ref, body) => {
      locks.set(ref, body);
      events.push('refresh');
    }),
    releaseLock: write('releaseLock', (ref) => {
      locks.delete(ref);
      events.push(`release ${ref}`);
      return true;
    }),
    addLabel: write('addLabel', (number) => {
      const pr = pulls.get(number);
      pr.labels = [{ name: QUEUE_LABEL }];
      pr.queuedAt = new Date(clock + (labelSeq += 1)).toISOString();
      return true;
    }),
    removeLabel: write('removeLabel', (number) => {
      pulls.get(number).labels = [];
      return true;
    }),
    comment: write('comment', (number, body) => {
      pulls.get(number).comments.push({ body, createdAt: new Date(clock).toISOString() });
      return true;
    }),
    closePr: write('closePr', (number, body) => {
      const pr = pulls.get(number);
      pr.comments.push({ body, createdAt: new Date(clock).toISOString() });
      if (pr.state === 'OPEN') pr.state = 'CLOSED';
      return true;
    }),
    createBranch: write('createBranch', (branch, sha) => {
      branchBase.set(branch, sha);
      return true;
    }),
    deleteBranch: write('deleteBranch', () => true),
    mergeInto: write('mergeInto', (branch, sha) => {
      const pr = [...pulls.values()].find((p) => p.headRefOid === sha);
      if (conflicts.has(pr.number)) return { state: 'conflict', detail: 'HTTP 409: Merge conflict' };
      branchTrain.set(branch, [...(branchTrain.get(branch) ?? []), pr.number]);
      return { state: 'merged' };
    }),
    openPr: write('openPr', ({ title, head, body }) => {
      const number = (nextNumber += 1);
      trainCount += 1;
      pulls.set(number, {
        number, title, body, state: 'OPEN', isDraft: false, headRefName: head, headRefOid: `train-head-${number}`,
        url: `https://github.com/wlsdks/ontology-atlas/pull/${number}`, labels: [], comments: [],
      });
      trains.set(number, { number, components: branchTrain.get(head) ?? [], base: branchBase.get(head), polls: 0, reruns: 0, index: trainCount, rollup: [] });
      return { number, url: `https://github.com/wlsdks/ontology-atlas/pull/${number}` };
    }),
    mergePr: write('mergePr', (number) => {
      const pr = pulls.get(number);
      pr.state = 'MERGED';
      return { ok: true, detail: '{"merged":true}' };
    }),
    markReady: write('markReady', (number) => {
      pulls.get(number).isDraft = false;
      return true;
    }),
    markDraft: write('markDraft', () => true),
    rerunFailed: write('rerunFailed', (runId) => {
      for (const train of trains.values()) if (train.rollup?.some((r) => String(r.detailsUrl ?? '').includes(`/runs/${runId}/`))) {
        // A rerun replaces the failed verdicts with runs in flight until the new verdict lands.
        train.reruns += 1;
        train.polls = 0;
        train.rollup = train.rollup.map((run) => (run.conclusion === 'FAILURE' ? { ...run, status: 'IN_PROGRESS', conclusion: null, startedAt: '2026-09-26T11:00:00Z' } : run));
      }
      return true;
    }),
  };

  const byHead = (ref) => [...pulls.values()].find((pr) => `origin/${pr.headRefName}` === ref || pr.headRefOid === ref);
  const git = {
    fetch: () => true,
    prune: () => true,
    revParse: (ref) => {
      if (ref === 'origin/main') return 'main'.padEnd(40, '0');
      if (ref.startsWith('origin/train/')) return `head:${ref.slice('origin/'.length)}`;
      return byHead(ref)?.headRefOid ?? null;
    },
    hasCommit: () => true,
    mergeTreeClean: () => true,
    mergeBase: () => 'base'.padEnd(40, '0'),
    diffNames: (from, to) => {
      if (to === 'origin/main' || to === 'main'.padEnd(40, '0')) {
        // The drift under the open train cut from `from`: main's own sha, or a train head.
        const open = [...trains.values()].filter((t) => pulls.get(t.number).state === 'OPEN');
        const current = open.find((t) => t.base === from) ?? [...trains.values()].at(-1);
        return current ? mainDrift(current.index) : [];
      }
      if (to.startsWith('head:')) return (branchTrain.get(to.slice('head:'.length)) ?? []).flatMap((n) => pulls.get(n).files);
      return [];
    },
    diffNameStatus: (base, sha) => (byHead(sha)?.files ?? []).map((path) => ({ status: 'M', path })),
    isContained: () => false,
    isAncestor: () => true,
    coAuthorLog: (base, sha) => `Co-authored-by: Author ${byHead(sha)?.number} <a${byHead(sha)?.number}@example.com>\nfeat: something\n`,
    trialMerge: (base, shas) => shas.map((sha) => ({ sha, state: 'pending', conflicts: conflicts.has(byHead(sha)?.number) ? ['src/shared.ts'] : [] })),
  };
  // The contained check the conductor makes on the train head: true once that train merged.
  git.isContained = (base, sha) => String(sha).startsWith('train-head-') && pulls.get(Number(String(sha).slice('train-head-'.length)))?.state === 'MERGED';

  const out = [];
  const deps = {
    gh,
    git,
    now: () => clock,
    sleep: (seconds) => {
      events.push('sleep');
      clock += seconds * 1000;
    },
    log: (line) => out.push(line),
    error: (line) => out.push(`ERROR ${line}`),
    host: 'fakehost',
    pid: 4242,
    user: 'stark',
    liveness: () => 'unknown',
    onExit: () => () => {},
    cleanupWorktree: () => {},
  };
  return { deps, calls, events, out, pulls, locks, trains, io: { log: (l) => out.push(l), error: (l) => out.push(`ERROR ${l}`) } };
}

const conductArgs = (extra = {}) => ({ batch: 20, allowFailing: [], flaky: [], ...extra });
const runConductor = (world, extra) => conduct({
  deps: world.deps,
  args: conductArgs(extra),
  requiredContexts: REQUIRED_CONTEXTS,
  token: 'fakehost-4242-1',
  deadline: world.deps.now() + 24 * 60 * 60_000,
});
const called = (world, name) => world.calls.filter(([call]) => call === name);

describe('the conductor runs trains', () => {
  it('lands a green train behind one CI run, ejecting a conflicting component and continuing', () => {
    const world = fakeWorld({ prs: [component(11), component(12), component(13)], queued: [11, 12, 13], conflicts: new Set([12]) });
    const result = runConductor(world);

    assert.equal(result.state, 'drained');
    assert.deepEqual(result.landed, [11, 13]);
    assert.equal(called(world, 'openPr').length, 1, 'one CI run for the whole train');
    assert.match(called(world, 'openPr')[0][1].title, /^chore\(train\): land #11 #13$/);
    assert.match(called(world, 'openPr')[0][1].body, /- #11 `feat\/change-11@11ccccccc` feat: change 11/);

    const [merge] = called(world, 'mergePr');
    assert.equal(merge[2].sha, 'train-head-2001', 'the merge is pinned to the head CI measured');
    assert.equal(merge[2].title, 'chore(train): land #11 #13 (#2001)');
    assert.match(merge[2].message, /Co-authored-by: Author 11 <a11@example.com>/);
    assert.match(merge[2].message, /Co-authored-by: Author 13 <a13@example.com>/);

    const ejected = world.pulls.get(12);
    assert.equal(ejected.state, 'OPEN');
    assert.deepEqual(ejected.labels, []);
    assert.ok(ejected.comments.at(-1).body.startsWith(EJECTED_MARKER));
    assert.match(ejected.comments.at(-1).body, /#11, which are ahead of it/);

    for (const number of [11, 13]) {
      const pr = world.pulls.get(number);
      assert.equal(pr.state, 'CLOSED');
      assert.ok(pr.comments.at(-1).body.startsWith(LANDED_MARKER));
      assert.match(pr.comments.at(-1).body, /train #2001/);
    }
    const deleted = called(world, 'deleteBranch').map(([, branch]) => branch);
    assert.ok(deleted.includes('feat/change-11') && deleted.includes('feat/change-13'));
    assert.ok(!deleted.includes('feat/change-12'), 'an ejected component keeps its branch');
    assert.equal(world.locks.has(LOCK_REF), false, 'the lock is released when the queue drains');
  });

  it('merges a green train only while holding the fast-path lock, then releases it', () => {
    const world = fakeWorld({ prs: [component(21)], queued: [21] });
    const merge = world.deps.gh.mergePr;
    const heldAtMerge = [];
    world.deps.gh.mergePr = (...args) => {
      heldAtMerge.push(world.locks.has(FAST_LOCK_REF));
      return merge(...args);
    };
    const result = runConductor(world);

    assert.deepEqual(result.landed, [21]);
    assert.deepEqual(heldAtMerge, [true], 'no fast-path merge can land between the drift check and this merge');
    assert.equal(world.locks.has(FAST_LOCK_REF), false);
  });

  it('waits for main to reach the squash commit before judging a component landed', () => {
    const world = fakeWorld({ prs: [component(31)], queued: [31] });
    const merge = world.deps.gh.mergePr;
    let squash = null;
    world.deps.gh.mergePr = (number, options) => {
      const result = merge(number, options);
      squash = `squash-${number}`;
      return { ...result, sha: squash };
    };
    // GitHub answers the merge before origin/main moves: two stale reads, then the squash.
    let reads = 0;
    const revParse = world.deps.git.revParse;
    world.deps.git.revParse = (ref) => {
      if (ref !== 'origin/main' || squash === null) return revParse(ref);
      reads += 1;
      return reads > 2 ? squash : revParse(ref);
    };
    const contained = world.deps.git.isContained;
    world.deps.git.isContained = (base, sha) => (reads > 2 ? contained(base, sha) : false);
    const result = runConductor(world);

    assert.deepEqual(result.landed, [31]);
    assert.equal(called(world, 'openPr').length, 1, 'one train, not a second one for a component that already landed');
    assert.equal(world.pulls.get(31).state, 'CLOSED');
  });

  it('never queues a component a merged train carried again, even when containment is unproven', () => {
    const world = fakeWorld({ prs: [component(32)], queued: [32] });
    world.deps.git.isContained = () => false;
    world.deps.git.isAncestor = () => false;
    runConductor(world);

    assert.equal(called(world, 'openPr').length, 1, 'a second train would land it twice');
    const pr = world.pulls.get(32);
    assert.deepEqual(pr.labels, []);
    assert.match(pr.comments.at(-1).body, /does not provably contain/);
  });

  it('bisects a red train and ejects only the breaker', () => {
    const breaker = 3;
    const world = fakeWorld({
      prs: [1, 2, 3, 4].map((n) => component(n)),
      queued: [1, 2, 3, 4],
      ci: (numbers) => (numbers.includes(breaker) ? red(['Unit · Contract']) : green()),
    });
    // Sequential, so the halves read in order; the speculative bisect is below.
    const result = runConductor(world, { speculate: false });
    assert.deepEqual(result.landed, [1, 2, 4]);
    const trains = called(world, 'openPr').map(([, { title }]) => title);
    assert.deepEqual(trains, [
      'chore(train): land #1 #2 #3 #4',
      'chore(train): land #1 #2',
      'chore(train): land #3 #4',
      'chore(train): land #3',
      'chore(train): land #4',
    ]);
    const note = world.pulls.get(3).comments.at(-1).body;
    assert.ok(note.startsWith(EJECTED_MARKER));
    assert.match(note, /Unit · Contract FAILURE https:\/\/github.com\/wlsdks\/ontology-atlas\/actions\/runs\/777/);
    assert.deepEqual(world.pulls.get(3).labels, []);
  });

  it('reruns a flaky failure once instead of ejecting, and ejects without the flag', () => {
    const flakyCi = (numbers, reruns) => (reruns === 0 ? red(['Playwright (chromium 2/3)'], 991) : green());
    const flaky = fakeWorld({ prs: [component(7)], queued: [7], ci: flakyCi });
    assert.deepEqual(runConductor(flaky, { flaky: ['Playwright (chromium 2/3)'] }).landed, [7]);
    assert.deepEqual(called(flaky, 'rerunFailed').map(([, id]) => id), ['991']);
    assert.equal(called(flaky, 'openPr').length, 1, 'a rerun reuses the train, not a new CI run set');

    const strict = fakeWorld({ prs: [component(7)], queued: [7], ci: flakyCi });
    assert.deepEqual(runConductor(strict).landed, []);
    assert.equal(called(strict, 'rerunFailed').length, 0);
    assert.ok(strict.pulls.get(7).comments.at(-1).body.startsWith(EJECTED_MARKER));
  });

  it('rebuilds a green train when main moved into its files while CI ran', () => {
    const world = fakeWorld({
      prs: [component(5)],
      queued: [5],
      mainDrift: (trainIndex) => (trainIndex === 1 ? ['src/change-5.ts'] : ['src/unrelated.ts']),
    });
    const result = runConductor(world);
    assert.deepEqual(result.landed, [5]);
    assert.equal(called(world, 'openPr').length, 2, 'the drifted train was rebuilt once on the new main');
    assert.match(called(world, 'closePr')[0][2], /main moved into src\/change-5.ts/);
  });

  /*
   * ⚠️ The conductor renews its lease before every wait. A wait that skipped the refresh would
   * age the lock past its lease under a live conductor and invite the next lander to force-take
   * it: two conductors on one lock, the defect this file exists to prevent.
   */
  it('renews the lease before every wait it makes while holding the lock', () => {
    const world = fakeWorld({ prs: [component(1), component(2)], queued: [1, 2], ci: (numbers) => (numbers.length > 1 ? red(['MCP']) : green()) });
    runConductor(world);
    const holding = world.events.slice(world.events.indexOf(`take ${LOCK_REF}`), world.events.indexOf(`release ${LOCK_REF}`));
    const sleeps = holding.map((event, index) => [event, index]).filter(([event]) => event === 'sleep');
    assert.ok(sleeps.length > 3);
    for (const [, index] of sleeps) assert.equal(holding[index - 1], 'refresh', `a wait at event ${index} was not preceded by a refresh`);
  });

  it('takes out a queued pull request it must refuse, without stopping the train', () => {
    const world = fakeWorld({ prs: [component(8, { mergeable: 'CONFLICTING' }), component(9)], queued: [8, 9] });
    assert.deepEqual(runConductor(world).landed, [9]);
    assert.ok(world.pulls.get(8).comments.at(-1).body.startsWith(EJECTED_MARKER));
  });
});

/*
 * Two trains in flight. The second is cut from the first one's head while the first one's CI
 * runs, so both CI runs overlap; it lands only after the first one lands, and is closed, never
 * merged, when the first one does not.
 */
describe('a speculative second train', () => {
  const prs = () => [1, 2, 3, 4].map((n) => component(n));
  const titles = (world) => called(world, 'openPr').map(([, { title }]) => title);
  const index = (world, name, predicate = () => true) => world.calls.findIndex((call) => call[0] === name && predicate(call));

  it('lands A then B, one CI run each, with B\'s CI running while A\'s does', () => {
    const world = fakeWorld({ prs: prs(), queued: [1, 2, 3, 4] });
    const result = runConductor(world, { batch: 2 });

    assert.deepEqual(result.landed, [1, 2, 3, 4]);
    assert.deepEqual(titles(world), ['chore(train): land #1 #2', 'chore(train): land #3 #4'], 'two trains, one CI run each');
    assert.deepEqual(called(world, 'mergePr').map(([, number]) => number), [2001, 2002], 'merged in order: A, then B');
    const bOpened = index(world, 'openPr', ([, o]) => o.title.endsWith('#3 #4'));
    assert.ok(bOpened < index(world, 'mergePr'), 'B opened before A merged: the two CI runs overlapped');
    assert.ok(bOpened < index(world, 'readPr', ([, n]) => n === 2001), 'B opened before A was even polled');

    const [, bBranch, bBase] = called(world, 'createBranch')[1];
    assert.match(bBranch, /^train\/.*-3$/);
    assert.match(bBase, /^head:train\/.*-1$/, 'B is cut from A\'s head, not from main');
    assert.match(called(world, 'openPr')[1][1].body, /onto train #2001 .*speculatively/);
    assert.equal(called(world, 'closePr').filter(([, n]) => n >= 2001).length, 0, 'nothing discarded');

    // Both file sets were in the lock while both flew, so a fast path saw both.
    const both = called(world, 'refreshLock').map(([, , body]) => body).find((body) => body.trains?.length === 2 && body.trains.every((t) => t.pr));
    assert.ok(both, 'the lock recorded two trains in flight');
    assert.deepEqual(both.trains.map((t) => t.files), [['src/change-1.ts', 'src/change-2.ts'], ['src/change-3.ts', 'src/change-4.ts']]);
    assert.deepEqual(both.train.files, ['src/change-1.ts', 'src/change-2.ts', 'src/change-3.ts', 'src/change-4.ts']);
    assert.equal(both.pr, 2001);
  });

  it('discards B when A goes red, never merges it, and rebuilds it from main after the bisect', () => {
    const world = fakeWorld({ prs: prs(), queued: [1, 2, 3, 4], ci: (numbers) => (numbers.includes(1) ? red(['MCP']) : green()) });
    const result = runConductor(world, { batch: 2 });

    assert.deepEqual(result.landed, [2, 3, 4]);
    assert.deepEqual(titles(world), [
      'chore(train): land #1 #2',
      'chore(train): land #3 #4', // speculative on A: discarded
      'chore(train): land #1',
      'chore(train): land #2', // speculative on #1: discarded, its half put back
      'chore(train): land #2',
      'chore(train): land #3 #4', // speculative on #2, which lands: so does this
    ]);
    const merged = called(world, 'mergePr').map(([, n]) => n);
    assert.ok(!merged.includes(2002) && !merged.includes(2004), 'a discarded train is never merged');
    assert.deepEqual(merged, [2005, 2006]);
    const discard = world.pulls.get(2002).comments.at(-1).body;
    assert.match(discard, /^Discarded: it was cut on top of train #2001, which went red/);
    assert.ok(!discard.startsWith(RED_CLOSE_PREFIX), 'a discard is not counted as a red train');
    assert.ok(world.pulls.get(1).comments.at(-1).body.startsWith(EJECTED_MARKER));
    assert.equal(called(world, 'createBranch')[4][2], 'main'.padEnd(40, '0'), 'after the bisect, the rebuilt train is cut from main');
  });

  it('lands A and bisects B when B is red on top of a green A', () => {
    const world = fakeWorld({ prs: prs(), queued: [1, 2, 3, 4], ci: (numbers) => (numbers.includes(4) ? red(['Unit · Contract']) : green()) });
    const result = runConductor(world, { batch: 2 });

    assert.deepEqual(result.landed, [1, 2, 3]);
    assert.deepEqual(called(world, 'mergePr').map(([, n]) => n), [2001, 2003]);
    const bClose = world.pulls.get(2002).comments.at(-1).body;
    assert.ok(bClose.startsWith(RED_CLOSE_PREFIX), 'B is judged red on its own, after A landed');
    assert.match(bClose, /Split into #3 \| #4/);
    assert.deepEqual(titles(world).slice(2), ['chore(train): land #3', 'chore(train): land #4']);
    assert.ok(world.pulls.get(4).comments.at(-1).body.startsWith(EJECTED_MARKER));
    assert.equal(world.pulls.get(3).state, 'CLOSED');
  });

  it('bisects with speculation too: the second half rides on the first', () => {
    const world = fakeWorld({ prs: prs(), queued: [1, 2, 3, 4], ci: (numbers) => (numbers.includes(3) ? red(['Unit · Contract']) : green()) });
    assert.deepEqual(runConductor(world).landed, [1, 2, 4]);
    assert.equal(titles(world)[2], 'chore(train): land #3 #4');
    assert.match(called(world, 'openPr')[2][1].body, /onto train #2002/, 'the second half was cut on the first half');
  });

  it('keeps one train in flight with --no-speculate', () => {
    const world = fakeWorld({ prs: prs(), queued: [1, 2, 3, 4] });
    runConductor(world, { batch: 2, speculate: false });
    assert.ok(index(world, 'mergePr') < index(world, 'openPr', ([, o]) => o.title.endsWith('#3 #4')));
  });

  it('records the head train with the union of files for a reader that knows only `train`', () => {
    assert.deepEqual(lockTrains([]), { train: null, trains: [] });
    const both = lockTrains([{ pr: 1, files: ['b'] }, { pr: 2, files: ['a', 'b'] }]);
    assert.deepEqual(both.train, { pr: 1, files: ['a', 'b'] });
    assert.equal(lockTrains([{ pr: 1, files: ['b'] }, { pr: null, files: null }]).train.files, null, 'assembling: unknown, never partial');
  });
});

describe('the train size a conductor chooses', () => {
  const trainPr = (number, size, red) => ({
    number,
    title: `chore(train): land ${Array.from({ length: size }, (_, i) => `#${number * 100 + i}`).join(' ')}`,
    state: red ? 'CLOSED' : 'MERGED',
    headRefName: `train/20260926T100000Z-${number}`,
    comments: red ? [{ body: `${RED_CLOSE_PREFIX}MCP FAILURE. Split into halves.` }] : [],
  });
  const land = (world, argv) => runPrLand(argv, world.io, () => world.deps);

  it('measures it from recent trains when --batch is absent, and prints why', () => {
    // 12 of 20 ten-PR trains green: p is about 5 %, so a train of 13.
    const history = Array.from({ length: 20 }, (_, i) => trainPr(i + 1, 10, i >= 12));
    const world = fakeWorld({ prs: Array.from({ length: 16 }, (_, i) => component(i + 1)), queued: Array.from({ length: 16 }, (_, i) => i + 1), history });
    assert.equal(land(world, ['--conduct']), 0);
    assert.ok(world.out.some((line) => /train size 13: 20 recent train\(s\), 8 red; about 5\.0 %/.test(line)));
    assert.equal(called(world, 'openPr')[0][1].title.match(/#\d+/g).length, 13);
  });

  it('lets --batch override the measurement', () => {
    const world = fakeWorld({ prs: [component(1), component(2)], queued: [1, 2], history: [] });
    assert.equal(land(world, ['--conduct', '--batch=1']), 0);
    assert.ok(world.out.some((line) => line === 'train size 1 (--batch)'));
  });

  it('keeps the default when the history is short or unreadable', () => {
    const world = fakeWorld({ prs: [component(1)], queued: [1], history: [trainPr(1, 1, true)] });
    land(world, ['--conduct']);
    assert.ok(world.out.some((line) => /train size 20: 1 recent train\(s\), 1 red; fewer than 8/.test(line)));
    const unreadable = fakeWorld({ prs: [component(1)], queued: [1], history: null });
    land(unreadable, ['--conduct']);
    assert.ok(unreadable.out.some((line) => /train size 20: recent trains could not be read/.test(line)));
  });
});

describe('pnpm pr:land <n>, end to end against the fake', () => {
  const land = (world, argv) => runPrLand(argv, world.io, () => world.deps);

  it('queues a draft, conducts when the lock is free, and exits 0 once it landed', () => {
    const world = fakeWorld({ prs: [component(21)] });
    assert.equal(land(world, ['21']), 0);
    assert.ok(world.out.some((line) => /FAIL ready-green/.test(line)), 'the fast-path verdict is printed rule by rule');
    assert.ok(world.out.some((line) => /PR #21 landed through a train/.test(line)));
    assert.equal(called(world, 'addLabel').length, 1);
    assert.equal(world.pulls.get(21).state, 'CLOSED');
  });

  it('merges a green, disjoint pull request on the fast path without queueing it', () => {
    const world = fakeWorld({ prs: [component(22, { isDraft: false, statusCheckRollup: green() })] });
    assert.equal(land(world, ['22']), 0);
    const [merge] = called(world, 'mergePr');
    assert.equal(merge[1], 22);
    assert.equal(merge[2].sha, component(22).headRefOid);
    assert.equal(merge[2].title, 'feat: change 22 (#22)');
    assert.equal(called(world, 'addLabel').length, 0);
    assert.deepEqual(world.events.filter((e) => e.includes(FAST_LOCK_REF)), [`take ${FAST_LOCK_REF}`, `release ${FAST_LOCK_REF}`]);
    assert.equal(world.locks.has(LOCK_REF), false, 'the fast path never touched the train lock');
  });

  it('takes the train when a train in flight shares its files, and --no-wait leaves right after', () => {
    const trainLock = {
      pr: 1990, token: 'otherhost-1-1', holder: 'ada', host: 'otherhost', acquiredAt: '2026-09-26T09:59:00Z',
      leaseMinutes: LEASE_MINUTES, train: { pr: 1990, components: [5], files: ['src/change-23.ts'] },
    };
    const world = fakeWorld({ prs: [component(23, { isDraft: false, statusCheckRollup: green() })], lock: trainLock });
    assert.equal(land(world, ['23', '--no-wait']), 0);
    assert.ok(world.out.some((line) => /FAIL no-overlapping-train: the train in flight also changes src\/change-23.ts/.test(line)));
    assert.equal(called(world, 'mergePr').length, 0);
    assert.equal(called(world, 'addLabel').length, 1);
    assert.ok(world.out.some((line) => /landing now: train #1990/.test(line)));
  });

  it('says who must conduct when --no-wait finds nobody conducting', () => {
    const world = fakeWorld({ prs: [component(24)] });
    assert.equal(land(world, ['24', '--no-wait']), 0);
    assert.ok(world.out.some((line) => /pnpm pr:land --conduct/.test(line)));
    assert.equal(called(world, 'openPr').length, 0);
  });

  it('exits 1 when its pull request is ejected', () => {
    const world = fakeWorld({ prs: [component(25)], conflicts: new Set([25]) });
    assert.equal(land(world, ['25', '--no-fast']), 1);
    assert.ok(world.out.some((line) => /ERROR PR #25 was taken out of the queue/.test(line)));
  });

  it('plans without writing anything to GitHub', () => {
    const world = fakeWorld({
      prs: [component(31), component(32, { isDraft: false, statusCheckRollup: green() }), component(33)],
      queued: [33],
      conflicts: new Set([31]),
      readOnly: true,
    });
    assert.equal(land(world, ['--plan', '31', '32']), 0);
    const text = world.out.join('\n');
    assert.match(text, /PR #31: fast path not eligible/);
    assert.match(text, /PR #31: would be queued/);
    assert.match(text, /PR #32: would squash-merge now/);
    assert.match(text, /next train \(2 of 2 queued\): chore\(train\): land #33 #31/);
    assert.match(text, /#31 feat\/change-31@31ccccccc: would conflict and be ejected/);
    assert.match(text, /\| Co-authored-by: Author 33 <a33@example.com>/);
    assert.match(text, /dry run: nothing was written to GitHub/);
    assert.deepEqual(world.calls.filter(([name]) => !['readPr'].includes(name)), [], 'plan made a write call');
  });

  it('plans the speculative train that would ride on the next one', () => {
    const world = fakeWorld({ prs: [component(51), component(52), component(53)], queued: [51, 52, 53], conflicts: new Set([53]), readOnly: true });
    assert.equal(land(world, ['--plan', '51', '--batch=1']), 0);
    const text = world.out.join('\n');
    assert.match(text, /train size 1 \(--batch\)/);
    assert.match(text, /next train \(1 of 3 queued\): chore\(train\): land #51/);
    assert.match(text, /speculative train while its CI runs \(1\): chore\(train\): land #52/);
    assert.match(text, /lands only if that train lands, discarded if it does not/);
    assert.match(text, /#52 feat\/change-52@52ccccccc: merges cleanly/);
    assert.deepEqual(world.calls.filter(([name]) => !['readPr'].includes(name)), [], 'plan made a write call');

    // With a train in flight, its riders are not planned again and the next train rides on it.
    const trainLock = {
      pr: 1990, token: 'otherhost-1-1', holder: 'ada', host: 'otherhost', acquiredAt: '2026-09-26T09:59:00Z',
      leaseMinutes: LEASE_MINUTES, train: { pr: 1990, components: [51], files: ['src/change-51.ts'] }, trains: [{ pr: 1990, components: [51], files: ['src/change-51.ts'] }],
    };
    const flying = fakeWorld({ prs: [component(51), component(52)], queued: [51, 52], lock: trainLock, readOnly: true });
    land(flying, ['--plan', '52', '--no-fast']);
    const flyingText = flying.out.join('\n');
    assert.match(flyingText, /1 train\(s\) in flight carrying #51; the trains below form after it, the first one speculating on it/);
    assert.match(flyingText, /next train \(1 of 1 queued\): chore\(train\): land #52\n.*from train #1990's head/);

    const sequential = fakeWorld({ prs: [component(51), component(52)], queued: [51, 52], readOnly: true });
    land(sequential, ['--plan', '51', '--batch=1', '--no-speculate']);
    assert.match(sequential.out.join('\n'), /no speculative train: --no-speculate/);
  });

  it('prints the queue, the train in flight and its CI', () => {
    const world = fakeWorld({ prs: [component(41), component(42)], queued: [41, 42] });
    assert.equal(land(world, ['--queue']), 0);
    const text = world.out.join('\n');
    assert.match(text, /landing now: nothing is landing/);
    assert.match(text, /1\. #41 queued 0 min/);
    assert.match(text, /pnpm pr:land --conduct/);
  });
});
