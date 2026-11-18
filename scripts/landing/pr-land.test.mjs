import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CONFLICT_INSTRUCTION,
  FAST_LOCK_REF,
  LEASE_MINUTES,
  LOCK_REF,
  classifyHolderLiveness,
  classifyLock,
  conduct,
  createGithub,
  describeCleanup,
  describeScheduledRun,
  fullBrowserRunKind,
  lockTrains,
  describeLock,
  otherCheckState,
  parseArgs,
  parseLockToken,
  protectionFrom,
  readOutcome,
  missingChangeRecord,
  refuseLanding,
  requiredCheckState,
  runInFlight,
  runPrLand,
  SCHEDULED_CHECKS,
  worktreeToRemove,
} from './pr-land.mjs';
import { EJECTED_MARKER, LANDED_MARKER, QUEUE_LABEL, RED_CLOSE_PREFIX, trainCiStep } from '../lib/landing/landing-train.mjs';

/**
 * The landing train, driven by recorded `gh` output and a fake GitHub; no network. The recorded
 * rollup has eleven contexts, eight required, one required context red: a lander counting "ten of
 * eleven green" would merge it.
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

/** The train's CI result for a rollup, the way the conductor reads it. */
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

  /** `--worktree` removes nothing, in either spelling; removal is `--cleanup`'s alone. */
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
    const refusal = refuseLanding({ ...readyPr(), isCrossRepository: true });
    assert.match(refusal, /fork/);
    assert.match(refusal, /gh pr diff/);
    assert.match(refusal, /core\.hooksPath=\/dev\/null/);
  });
});

describe('a feature lands with its change record', () => {
  const readNothing = () => assert.fail('the changed files were read');
  const recorded = () => ['src/a.ts', 'docs/records/changes/2026-10-10-a-0000.md'];

  it('refuses a feature that adds no record and names both ways out', () => {
    const refusal = missingChangeRecord({ title: 'feat(map): keep the camera still', body: '' }, () => ['src/a.ts']);
    assert.match(refusal, /titled `feat:`/);
    assert.match(refusal, /pnpm record:new -- --kind=change .*--category=<Added\|Changed\|Fixed\|Removed>/);
    assert.match(refusal, /No change record: <why/);
  });

  it('lands a feature once it adds a record', () => {
    for (const title of ['feat: a', 'feat(map): a', 'feat!: a']) {
      assert.equal(missingChangeRecord({ title, body: '' }, recorded), null, title);
    }
  });

  it('lands on a stated reason without reading the files', () => {
    assert.equal(missingChangeRecord({ title: 'feat(ci): a', body: 'Summary\n\nNo change record: only CI timing moved\n' }, readNothing), null);
  });

  it('refuses a declaration with no reason', () => {
    assert.match(missingChangeRecord({ title: 'feat: a', body: 'No change record:   \n' }, () => []), /adds no docs\/records\/changes\/ record/);
  });

  it('never asks a fix, perf, design, chore, docs, refactor, test or fixup pull request', () => {
    for (const title of ['fix(map): a', 'perf!: a', 'design(app): a', 'chore(release): a', 'docs: a', 'refactor: a', 'test: a', 'fixup: a']) {
      assert.equal(missingChangeRecord({ title, body: '' }, readNothing), null, title);
    }
  });

  it('refuses when the changed files cannot be read', () => {
    assert.match(missingChangeRecord({ title: 'feat: a', body: null }, () => null), /could not be read/);
  });

  it('refuses before queueing, and --plan reports the refusal', () => {
    const world = fakeWorld({ prs: [component(61, { body: '' })] });
    assert.equal(runPrLand(['61'], world.io, () => world.deps), 1);
    assert.deepEqual(called(world, 'addLabel'), []);
    assert.ok(world.out.some((line) => line.startsWith('ERROR PR #61 is titled `feat:`')));
    const plan = fakeWorld({ prs: [component(62, { body: '' })], readOnly: true });
    runPrLand(['--plan', '62'], plan.io, () => plan.deps);
    assert.ok(plan.out.some((line) => line.startsWith('PR #62: would be refused — is titled `feat:`')));
  });

  it('reads every page of changed files and survives an unreadable answer', () => {
    const calls = [];
    const github = createGithub('owner/repo', (args) => { calls.push(args); return 'src/a.ts\ndocs/records/changes/x.md\n'; });
    assert.deepEqual(github.readChangedFiles(7), ['src/a.ts', 'docs/records/changes/x.md']);
    assert.ok(calls[0].includes('--paginate') && calls[0].includes('repos/owner/repo/pulls/7/files'));
    assert.equal(createGithub('owner/repo', () => undefined).readChangedFiles(7), null);
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
    assert.equal(classifyHolderLiveness({ token }, { host: 'mbp', readProcessCommand: () => 'node /repo/scripts/landing/pr-land.mjs 1704' }), 'alive');
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
   * Every context reports twice, `SKIPPED` as a draft and then for real; keeping whichever came last
   * would read a real FAILURE as never ran.
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

  /** A cancelled run and a newer live run for the same name: recency settles it, by `startedAt`. */
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
    body: 'No change record: a landing fixture',
    ...extra,
  };
}

/**
 * An in-memory GitHub and Git.
 *
 * - `ci(numbers, reruns)` decides a train's rollup from the components it carries.
 * - `conflicts` is the set of component numbers whose merge onto a train answers 409.
 * - `ownCi(number, reruns)` decides a pull request's own rollup once it is marked ready.
 * - `mainDrift(trainIndex)` is the files `main` changed under the n-th train while its CI ran.
 * - `mainMoves()` is the files `main` changed since a pull request's merge base, with no train.
 * - `behindMain(sha)` says that head lacks today's `main`; any `mainMoves()` implies it for every head.
 * - `onOwnCiRead(pr, reads)` may change a pull request while its own CI is awaited.
 * - `readOnly` makes every write throw, for `--plan`.
 */
function fakeWorld({ prs = [], queued = [], ci = () => green(), ownCi = () => green(), onOwnCiRead = () => {}, conflicts = new Set(), mainDrift = () => [], mainMoves = () => [], behindMain = () => false, lock = null, readOnly = false, history = [] } = {}) {
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
        // The first poll sees nothing yet; the next one sees the result.
        if (train.polls >= 2) train.rollup = ci(train.components, train.reruns);
      }
      if (!train && pr.ownCiPolls !== undefined && pr.state === 'OPEN') {
        pr.ownCiPolls += 1;
        onOwnCiRead(pr, pr.ownCiPolls);
        // Its own run: in flight on the first read after ready, decided on the second.
        if (pr.state === 'OPEN') pr.statusCheckRollup = pr.ownCiPolls >= 2
          ? ownCi(number, pr.ownCiReruns ?? 0)
          : REQUIRED_CONTEXTS.map((name) => ({ name, status: 'IN_PROGRESS', conclusion: '', startedAt: '2026-09-26T10:01:00Z' }));
      }
      return view(pr);
    },
    readPrComments: (number) => pulls.get(number).comments,
    readChangedFiles: (number) => pulls.get(number).files,
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
    squashOnto: write('squashOnto', (branch, parent, { message }) => `squash:${branch}:${message.split('\n')[0]}`),
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
      const pr = pulls.get(number);
      pr.isDraft = false;
      if (!trains.has(number)) pr.ownCiPolls = 0;
      return true;
    }),
    markDraft: write('markDraft', () => true),
    readRunAttempt: (runId) => {
      const has = (rollup) => (rollup ?? []).some((r) => String(r.detailsUrl ?? '').includes(`/runs/${runId}/`));
      for (const train of trains.values()) if (has(train.rollup)) return 1 + train.reruns;
      for (const pr of pulls.values()) if (!trains.has(pr.number) && has(pr.statusCheckRollup)) return 1 + (pr.ownCiReruns ?? 0);
      return null;
    },
    rerunFailed: write('rerunFailed', (runId) => {
      for (const pr of pulls.values()) {
        if (trains.has(pr.number) || !(pr.statusCheckRollup ?? []).some((r) => String(r.detailsUrl ?? '').includes(`/runs/${runId}/`))) continue;
        // Only the failed jobs go again; the pull request's own run is in flight until they end.
        pr.ownCiReruns = (pr.ownCiReruns ?? 0) + 1;
        pr.ownCiPolls = 0;
      }
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
        return current ? mainDrift(current.index) : mainMoves();
      }
      if (to.startsWith('head:')) return (branchTrain.get(to.slice('head:'.length)) ?? []).flatMap((n) => pulls.get(n).files);
      return [];
    },
    diffNameStatus: (base, sha) => (byHead(sha)?.files ?? []).map((path) => ({ status: 'M', path })),
    isContained: () => false,
    isAncestor: (ancestor, descendant) => ancestor !== 'main'.padEnd(40, '0') || !(behindMain(descendant) || mainMoves().length > 0),
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
  for (const mode of ['train', 'fast']) {
  it(`retains ten original commit identities, messages and authors through real Git ${mode} integration`, () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-history-'));
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    try {
      git('init', '-b', 'main');
      git('config', 'user.name', 'Conductor');
      git('config', 'user.email', 'conductor@example.com');
      writeFileSync(join(root, 'base.txt'), 'base');
      git('add', 'base.txt');
      git('commit', '-m', 'chore: base');
      const base = git('rev-parse', 'HEAD');
      git('switch', '-c', 'feat/original');
      const originals = [];
      for (let i = 1; i <= 10; i += 1) {
        writeFileSync(join(root, 'work.txt'), String(i));
        git('add', 'work.txt');
        git('-c', `user.name=Author ${i}`, '-c', `user.email=author${i}@example.com`, 'commit', '-m', `feat: original step ${i}`, '-m', `Evidence for step ${i}.`);
        originals.push(git('show', '-s', '--format=%H%x00%B%x00%an%x00%ae', 'HEAD'));
      }
      const head = git('rev-parse', 'HEAD');
      const world = fakeWorld({ prs: [component(11, { headRefOid: head, headRefName: 'feat/original', isDraft: mode !== 'fast', statusCheckRollup: mode === 'fast' ? green() : [] })], queued: [11] });
      const createBranch = world.deps.gh.createBranch;
      world.deps.gh.createBranch = (branch, sha) => { git('branch', branch, sha); return createBranch(branch, sha); };
      const mergeInto = world.deps.gh.mergeInto;
      world.deps.gh.mergeInto = (branch, sha, message) => {
        git('switch', branch);
        git('merge', '--no-ff', sha, '-m', message);
        return mergeInto(branch, sha, message);
      };
      world.deps.gh.squashOnto = () => { throw new Error('original commit history must never be squashed'); };
      const mergePr = world.deps.gh.mergePr;
      world.deps.gh.mergePr = (number, options) => {
        assert.equal(options.method, 'merge');
        git('switch', 'main');
        git('merge', '--no-ff', world.pulls.get(number).headRefName, '-m', `chore(train): land #${number}`);
        return mergePr(number, options);
      };
      const revParse = world.deps.git.revParse;
      world.deps.git.revParse = (ref) => ref === 'origin/main' ? base : revParse(ref);
      if (mode === 'train') assert.equal(runConductor(world).state, 'drained');
      else assert.equal(runPrLand(['11'], world.io, () => world.deps), 0);
      const reachable = new Set(git('rev-list', 'main').split('\n'));
      for (const original of originals) {
        const sha = original.split('\0')[0];
        assert.ok(reachable.has(sha), `original commit ${sha} must remain reachable from main`);
        assert.equal(git('show', '-s', '--format=%H%x00%B%x00%an%x00%ae', sha), original);
      }
      assert.equal(originals.length, 10);
      assert.equal(Number(git('rev-list', '--count', '--merges', 'main')), mode === 'train' ? 2 : 1, 'fast PRs add one merge; trains also retain their integration merge');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  }

  it('lands a green train behind one CI run, ejecting a conflicting component and continuing', () => {
    const world = fakeWorld({ prs: [component(11), component(12), component(13)], queued: [11, 12, 13], conflicts: new Set([12]) });
    const result = runConductor(world);

    assert.equal(result.state, 'drained');
    assert.deepEqual(result.landed, [11, 13]);
    assert.equal(called(world, 'openPr').length, 1, 'one CI run for the whole train');
    assert.match(called(world, 'openPr')[0][1].title, /^chore\(merge\): #11 #13$/);
    assert.match(called(world, 'openPr')[0][1].body, /- #11 `feat\/change-11@11ccccccc` feat: change 11/);

    const [merge] = called(world, 'mergePr');
    assert.equal(merge[2].sha, 'train-head-2001', 'the merge is pinned to the head CI measured');
    assert.equal(merge[2].method, 'merge', 'the train must preserve its original commit ancestry');
    assert.equal(called(world, 'squashOnto').length, 0, 'no component history may be rewritten');
    assert.deepEqual(called(world, 'mergeInto').map(([, , sha, message]) => [sha, message]), [
      [component(11).headRefOid, 'feat: change 11 (#11)'],
      [component(12).headRefOid, 'feat: change 12 (#12)'],
      [component(13).headRefOid, 'feat: change 13 (#13)'],
    ]);

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
      'chore(merge): #1 #2 #3 #4',
      'chore(merge): #1 #2',
      'chore(merge): #3 #4',
      'chore(merge): #3 — feat: change 3',
      'chore(merge): #4 — feat: change 4',
    ]);
    const note = world.pulls.get(3).comments.at(-1).body;
    assert.ok(note.startsWith(EJECTED_MARKER));
    assert.match(note, /Unit · Contract FAILURE https:\/\/github.com\/wlsdks\/ontology-atlas\/actions\/runs\/777/);
    assert.deepEqual(world.pulls.get(3).labels, []);
  });

  it('reruns the failed jobs of a lone red train once instead of ejecting, flagged or not', () => {
    const flakyCi = (numbers, reruns) => (reruns === 0 ? red(['Playwright (chromium 2/3)'], 991) : green());
    const flaky = fakeWorld({ prs: [component(7)], queued: [7], ci: flakyCi });
    assert.deepEqual(runConductor(flaky, { flaky: ['Playwright (chromium 2/3)'] }).landed, [7]);
    assert.deepEqual(called(flaky, 'rerunFailed').map(([, id]) => id), ['991']);
    assert.equal(called(flaky, 'openPr').length, 1, 'a rerun reuses the train, not a new CI run set');

    const unflagged = fakeWorld({ prs: [component(7)], queued: [7], ci: flakyCi });
    assert.deepEqual(runConductor(unflagged).landed, [7]);
    assert.equal(called(unflagged, 'rerunFailed').length, 1);

    const real = fakeWorld({ prs: [component(7)], queued: [7], ci: () => red(['MCP'], 992) });
    assert.deepEqual(runConductor(real).landed, []);
    assert.equal(called(real, 'rerunFailed').length, 1, 'one rerun, then the author gets it back');
    assert.ok(real.pulls.get(7).comments.at(-1).body.startsWith(EJECTED_MARKER));
  });

  it('settles a lone red train as red at once when GitHub refuses its rerun', () => {
    const world = fakeWorld({ prs: [component(8)], queued: [8], ci: () => red(['MCP'], 993) });
    let asked = 0;
    world.deps.gh.rerunFailed = () => { asked += 1; return false; };
    assert.deepEqual(runConductor(world).landed, []);
    assert.equal(asked, 1);
    assert.ok(world.out.some((line) => /train #\d+ is red and GitHub refused to rerun its failed jobs; settling it as red/.test(line)));
    assert.ok(world.pulls.get(8).comments.at(-1).body.startsWith(EJECTED_MARKER));
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
    assert.deepEqual(titles(world), ['chore(merge): #1 #2', 'chore(merge): #3 #4'], 'two trains, one CI run each');
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
      'chore(merge): #1 #2',
      'chore(merge): #3 #4', // speculative on A: discarded
      'chore(merge): #1 — feat: change 1',
      'chore(merge): #2 — feat: change 2', // speculative on #1: discarded, its half put back
      'chore(merge): #2 — feat: change 2',
      'chore(merge): #3 #4', // speculative on #2, which lands: so does this
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
    assert.deepEqual(titles(world).slice(2), ['chore(merge): #3 — feat: change 3', 'chore(merge): #4 — feat: change 4']);
    assert.ok(world.pulls.get(4).comments.at(-1).body.startsWith(EJECTED_MARKER));
    assert.equal(world.pulls.get(3).state, 'CLOSED');
  });

  it('bisects with speculation too: the second half rides on the first', () => {
    const world = fakeWorld({ prs: prs(), queued: [1, 2, 3, 4], ci: (numbers) => (numbers.includes(3) ? red(['Unit · Contract']) : green()) });
    assert.deepEqual(runConductor(world).landed, [1, 2, 4]);
    assert.equal(titles(world)[2], 'chore(merge): #3 #4');
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

  it('queues a draft main moved into, conducts when the lock is free, and exits 0 once it landed', () => {
    const world = fakeWorld({ prs: [component(21)], mainMoves: () => ['src/change-21.ts'] });
    assert.equal(land(world, ['21']), 0);
    assert.ok(world.out.some((line) => /FAIL ready-green/.test(line)), 'the fast-path verdict is printed rule by rule');
    assert.ok(world.out.some((line) => /taking the train: contains-main, disjoint-from-main/.test(line)));
    assert.equal(called(world, 'markReady').length, 0, 'a change the fast path cannot take spends no run of its own');
    assert.ok(world.out.some((line) => /PR #21 landed through a train/.test(line)));
    assert.equal(called(world, 'addLabel').length, 1);
    assert.equal(world.pulls.get(21).state, 'CLOSED');
  });

  it('marks a disjoint draft ready, waits for its own CI and merges it without a train', () => {
    const world = fakeWorld({ prs: [component(26)] });
    assert.equal(land(world, ['26']), 0);
    assert.equal(called(world, 'markReady').length, 1);
    const [merge] = called(world, 'mergePr');
    assert.equal(merge[1], 26);
    assert.equal(merge[2].sha, component(26).headRefOid, 'it merges the head its own CI measured');
    assert.equal(merge[2].method, 'merge');
    assert.equal(called(world, 'openPr').length, 0, 'no train ran');
    assert.equal(called(world, 'addLabel').length, 0, 'it never joined the queue');
    assert.equal(world.locks.has(LOCK_REF), false);
    assert.ok(world.out.some((line) => /PR #26 merged on the fast path/.test(line)));
  });

  it('waits for the run already going on a ready pull request without asking for another', () => {
    const running = REQUIRED_CONTEXTS.map((name) => ({ name, status: 'IN_PROGRESS', conclusion: '', startedAt: '2026-09-26T10:01:00Z' }));
    const world = fakeWorld({ prs: [component(27, { isDraft: false, statusCheckRollup: running, ownCiPolls: 0 })] });
    assert.equal(land(world, ['27']), 0);
    assert.equal(called(world, 'markReady').length, 0);
    assert.equal(called(world, 'mergePr')[0][1], 27);
  });

  it('hands a red own run back to its author, unqueued and without a train', () => {
    const world = fakeWorld({ prs: [component(28)], ownCi: () => red(['MCP'], 4242) });
    assert.equal(land(world, ['28']), 1);
    assert.equal(called(world, 'mergePr').length, 0);
    assert.equal(called(world, 'addLabel').length, 0);
    assert.equal(called(world, 'openPr').length, 0);
    const text = world.out.join('\n');
    assert.match(text, /ERROR PR #28 is red on its own CI, again after one rerun of the failed jobs; nothing was queued/);
    assert.match(text, /ERROR {3}MCP FAILURE https:\/\/github.com\/wlsdks\/ontology-atlas\/actions\/runs\/4242/);
  });

  it('hands back a ready pull request already red after its rerun, without waiting', () => {
    const world = fakeWorld({ prs: [component(29, { isDraft: false, statusCheckRollup: red(['Unit · Contract']) })] });
    world.deps.gh.readRunAttempt = () => 2;
    assert.equal(land(world, ['29']), 1);
    assert.equal(world.events.filter((e) => e === 'sleep').length, 0);
    assert.equal(called(world, 'addLabel').length, 0);
  });

  it('sends a red own run to the train when every failed context is named --flaky', () => {
    const flaky = 'Playwright (chromium 1/3)';
    const world = fakeWorld({ prs: [component(30)], ownCi: () => red([flaky]) });
    assert.equal(land(world, ['30', `--flaky=${flaky}`]), 0);
    assert.ok(world.out.some((line) => /red only on Playwright \(chromium 1\/3\), named as tolerated; the train reruns it/.test(line)));
    assert.equal(called(world, 'openPr').length, 1);
    assert.ok(world.out.some((line) => /PR #30 landed through a train/.test(line)));
  });

  it('checks main again under the fast lock and takes the train when it moved in between', () => {
    let moved = false;
    const world = fakeWorld({ prs: [component(36)], mainMoves: () => (moved ? ['src/change-36.ts'] : []) });
    const takeLock = world.deps.gh.takeLock;
    world.deps.gh.takeLock = (ref, ...rest) => {
      if (ref === FAST_LOCK_REF) moved = true;
      return takeLock(ref, ...rest);
    };
    assert.equal(land(world, ['36']), 0);
    assert.ok(world.out.some((line) => /now FAIL disjoint-from-main: main also changed src\/change-36.ts/.test(line)));
    assert.notEqual(called(world, 'mergePr')[0][1], 36, 'the train merged, not the pull request directly');
  });

  it('never merges directly a head behind main, even green and disjoint, and spends no run of its own', () => {
    const behind = (sha) => sha === component(37).headRefOid || sha === component(39).headRefOid;
    const world = fakeWorld({ prs: [component(37, { isDraft: false, statusCheckRollup: green() }), component(39)], behindMain: behind });
    assert.equal(land(world, ['37']), 0);
    assert.ok(world.out.some((line) => /FAIL contains-main: its head is behind origin\/main/.test(line)));
    assert.ok(called(world, 'mergePr').every(([, number]) => number !== 37), 'the train merged it, on the tree that lands');
    assert.ok(world.out.some((line) => /PR #37 landed through a train/.test(line)));
    assert.equal(land(world, ['39']), 0);
    assert.equal(called(world, 'markReady').length, 0, 'a draft behind main goes to the train without its own run');
  });

  it('takes the train when main moves on while its own CI runs, even into no file of its own', () => {
    let ready = false;
    const world = fakeWorld({ prs: [component(40)], behindMain: () => ready });
    const markReady = world.deps.gh.markReady;
    world.deps.gh.markReady = (number) => {
      ready = true;
      return markReady(number);
    };
    assert.equal(land(world, ['40']), 0);
    assert.ok(world.out.some((line) => /own CI is green, but it cannot merge directly/.test(line)));
    assert.ok(called(world, 'mergePr').every(([, number]) => number !== 40));
  });

  it('leaves a pull request already queued to the train instead of running its own CI', () => {
    const world = fakeWorld({ prs: [component(43)], queued: [43] });
    assert.equal(land(world, ['43']), 0);
    assert.ok(world.out.some((line) => /taking the train: it is already queued for a train/.test(line)));
    assert.equal(called(world, 'markReady').length, 0);
    assert.ok(world.out.some((line) => /PR #43 landed through a train/.test(line)));
  });

  it('conducts a queue nobody conducts instead of leaving it behind a direct merge', () => {
    const world = fakeWorld({ prs: [component(41), component(42)] });
    assert.equal(land(world, ['41', '--no-wait']), 0);
    assert.equal(land(world, ['42']), 0);
    assert.ok(world.out.some((line) => /taking the train: other pull requests are queued and nobody conducts them/.test(line)));
    assert.equal(world.pulls.get(41).state, 'CLOSED', '#41 landed through the train #42 conducted');
    assert.equal(world.pulls.get(41).labels.length, 0);

    const green42 = fakeWorld({ prs: [component(41), component(42, { isDraft: false, statusCheckRollup: green() })] });
    assert.equal(land(green42, ['41', '--no-wait']), 0);
    assert.equal(land(green42, ['42']), 0);
    assert.equal(called(green42, 'mergePr')[0][1], 42, '#42 merged directly');
    assert.ok(green42.out.some((line) => /conducting them before leaving/.test(line)));
    assert.equal(green42.pulls.get(41).state, 'CLOSED', 'and #41 did not stay queued with nobody conducting');
  });

  describe('a red own run gets one rerun of its failed jobs', () => {
    const flaky = 'Playwright (chromium 2/3)';

    it('reruns only the failed jobs once and merges when they pass on the same head', () => {
      const world = fakeWorld({ prs: [component(70)], ownCi: (n, reruns) => (reruns === 0 ? red([flaky], 501) : green()) });
      assert.equal(land(world, ['70']), 0);
      assert.deepEqual(called(world, 'rerunFailed').map(([, id]) => id), ['501']);
      assert.ok(world.out.some((line) => /PR #70 is red on Playwright \(chromium 2\/3\) at 70ccccccc; re-running only the failed jobs of run 501 once on the same head/.test(line)));
      assert.equal(called(world, 'mergePr')[0][1], 70);
    });

    it('hands it back after the one rerun fails too, never rerunning twice', () => {
      const world = fakeWorld({ prs: [component(71)], ownCi: () => red(['MCP'], 502) });
      assert.equal(land(world, ['71']), 1);
      assert.equal(called(world, 'rerunFailed').length, 1);
      assert.ok(world.out.some((line) => /ERROR PR #71 is red on its own CI, again after one rerun of the failed jobs; nothing was queued/.test(line)));
    });

    it('reruns a pull request that is already red when the lander arrives, then waits for it', () => {
      const world = fakeWorld({
        prs: [component(72, { isDraft: false, statusCheckRollup: red([flaky], 503) })],
        ownCi: (n, reruns) => (reruns === 0 ? red([flaky], 503) : green()),
      });
      assert.equal(land(world, ['72']), 0);
      assert.equal(called(world, 'rerunFailed').length, 1);
      assert.equal(called(world, 'markReady').length, 0);
      assert.equal(called(world, 'mergePr')[0][1], 72);
    });

    it('hands it back at once, naming the red contexts, when GitHub refuses the rerun', () => {
      const world = fakeWorld({ prs: [component(74)], ownCi: () => red(['MCP'], 505) });
      let asked = 0;
      world.deps.gh.rerunFailed = () => { asked += 1; return false; };
      assert.equal(land(world, ['74']), 1);
      assert.equal(asked, 1, 'a refused rerun is not asked for again on every read');
      const text = world.out.join('\n');
      assert.match(text, /ERROR PR #74 is red on its own CI and was not rerun \(GitHub refused to rerun run 505\); nothing was queued/);
      assert.match(text, /ERROR {3}MCP FAILURE https:\/\/github.com\/wlsdks\/ontology-atlas\/actions\/runs\/505/);
      assert.ok(world.events.filter((e) => e === 'sleep').length <= 2);
    });

    it('asks for the rerun only once every job of that run has finished', () => {
      let reads = 0;
      const going = { name: 'Playwright (chromium 5/5)', status: 'IN_PROGRESS', conclusion: '', startedAt: '2026-09-26T10:00:00Z', detailsUrl: 'https://github.com/wlsdks/ontology-atlas/actions/runs/506/job/9' };
      const world = fakeWorld({
        prs: [component(75)],
        ownCi: (n, reruns) => {
          reads += 1;
          if (reruns > 0) return green();
          return reads < 3 ? [...red(['MCP'], 506), going] : red(['MCP'], 506);
        },
      });
      let askedWhileGoing = false;
      const rerun = world.deps.gh.rerunFailed;
      world.deps.gh.rerunFailed = (id) => {
        askedWhileGoing ||= world.pulls.get(75).statusCheckRollup.some((r) => r.status === 'IN_PROGRESS');
        return rerun(id);
      };
      assert.equal(land(world, ['75']), 0);
      assert.equal(askedWhileGoing, false);
      assert.equal(called(world, 'rerunFailed').length, 1);
    });

    it('never reruns a run that was only cancelled, and stops when nothing replaces it', () => {
      const cancelled = () => REQUIRED_CONTEXTS.map((name) => ({ name, status: 'COMPLETED', conclusion: 'CANCELLED', startedAt: '2026-09-26T10:00:00Z', detailsUrl: 'https://github.com/wlsdks/ontology-atlas/actions/runs/509/job/1' }));
      const world = fakeWorld({ prs: [component(76)], ownCi: cancelled });
      assert.equal(land(world, ['76']), 1);
      assert.equal(called(world, 'rerunFailed').length, 0);
      assert.ok(world.out.some((line) => /stopped waiting for its own CI: its run on 76ccccccc was cancelled and nothing replaced it/.test(line)));
    });

    it('asks once per head even when the attempt still reads as the first', () => {
      const world = fakeWorld({ prs: [component(77)], ownCi: () => red(['MCP'], 510) });
      world.deps.gh.readRunAttempt = () => 1;
      assert.equal(land(world, ['77']), 1);
      assert.equal(called(world, 'rerunFailed').length, 1);
      assert.ok(world.out.some((line) => /again after one rerun of the failed jobs/.test(line)));
    });

    it('reruns nothing when any of the red runs was rerun already', () => {
      const rollup = REQUIRED_CONTEXTS.map((name) => ({
        name,
        status: 'COMPLETED',
        conclusion: name === 'MCP' || name === 'Unit · Contract' ? 'FAILURE' : 'SUCCESS',
        startedAt: '2026-09-26T10:00:00Z',
        detailsUrl: `https://github.com/wlsdks/ontology-atlas/actions/runs/${name === 'MCP' ? 507 : 508}/job/1`,
      }));
      const world = fakeWorld({ prs: [component(78, { isDraft: false, statusCheckRollup: rollup })] });
      world.deps.gh.readRunAttempt = (id) => (String(id) === '507' ? 2 : 1);
      assert.equal(land(world, ['78']), 1);
      assert.equal(called(world, 'rerunFailed').length, 0);
      assert.ok(world.out.some((line) => /was not rerun \(its run was rerun already\)/.test(line)));
    });

    it('hands a red pull request back with --no-wait instead of queueing it', () => {
      const world = fakeWorld({ prs: [component(79, { isDraft: false, statusCheckRollup: red(['MCP']) })] });
      assert.equal(land(world, ['79', '--no-wait']), 1);
      assert.equal(called(world, 'addLabel').length, 0);
      assert.equal(called(world, 'rerunFailed').length, 0);
    });

    it('does not rerun a run someone already reran, or one whose attempt it cannot read', () => {
      for (const attempt of [2, null]) {
        const world = fakeWorld({ prs: [component(73, { isDraft: false, statusCheckRollup: red([flaky], 504) })] });
        world.deps.gh.readRunAttempt = () => attempt;
        assert.equal(land(world, ['73']), 1, String(attempt));
        assert.equal(called(world, 'rerunFailed').length, 0, String(attempt));
      }
    });
  });

  it('reports a direct merge even when the queue behind it cannot be read', () => {
    const world = fakeWorld({ prs: [component(80, { isDraft: false, statusCheckRollup: green() })] });
    world.deps.gh.listQueue = () => { throw new Error('gh api graphql failed: rate limit exceeded'); };
    assert.equal(land(world, ['80']), 0);
    const merged = world.out.findIndex((line) => /PR #80 is merged/.test(line));
    const warned = world.out.findIndex((line) => /ERROR warning: PR #80 is merged, but the queue behind it could not be conducted \(.*rate limit exceeded\)/.test(line));
    assert.ok(merged >= 0 && warned > merged, 'the merge is reported first, the queue failure only warns');
  });

  describe('waiting for its own CI', () => {
    const running = () => REQUIRED_CONTEXTS.map((name) => ({ name, status: 'IN_PROGRESS', conclusion: '', startedAt: '2026-09-26T10:01:00Z' }));
    const sleeps = (world) => world.events.filter((e) => e === 'sleep').length;

    it('stops, unqueued, when GitHub refuses to mark the draft ready', () => {
      const world = fakeWorld({ prs: [component(60)] });
      world.deps.gh.markReady = () => false;
      assert.equal(land(world, ['60']), 1);
      assert.ok(world.out.some((line) => /ERROR PR #60 stopped waiting for its own CI: GitHub refused to mark it ready/.test(line)));
      assert.equal(sleeps(world), 0);
      assert.equal(called(world, 'addLabel').length, 0);
    });

    it('stops at once, unqueued, when the pull request is closed meanwhile', () => {
      const world = fakeWorld({ prs: [component(61)], onOwnCiRead: (pr) => { pr.state = 'CLOSED'; } });
      assert.equal(land(world, ['61']), 1);
      assert.ok(world.out.some((line) => /ERROR PR #61 stopped waiting for its own CI: it is closed now; nothing was queued/.test(line)));
      assert.equal(sleeps(world), 1);
      assert.equal(called(world, 'addLabel').length, 0, 'a stopped wait never falls through to the queue');
    });

    it('stops when the pull request is turned back into a draft, and merges nothing', () => {
      const world = fakeWorld({ prs: [component(62)], onOwnCiRead: (pr) => { pr.isDraft = true; } });
      assert.equal(land(world, ['62']), 1);
      assert.ok(world.out.some((line) => /it was turned back into a draft while its CI ran/.test(line)));
      assert.equal(called(world, 'mergePr').length, 0);
    });

    it('asks GitHub again only once when no run ever reports', () => {
      const world = fakeWorld({ prs: [component(63)], ownCi: () => [] });
      assert.equal(land(world, ['63', '--timeout-minutes=10']), 1);
      assert.equal(called(world, 'markDraft').length, 1);
      assert.ok(world.out.some((line) => /gave no verdict within 10 minutes/.test(line)));
    });

    it('gives up at the deadline without merging', () => {
      const world = fakeWorld({ prs: [component(64)], ownCi: running });
      assert.equal(land(world, ['64', '--timeout-minutes=2']), 1);
      assert.ok(world.out.some((line) => /ERROR PR #64 stopped waiting for its own CI: its CI gave no verdict within 2 minutes/.test(line)));
      assert.equal(called(world, 'mergePr').length, 0);
      assert.equal(called(world, 'addLabel').length, 0);
    });

    it('follows a push made while it waits and merges the new head', () => {
      const moved = 'f'.repeat(40);
      const world = fakeWorld({ prs: [component(65)], onOwnCiRead: (pr, reads) => { if (reads === 1) pr.headRefOid = moved; } });
      assert.equal(land(world, ['65']), 0);
      assert.ok(world.out.some((line) => /PR #65's head moved to fffffffff; waiting for that push's CI/.test(line)));
      assert.equal(called(world, 'mergePr')[0][2].sha, moved);
    });
  });

  it('takes the train when main moves into its files while its own CI runs', () => {
    let ready = false;
    const world = fakeWorld({ prs: [component(34)], mainMoves: () => (ready ? ['src/change-34.ts'] : []) });
    const markReady = world.deps.gh.markReady;
    world.deps.gh.markReady = (number) => {
      ready = true;
      return markReady(number);
    };
    assert.equal(land(world, ['34']), 0);
    assert.ok(world.out.some((line) => /FAIL disjoint-from-main: main also changed src\/change-34.ts/.test(line)));
    assert.ok(world.out.some((line) => /own CI is green, but it cannot merge directly; the train runs it on today's main/.test(line)));
    assert.equal(called(world, 'mergePr').length, 1, 'only the train merged');
    assert.notEqual(called(world, 'mergePr')[0][1], 34);
  });

  it('merges a green, disjoint pull request on the fast path without queueing it', () => {
    const world = fakeWorld({ prs: [component(22, { isDraft: false, statusCheckRollup: green() })] });
    assert.equal(land(world, ['22']), 0);
    const [merge] = called(world, 'mergePr');
    assert.equal(merge[1], 22);
    assert.equal(merge[2].sha, component(22).headRefOid);
    assert.equal(merge[2].title, 'feat: change 22 (#22)');
    assert.equal(merge[2].method, 'merge', 'the fast path must preserve original commits');
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
    assert.equal(called(world, 'markReady').length, 0, '--no-wait queues and leaves; it starts no run it will not wait for');
  });

  it('exits 1 when its pull request is ejected', () => {
    const world = fakeWorld({ prs: [component(25)], conflicts: new Set([25]) });
    assert.equal(land(world, ['25', '--no-fast']), 1);
    assert.ok(world.out.some((line) => /ERROR PR #25 was taken out of the queue/.test(line)));
  });

  it('plans without writing anything to GitHub', () => {
    const world = fakeWorld({
      prs: [component(31), component(32, { isDraft: false, statusCheckRollup: green() }), component(33), component(35, { files: ['src/moved.ts'] })],
      queued: [33],
      conflicts: new Set([35]),
      behindMain: (sha) => sha === component(35).headRefOid,
      readOnly: true,
    });
    assert.equal(land(world, ['--plan', '31', '32', '35']), 0);
    const text = world.out.join('\n');
    assert.match(text, /PR #31: fast path not eligible/);
    assert.match(text, /PR #31: would mark it ready and wait for its own CI, then merge directly if main has not moved/);
    assert.match(text, /PR #32: would merge now/);
    assert.match(text, /PR #35: would be queued/);
    assert.match(text, /next train \(2 of 2 queued\): chore\(merge\): #33 #35/);
    assert.match(text, /#35 feat\/change-35@35ccccccc: would conflict and be ejected/);
    assert.match(text, /\| feat: change 33 \(#33\)  \(Author 33\)/, 'the plan shows the commit main would get for each pull request');
    assert.match(text, /dry run: nothing was written to GitHub/);
    assert.deepEqual(world.calls.filter(([name]) => !['readPr'].includes(name)), [], 'plan made a write call');
  });

  it('plans the speculative train that would ride on the next one', () => {
    const world = fakeWorld({ prs: [component(51), component(52), component(53)], queued: [51, 52, 53], conflicts: new Set([53]), readOnly: true });
    assert.equal(land(world, ['--plan', '51', '--batch=1']), 0);
    const text = world.out.join('\n');
    assert.match(text, /train size 1 \(--batch\)/);
    assert.match(text, /next train \(1 of 3 queued\): chore\(merge\): #51 /);
    assert.match(text, /speculative train while its CI runs \(1\): chore\(merge\): #52 /);
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
    assert.match(flyingText, /next train \(1 of 1 queued\): chore\(merge\): #52 — feat: change 52\n.*from train #1990's head/);

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


describe('GitHub merge transport preserves history', () => {
  it('uses a SHA-pinned merge commit by default and refuses squash or rebase', () => {
    const calls = [];
    const github = createGithub('owner/repo', (args) => { calls.push(args); return JSON.stringify({ merged: true, sha: 'merged' }); });
    const sha = 'a'.repeat(40);
    assert.equal(github.mergePr(11, { sha }).ok, true);
    assert.ok(calls[0].includes('merge_method=merge'));
    assert.ok(calls[0].includes(`sha=${sha}`));
    for (const method of ['squash', 'rebase']) {
      assert.equal(github.mergePr(11, { sha, method }).ok, false);
    }
    assert.equal(calls.length, 1, 'rewriting requests must not reach GitHub');
  });

  it('titles a train merge commit with what it carries when asked', () => {
    const calls = [];
    const github = createGithub('owner/repo', (args) => { calls.push(args); return JSON.stringify({ merged: true, sha: 'merged' }); });
    github.mergePr(11, { sha: 'a'.repeat(40), title: 'Merge #10: fix(map): keep focus', message: '#10 fix(map): keep focus' });
    assert.ok(calls[0].includes('commit_title=Merge #10: fix(map): keep focus'));
    assert.ok(calls[0].includes('commit_message=#10 fix(map): keep focus'));
  });
});

describe('train history', () => {
  const row = (number, title, headRefName) => ({ number, title, state: 'MERGED', headRefName, comments: [] });

  it('reads trains titled the new and the old way, and only train branches', () => {
    const searches = [];
    const results = {
      'chore(merge):': [row(20, 'chore(merge): #19 — fix: x', 'train/20261009T000000Z-19'), row(21, 'chore(merge): tidy', 'chore/tidy')],
      'chore(train): land': [row(10, 'chore(train): land #9', 'train/20260926T000000Z-9')],
    };
    const github = createGithub('owner/repo', (args) => {
      const search = args[args.indexOf('--search') + 1];
      searches.push(search);
      return JSON.stringify(results[Object.keys(results).find((key) => search.includes(key))] ?? []);
    });
    assert.deepEqual(github.listTrainHistory().map((pr) => pr.number), [20, 10]);
    assert.equal(searches.length, 2);
  });

  it('reports unknown history when either search cannot be read', () => {
    let call = 0;
    const github = createGithub('owner/repo', () => (call++ === 0 ? '[]' : undefined));
    assert.equal(github.listTrainHistory(), null);
  });
});

describe('scheduled checks on main', () => {
  const now = Date.parse('2026-10-09T12:00:00Z');
  const [browser, acp, postMerge] = SCHEDULED_CHECKS;
  const CASES = [
    ['a green run from today says nothing', browser, { conclusion: 'success', createdAt: '2026-10-08T19:17:00Z', url: 'u' }, null],
    ['a red run names its day and link', browser, { conclusion: 'failure', createdAt: '2026-10-08T19:17:00Z', url: 'https://x/1' }, /full browser run on main failed on 2026-10-08 \(https:\/\/x\/1\)/],
    ['a green run older than two days says the schedule stalled', acp, { conclusion: 'success', createdAt: '2026-10-05T19:17:00Z', url: 'u' }, /is from 2026-10-05/],
    ['an old green browser push is not a stalled schedule: no merge, nothing to run', browser, { conclusion: 'success', createdAt: '2026-10-01T10:00:00Z', url: 'u' }, null],
    ['an unreadable run says nothing', browser, null, null],
    ['a red post-merge Checks run says main inherited the red', postMerge, { conclusion: 'failure', createdAt: '2026-10-09T10:00:00Z', url: 'https://x/3' }, /post-merge full Checks run on main failed on 2026-10-09 \(https:\/\/x\/3\)/],
    ['an old green post-merge run is not a stalled schedule', postMerge, { conclusion: 'success', createdAt: '2026-10-01T10:00:00Z', url: 'u' }, null],
    ['a red ACP registry check names the command that shows what moved', acp, { conclusion: 'failure', createdAt: '2026-10-08T03:41:00Z', url: 'https://x/2' }, /ACP registry check on main failed on 2026-10-08 .*`pnpm acp:registry:check`/],
  ];
  for (const [name, check, run, expected] of CASES) {
    it(name, () => {
      const said = describeScheduledRun(check, run, now);
      if (expected === null) assert.equal(said, null);
      else assert.match(said, expected);
    });
  }

  it('reads the newest finished scheduled run of the named workflow and survives an unreadable answer', () => {
    const calls = [];
    const finished = { conclusion: 'failure', createdAt: '2026-10-08T19:17:00Z', url: 'u' };
    const github = createGithub('owner/repo', (args) => { calls.push(args); return JSON.stringify([finished]); });
    assert.deepEqual(github.readScheduledRun('acp-registry.yml'), finished);
    assert.ok(calls[0].includes('acp-registry.yml') && calls[0].includes('schedule') && calls[0].includes('main'));
    assert.equal(createGithub('owner/repo', () => undefined).readScheduledRun('e2e.yml'), null);
  });

  it('reads past a cancelled main push to the newest verdict', () => {
    const calls = [];
    const red = { conclusion: 'failure', createdAt: '2026-10-09T09:00:00Z', url: 'u' };
    const github = createGithub('owner/repo', (args) => {
      calls.push(args);
      return JSON.stringify([{ conclusion: '' }, { conclusion: 'cancelled' }, red]);
    });
    assert.deepEqual(github.readScheduledRun('checks.yml', 'push'), red);
    assert.ok(calls[0].includes('push'));
  });

  it('warns at landing for every red check on main, and a red browser run names its failing specs', () => {
    const red = (workflow) => ({ conclusion: 'failure', createdAt: '2026-09-26T03:00:00Z', url: `https://x/${workflow}` });
    const world = fakeWorld({ prs: [component(71)] });
    world.deps.gh.readScheduledRun = (workflow) => (workflow === 'e2e.yml'
      ? { ...red(workflow), failingSpecs: ['tests/e2e/a.spec.ts', 'tests/e2e/b/c.spec.ts'] }
      : red(workflow));
    runPrLand(['71'], world.io, () => world.deps);
    const warnings = world.out.filter((line) => line.startsWith('ERROR warning:'));
    for (const workflow of ['e2e.yml', 'acp-registry.yml', 'checks.yml']) {
      assert.ok(warnings.some((line) => line.includes(`https://x/${workflow}`)), workflow);
    }
    const browser = warnings.find((line) => line.includes('https://x/e2e.yml'));
    assert.match(browser, /full browser run on main failed on 2026-09-26 \(https:\/\/x\/e2e\.yml\): tests\/e2e\/a\.spec\.ts, tests\/e2e\/b\/c\.spec\.ts; .*landing continues/);
  });

  it('reads the post-merge Checks verdict from the push run, not the nightly one', () => {
    const world = fakeWorld({ prs: [component(72)] });
    const asked = [];
    world.deps.gh.readScheduledRun = (workflow, event) => {
      asked.push(`${workflow}:${event ?? 'schedule'}`);
      return workflow === 'checks.yml' && event === 'push'
        ? { conclusion: 'failure', createdAt: '2026-09-26T03:00:00Z', url: 'https://x/push-run' }
        : { conclusion: 'success', createdAt: new Date(world.deps.now()).toISOString(), url: 'u' };
    };
    runPrLand(['72'], world.io, () => world.deps);
    assert.ok(asked.includes('checks.yml:push'), asked.join(', '));
    assert.ok(world.out.some((line) => line.startsWith('ERROR warning:') && line.includes('https://x/push-run')));
  });

  it('reads the full browser verdict from the push run with full-run checks, and nothing else does', () => {
    const world = fakeWorld({ prs: [component(73)] });
    const asked = [];
    world.deps.gh.readScheduledRun = (workflow, event, options = {}) => {
      asked.push(`${workflow}:${event ?? 'schedule'}:${options.fullBrowser === true}`);
      return workflow === 'e2e.yml' && event === 'push' && options.fullBrowser
        ? { conclusion: 'failure', createdAt: '2026-09-26T03:00:00Z', url: 'https://x/browser-push', failingSpecs: ['tests/e2e/a.spec.ts'] }
        : { conclusion: 'success', createdAt: new Date(world.deps.now()).toISOString(), url: 'u' };
    };
    runPrLand(['73'], world.io, () => world.deps);
    assert.deepEqual(asked.sort(), ['acp-registry.yml:schedule:false', 'checks.yml:push:false', 'e2e.yml:push:true']);
    assert.ok(world.out.some((line) => line.startsWith('ERROR warning:') && line.includes('https://x/browser-push')));
  });

  it('a red browser run on main is a line, not a refusal: the same landing still merges', () => {
    const land = (failing) => {
      const world = fakeWorld({ prs: [component(72)], queued: [72] });
      world.deps.gh.readScheduledRun = (workflow) => (workflow === 'e2e.yml' && failing
        ? { conclusion: 'failure', createdAt: '2026-09-26T03:00:00Z', url: 'https://x/run', failingSpecs: ['tests/e2e/a.spec.ts'] }
        : { conclusion: 'success', createdAt: '2026-09-26T03:00:00Z', url: 'https://x/run' });
      return { world, result: runConductor(world) };
    };
    const green = land(false);
    const red = land(true);
    assert.deepEqual(red.result.landed, green.result.landed);
    assert.deepEqual(red.result.landed, [72]);
    assert.match(called(red.world, 'openPr')[0][1].body, /- Not this train's gate: the full browser run on main failed on 2026-09-26 \(https:\/\/x\/run\): tests\/e2e\/a\.spec\.ts;/);
    assert.doesNotMatch(called(green.world, 'openPr')[0][1].body, /Not this train's gate/);
  });

  it('reads the newest push on main that really ran the full suite, and the specs its failed jobs annotated', () => {
    const calls = [];
    const artifacts = {
      9: 'playwright-timings-smoke-1\nplaywright-timings-smoke-2\n', // a push that planned only its change
      8: '', // a green push whose shards executed nothing
      6: 'playwright-timings-full-1\nplaywright-report-shard-3\nplaywright-timings-full-3\n',
    };
    const github = createGithub('owner/repo', (args) => {
      calls.push(args);
      if (args[0] === 'run') {
        return JSON.stringify([
          { conclusion: '', createdAt: '2026-10-09T11:00:00Z', url: 'running', databaseId: 11 },
          { conclusion: 'cancelled', createdAt: '2026-10-09T10:30:00Z', url: 'cancelled', databaseId: 10 },
          { conclusion: 'failure', createdAt: '2026-10-09T10:00:00Z', url: 'partial', databaseId: 9 },
          { conclusion: 'success', createdAt: '2026-10-09T09:00:00Z', updatedAt: '2026-10-09T09:10:00Z', url: 'empty', databaseId: 8 },
          { conclusion: 'success', createdAt: '2026-10-09T08:50:00Z', updatedAt: '2026-10-09T08:50:45Z', url: 'reused', databaseId: 5 },
          { conclusion: 'failure', createdAt: '2026-10-09T08:00:00Z', url: 'https://x/6', databaseId: 6 },
        ]);
      }
      const artifact = /\/actions\/runs\/(\d+)\/artifacts/.exec(args[1]);
      if (artifact) return artifacts[artifact[1]];
      if (args[1].endsWith('/actions/runs/6/jobs?per_page=100')) return '41\n42\n';
      if (args[1].endsWith('/check-runs/41/annotations')) return 'tests/e2e/b.spec.ts\ntests/e2e/a.spec.ts\n';
      if (args[1].endsWith('/check-runs/42/annotations')) return 'tests/e2e/a.spec.ts\n../etc/passwd\n';
      return undefined;
    });
    assert.deepEqual(github.readScheduledRun('e2e.yml', 'push', { fullBrowser: true }), {
      conclusion: 'failure', createdAt: '2026-10-09T08:00:00Z', url: 'https://x/6',
      failingSpecs: ['tests/e2e/a.spec.ts', 'tests/e2e/b.spec.ts'],
    });
    const listed = calls[0].join(' ');
    assert.match(listed, /--workflow e2e\.yml --event push --branch main/);
    assert.ok(calls.some((args) => args.includes('.[] | select(.title == "failing spec") | .path')));
    assert.equal(createGithub('owner/repo', () => undefined).readScheduledRun('e2e.yml', 'push', { fullBrowser: true }), null);
    assert.ok(!calls.some((args) => /\/runs\/5\//.test(args[1] ?? '')), 'a 45-second reused push costs no artifact read');
  });

  it('counts a run as full only by what its shards uploaded', () => {
    assert.equal(fullBrowserRunKind('success', ['playwright-timings-full-2', 'x']), 'full');
    assert.equal(fullBrowserRunKind('failure', ['playwright-timings-smoke-1']), 'partial');
    assert.equal(fullBrowserRunKind('success', ['playwright-timings-targeted-1']), 'partial');
    assert.equal(fullBrowserRunKind('success', ['playwright-timings-3']), 'partial', 'a push from before the mode was named');
    assert.equal(fullBrowserRunKind('success', []), 'empty', 'a reused push that ran nothing proves nothing');
    assert.equal(fullBrowserRunKind('failure', []), 'full', 'red before any spec ran is still red');
  });

  it('names only workflows that run on the event it reads', () => {
    for (const { workflow, event = 'schedule' } of SCHEDULED_CHECKS) {
      assert.match(readFileSync(join('.github/workflows', workflow), 'utf8'), new RegExp(`^ {2}${event}:`, 'm'), workflow);
    }
  });
});
