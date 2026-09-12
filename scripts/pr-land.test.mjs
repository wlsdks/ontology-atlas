import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CONFLICT_INSTRUCTION,
  LEASE_MINUTES,
  LOCK_REF,
  classifyLock,
  decideNext,
  describeLock,
  isBrowserCommand,
  isCiOwnedCommand,
  localCheckPlan,
  mergeFiredCi,
  parseArgs,
  refuseLanding,
  requiredCheckState,
  runInFlight,
} from './pr-land.mjs';

/**
 * The landing state machine, driven by `gh` output recorded from this
 * repository on 2026-09-12. No network: every input here is a literal, which is
 * the only way this suite can run in the same lane as the gates it guards.
 *
 * The recorded rollup is PR #1572's, which is exactly the interesting case:
 * eleven contexts reported, eight of them required, and one of the eight
 * (`Unit · Contract`) red. A lander that read "eleven checks, ten green" would
 * have merged it.
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
 * What a draft pull request's checks look like.
 *
 * Every job in `checks.yml` and `e2e.yml` carries
 * `github.event.pull_request.draft == false`, so a draft's jobs are skipped and
 * GitHub reports them `skipped`. Branch protection counts a skipped job as
 * satisfied, which is the one reading that would let this lander merge a draft
 * nothing ran on.
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

const draftPr = (overrides = {}) => ({
  ...RECORDED_PR,
  isDraft: true,
  mergeStateStatus: 'DRAFT',
  statusCheckRollup: DRAFT_ROLLUP,
  ...overrides,
});

const readyPr = (overrides = {}) => ({
  ...RECORDED_PR,
  isDraft: false,
  mergeStateStatus: 'CLEAN',
  statusCheckRollup: GREEN_ROLLUP,
  ...overrides,
});

const NOW = Date.parse('2026-09-12T12:00:00Z');
const freeLock = { state: 'free', holder: null, ageMinutes: null };
const myLock = classifyLock({
  payload: { pr: 1572, token: 'me', acquiredAt: '2026-09-12T11:59:00Z' },
  nowMs: NOW,
});
const holding = { lock: myLock, selfLock: 'me', requiredContexts: REQUIRED_CONTEXTS };

describe('pr:land argument parsing', () => {
  it('reads a number with or without a hash', () => {
    assert.equal(parseArgs(['1572']).number, 1572);
    assert.equal(parseArgs(['#1572']).number, 1572);
    assert.equal(parseArgs(['--', '1572']).number, 1572);
  });

  it('reads the cleanup and worktree paths in both spellings', () => {
    assert.equal(parseArgs(['12', '--cleanup', '/tmp/wt']).cleanup, '/tmp/wt');
    assert.equal(parseArgs(['12', '--cleanup=/tmp/wt']).cleanup, '/tmp/wt');
    assert.equal(parseArgs(['12', '--worktree', '/tmp/wt']).worktree, '/tmp/wt');
    assert.equal(parseArgs(['12', '--worktree=/tmp/wt']).worktree, '/tmp/wt');
  });

  it('defaults the worktree to the caller, which is the branch it wrote', () => {
    assert.equal(parseArgs(['12']).worktree, null);
  });

  it('needs no number for the queue and the release valve, but does for early CI', () => {
    assert.equal(parseArgs(['--queue']).queue, true);
    assert.equal(parseArgs(['--release']).release, true);
    assert.equal(parseArgs(['--ci', '1572']).ci, true);
    assert.throws(() => parseArgs(['--ci']), /pull request number/);
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
  it('lands only an open pull request', () => {
    assert.equal(refuseLanding(readyPr()), null);
    assert.equal(refuseLanding(draftPr()), null);
    assert.match(refuseLanding({ ...RECORDED_PR, state: 'CLOSED' }), /is closed, not open/);
    assert.match(refuseLanding({ ...RECORDED_PR, state: 'MERGED' }), /is merged, not open/);
  });

  it('hands a conflict back to the author, and says the lock was released', () => {
    const dirty = refuseLanding({ ...RECORDED_PR, mergeStateStatus: 'DIRTY' });
    assert.equal(dirty, CONFLICT_INSTRUCTION);
    assert.match(dirty, /git fetch origin && git merge origin\/main/);
    assert.match(dirty, /pnpm pr:land <number>/);
    assert.match(dirty, /landing lock was\n  released/);
    // Generated docs-vault JSON, the changelog and the ledger are the recurring
    // conflict in this repository, and hand-resolving them is forbidden
    // (`.claude/rules/git.md`, "Do not"), so the refusal names the tool.
    assert.match(dirty, /pnpm docs-vault:resolve-conflicts/);
    // `mergeable` and `mergeStateStatus` disagree while GitHub is still
    // computing the merge; either saying conflict is a refusal.
    assert.equal(refuseLanding({ ...RECORDED_PR, mergeable: 'CONFLICTING' }), CONFLICT_INSTRUCTION);
  });

  it('leaves a fork pull request to a person', () => {
    assert.match(refuseLanding({ ...readyPr(), isCrossRepository: true }), /fork/);
  });
});

describe('the landing lock', () => {
  it('names one ref, so the create is the mutex', () => {
    assert.equal(LOCK_REF, 'refs/atlas/landing-lock');
  });

  it('reads a fresh lock as held and an unrefreshed one as stale', () => {
    const payload = {
      pr: 1570,
      holder: 'stark',
      host: 'mbp',
      acquiredAt: '2026-09-12T11:58:00Z',
      leaseMinutes: LEASE_MINUTES,
    };
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

  it('honours a lease the holder wrote, not only the default', () => {
    assert.equal(classifyLock({ payload: { pr: 1, acquiredAt: '2026-09-12T11:50:00Z', leaseMinutes: 5 }, nowMs: NOW }).state, 'stale');
  });

  it('says who holds it and for how long', () => {
    const payload = { pr: 1570, holder: 'stark', host: 'mbp', acquiredAt: '2026-09-12T11:30:00Z' };
    assert.match(describeLock(classifyLock({ payload, nowMs: NOW })), /PR #1570 held by stark@mbp since 30 min ago/);
    assert.match(describeLock(classifyLock({ payload: null, nowMs: NOW })), /nothing is landing/);
  });
});

describe('the local lanes, and what is left to CI', () => {
  it('leaves browser evidence to the one CI run', () => {
    assert.equal(isBrowserCommand('pnpm exec playwright test tests/e2e/a.spec.ts'), true);
    assert.equal(isBrowserCommand('pnpm test:e2e:static'), true);
    assert.equal(isBrowserCommand('pnpm lint'), false);
    assert.equal(isBrowserCommand('pnpm exec vitest run tests/contract'), false);
  });

  it('builds the local plan from the repository own path-to-check authority', () => {
    // `scripts/pr-land.mjs` is a script, so the suggester routes it to the
    // dead-code and language lanes rather than to anything browser-shaped.
    const plan = localCheckPlan(['scripts/pr-land.mjs', 'app/globals.css']);
    assert.ok(plan.commands.length > 0, 'a changed script must recommend at least one local lane');
    assert.equal(plan.commands.some((row) => isBrowserCommand(row.command)), false);
    assert.equal(plan.deferred.every((row) => isCiOwnedCommand(row.command)), true);
    // Nothing is silently dropped: every suggestion is either run or deferred.
    assert.equal(plan.commands.length + plan.deferred.length, plan.suggestions.commands.length);
  });

  it('returns an empty plan for a path no check claims', () => {
    assert.deepEqual(localCheckPlan([]).commands, []);
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
   * **The state that wedged the repository** (measured 2026-09-12, PR #1578).
   *
   * The draft design makes every context report twice: `SKIPPED` while the pull
   * request was a draft, then for real after `gh pr ready`. Both stay in the
   * rollup, in no guaranteed order. Keeping whichever came last read a genuinely
   * FAILED `Unit · Contract` as `SKIPPED`, which this function calls "never ran",
   * which polls — so the landing held the lock for 45 minutes with the answer
   * already on the screen, and nothing else could land.
   *
   * The recorded mixture below is the real rollup from that pull request: fourteen
   * green, one failure, and the draft's `SKIPPED` twin for every one of them.
   */
  it('resolves a name that reported twice, so a draft skip cannot bury a real failure', () => {
    const draftTwin = (name) => ({
      name,
      status: 'COMPLETED',
      conclusion: 'SKIPPED',
      startedAt: '2026-09-12T13:20:00Z',
      completedAt: '2026-09-12T13:20:01Z',
    });
    const real = (name, conclusion) => ({
      name,
      status: 'COMPLETED',
      conclusion,
      startedAt: '2026-09-12T13:38:00Z',
      completedAt: '2026-09-12T13:42:30Z',
      detailsUrl: 'https://github.com/wlsdks/ontology-atlas/actions/runs/34696960152/job/1',
    });

    // The failure first and its draft twin last: the order that caused the hang.
    const mixed = [
      real('Unit · Contract', 'FAILURE'),
      ...REQUIRED_CONTEXTS.filter((name) => name !== 'Unit · Contract').map((name) => real(name, 'SUCCESS')),
      ...REQUIRED_CONTEXTS.map(draftTwin),
      // The phantom a matrix job reports when its own `if` skips it before expansion.
      draftTwin('Unit · Contract ${{ matrix.shard }}/3'),
      draftTwin('Playwright (chromium ${{ matrix.shard }}/3)'),
    ];

    const verdict = requiredCheckState({ rollup: mixed, requiredContexts: REQUIRED_CONTEXTS });
    assert.equal(verdict.state, 'failed', 'a real failure must end the landing, not poll');
    assert.deepEqual(verdict.failed.map((check) => check.name), ['Unit · Contract']);
    assert.match(verdict.failed[0].url, /actions\/runs\//, 'the refusal must name where to look');
    assert.deepEqual(verdict.skipped, [], 'no required context is still reading as skipped');
    assert.deepEqual(verdict.pending, []);

    // The same mixture with the twin first must read identically — order is not
    // allowed to decide a verdict.
    const reversed = requiredCheckState({ rollup: [...mixed].reverse(), requiredContexts: REQUIRED_CONTEXTS });
    assert.equal(reversed.state, 'failed');
    assert.deepEqual(reversed.failed.map((check) => check.name), ['Unit · Contract']);
  });

  /**
   * **The landing aborted on its own superseded run** (measured 2026-09-12, #1578).
   *
   * Pushing to a **ready** pull request fires `synchronize`. That run set appeared at
   * 14:34:11; the lander decided nothing had run yet and toggled draft, firing a
   * second set at 14:34:24, whose `cancel-in-progress` killed the first. Both stay in
   * the rollup, so `MCP` reported `CANCELLED` (started 14:34:27) beside `MCP`
   * `IN_PROGRESS` (started 14:34:55) — and resolving by verdict put the corpse in
   * front, because a completed cancellation outranks a running job.
   *
   * Recency settles it. `startedAt` and not `completedAt`: a superseded run is
   * cancelled *after* its successor began, so its completion is the later stamp.
   */
  it('treats a cancelled context as pending when a newer run for the same head is live', () => {
    const superseded = (name) => ({
      name,
      status: 'COMPLETED',
      conclusion: 'CANCELLED',
      startedAt: '2026-09-12T14:34:27Z',
      completedAt: '2026-09-12T14:34:27Z',
      detailsUrl: 'https://github.com/wlsdks/ontology-atlas/actions/runs/34699667144/job/1',
    });
    const live = (name) => ({
      name,
      status: 'IN_PROGRESS',
      conclusion: null,
      startedAt: '2026-09-12T14:34:55Z',
      // GitHub writes the year 1 as the completion of anything still running.
      completedAt: '0001-01-01T00:00:00Z',
    });

    const rollup = REQUIRED_CONTEXTS.flatMap((name) => [superseded(name), live(name)]);
    const verdict = requiredCheckState({ rollup, requiredContexts: REQUIRED_CONTEXTS });
    assert.equal(verdict.state, 'waiting', 'a landing must not abort on its own superseded run');
    assert.deepEqual(verdict.failed, []);
    assert.equal(verdict.pending.length, REQUIRED_CONTEXTS.length);

    // Order must not decide it, in either direction.
    const reversed = requiredCheckState({ rollup: [...rollup].reverse(), requiredContexts: REQUIRED_CONTEXTS });
    assert.equal(reversed.state, 'waiting');

    // And once nothing newer exists, the cancellation is decisive again.
    const alone = requiredCheckState({
      rollup: REQUIRED_CONTEXTS.map(superseded),
      requiredContexts: REQUIRED_CONTEXTS,
    });
    assert.equal(alone.state, 'failed');
    assert.equal(alone.failed.length, REQUIRED_CONTEXTS.length);
  });

  it('does not ask GitHub for a run while one is already on its way', () => {
    const queued = { name: 'MCP', status: 'QUEUED', conclusion: null, startedAt: '2026-09-12T14:34:11Z' };
    const done = { name: 'MCP', status: 'COMPLETED', conclusion: 'SUCCESS', startedAt: '2026-09-12T14:34:11Z' };
    assert.equal(runInFlight({ statusCheckRollup: [queued] }), true);
    assert.equal(runInFlight({ statusCheckRollup: [{ ...queued, status: 'IN_PROGRESS' }] }), true);
    assert.equal(runInFlight({ statusCheckRollup: [done] }), false);
    assert.equal(runInFlight({ statusCheckRollup: [] }), false);
    assert.equal(runInFlight({}), false);

    // The push's run set has appeared but not reported: nothing to re-fire.
    const ready = readyPr({ statusCheckRollup: [queued] });
    assert.equal(
      decideNext({ ...holding, pr: ready, localChecksPassed: true }).action,
      'wait-checks',
      'toggling here fires a second run set that cancels the first',
    );

    /*
     * The gap that actually caused it: an **empty** rollup, read in the moment
     * between a push to a ready pull request and GitHub registering its run set.
     * `runInFlight` cannot see that — there is nothing to see — so the only thing
     * separating "no run is coming" from "it has not appeared yet" is looking twice.
     */
    const silent = readyPr({ statusCheckRollup: [] });
    assert.equal(
      decideNext({ ...holding, pr: silent, localChecksPassed: true, emptyRollupObservations: 1 }).action,
      'wait-checks',
      'one empty reading is the push-to-run-set gap, not a pull request with no event left',
    );
    assert.equal(
      decideNext({ ...holding, pr: silent, localChecksPassed: true, emptyRollupObservations: 2 }).action,
      'refire-ci',
      'a second empty reading means there really is no run to wait for',
    );
  });

  it('reads a running check from startedAt, not from the year 1 it reports as completion', () => {
    // GitHub writes `0001-01-01T00:00:00Z` as the completion of anything in flight.
    // Parsed as a real instant it makes every running check the oldest entry there
    // is, which hands the verdict straight back to a superseded run.
    const superseded = {
      name: 'MCP',
      status: 'COMPLETED',
      conclusion: 'CANCELLED',
      startedAt: '2026-09-12T14:34:27Z',
      completedAt: '2026-09-12T14:34:27Z',
    };
    const live = {
      name: 'MCP',
      status: 'IN_PROGRESS',
      conclusion: null,
      startedAt: '2026-09-12T14:34:55Z',
      completedAt: '0001-01-01T00:00:00Z',
    };
    const rest = GREEN_ROLLUP.filter((run) => run.name !== 'MCP');
    for (const order of [[superseded, live], [live, superseded]]) {
      const verdict = requiredCheckState({ rollup: [...rest, ...order], requiredContexts: REQUIRED_CONTEXTS });
      assert.equal(verdict.state, 'waiting');
      assert.deepEqual(verdict.pending, ['MCP']);
      assert.deepEqual(verdict.failed, []);
    }
  });

  it('ends the landing on a cancelled required context, not only a failed one', () => {
    // A shard cancelled by its own `timeout-minutes` is how #1578 actually went
    // red. `CANCELLED` is not `SUCCESS` and not `SKIPPED`, so it must be decisive.
    const rollup = GREEN_ROLLUP.map((run) =>
      run.name === 'Unit · Contract' ? { ...run, conclusion: 'CANCELLED' } : run,
    );
    const verdict = requiredCheckState({ rollup, requiredContexts: REQUIRED_CONTEXTS });
    assert.equal(verdict.state, 'failed');
    assert.deepEqual(verdict.failed.map((check) => check.conclusion), ['CANCELLED']);
  });

  it('takes the later of two real verdicts, which is what a re-run means', () => {
    const first = { name: 'MCP', status: 'COMPLETED', conclusion: 'FAILURE', completedAt: '2026-09-12T13:00:00Z' };
    const rerun = { name: 'MCP', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-09-12T14:00:00Z' };
    const rest = GREEN_ROLLUP.filter((run) => run.name !== 'MCP');
    assert.equal(requiredCheckState({ rollup: [...rest, first, rerun], requiredContexts: REQUIRED_CONTEXTS }).state, 'green');
    assert.equal(requiredCheckState({ rollup: [...rest, rerun, first], requiredContexts: REQUIRED_CONTEXTS }).state, 'green');
  });

  it('is green only when every required context reported success', () => {
    assert.equal(requiredCheckState({ rollup: GREEN_ROLLUP, requiredContexts: REQUIRED_CONTEXTS }).state, 'green');
  });

  it('refuses a draft skip as green, because a skipped job executed no line', () => {
    // Branch protection counts a skipped job as satisfied. This is the reading
    // that keeps the draft design safe.
    const verdict = requiredCheckState({ rollup: DRAFT_ROLLUP, requiredContexts: REQUIRED_CONTEXTS });
    assert.equal(verdict.state, 'waiting');
    assert.equal(verdict.skipped.length, 8);
    assert.equal(verdict.neverRan, true);
  });

  it('waits for a running context and for one that has not reported at all', () => {
    const running = GREEN_ROLLUP.map((run) => (run.name === 'MCP' ? { ...run, status: 'IN_PROGRESS', conclusion: null } : run));
    const waiting = requiredCheckState({ rollup: running, requiredContexts: REQUIRED_CONTEXTS });
    assert.equal(waiting.state, 'waiting');
    assert.deepEqual(waiting.pending, ['MCP']);
    assert.equal(waiting.neverRan, false);

    const silent = requiredCheckState({
      rollup: GREEN_ROLLUP.filter((run) => run.name !== 'MCP'),
      requiredContexts: REQUIRED_CONTEXTS,
    });
    assert.equal(silent.state, 'waiting');
    assert.deepEqual(silent.missing, ['MCP']);
  });

  it('ignores a green check nobody required', () => {
    // `Vault freshness check` is advisory. A lander that waited for every
    // reported check would block on any future advisory lane.
    const verdict = requiredCheckState({
      rollup: [...GREEN_ROLLUP, { name: 'Verify unsigned Windows x64 beta', status: 'IN_PROGRESS', conclusion: null }],
      requiredContexts: REQUIRED_CONTEXTS,
    });
    assert.equal(verdict.state, 'green');
  });
});

describe('one landing, in order', () => {
  it('takes a free lock before it looks at anything else', () => {
    assert.equal(decideNext({ pr: draftPr(), lock: freeLock, requiredContexts: REQUIRED_CONTEXTS }).action, 'take-lock');
  });

  it('waits behind the agent already landing', () => {
    const lock = classifyLock({
      payload: { pr: 1570, holder: 'stark', host: 'mbp', acquiredAt: '2026-09-12T11:59:00Z' },
      nowMs: NOW,
    });
    const step = decideNext({ pr: draftPr(), lock, requiredContexts: REQUIRED_CONTEXTS });
    assert.equal(step.action, 'wait-lock');
    assert.equal(step.lock.holder.pr, 1570);
  });

  it('takes over a lock whose holder stopped refreshing it', () => {
    const lock = classifyLock({
      payload: { pr: 1570, holder: 'stark', host: 'mbp', acquiredAt: '2026-09-12T10:00:00Z' },
      nowMs: NOW,
    });
    assert.equal(decideNext({ pr: draftPr(), lock, requiredContexts: REQUIRED_CONTEXTS }).action, 'take-stale-lock');
  });

  it('does not mistake someone else lock for its own', () => {
    const lock = classifyLock({ payload: { pr: 1570, token: 'them', acquiredAt: '2026-09-12T11:59:00Z' }, nowMs: NOW });
    assert.equal(decideNext({ pr: draftPr(), lock, selfLock: 'me', requiredContexts: REQUIRED_CONTEXTS }).action, 'wait-lock');
  });

  it('refuses before it takes the lock, so a conflict never blocks the queue', () => {
    const step = decideNext({
      pr: { ...RECORDED_PR, mergeStateStatus: 'DIRTY' },
      lock: freeLock,
      requiredContexts: REQUIRED_CONTEXTS,
    });
    assert.equal(step.action, 'refuse');
    assert.equal(step.reason, CONFLICT_INSTRUCTION);
  });

  it('pours main in first, while a push is still free', () => {
    const step = decideNext({ ...holding, pr: draftPr(), behindBy: 7 });
    assert.equal(step.action, 'merge-main');
    assert.equal(step.behindBy, 7);
  });

  it('then runs the local lanes on the merged source, before CI is fired', () => {
    assert.equal(decideNext({ ...holding, pr: draftPr(), behindBy: 0 }).action, 'local-checks');
  });

  it('then marks the draft ready, which is the one CI run', () => {
    assert.equal(decideNext({ ...holding, pr: draftPr(), localChecksPassed: true }).action, 'make-ready');
  });

  it('does not pay the local lanes again once the pull request is ready', () => {
    const running = DRAFT_ROLLUP.map((run) => ({ ...run, status: 'IN_PROGRESS', conclusion: null }));
    const step = decideNext({ ...holding, pr: readyPr({ statusCheckRollup: running }), ciRequested: true });
    assert.equal(step.action, 'wait-checks');
  });

  it('asks for the one run a ready pull request never had, exactly once', () => {
    /*
     * Two empty readings, not one (measured 2026-09-12, #1578). `mergeFiredCi` only
     * knows about the merge **this landing** made; a push someone else made to a ready
     * pull request fires `synchronize` too, and the run set takes a moment to appear.
     * Reading one empty rollup and toggling fired a second set that cancelled the
     * first, and the landing then aborted on the corpse.
     */
    const empty = readyPr({ statusCheckRollup: [] });
    assert.equal(decideNext({ ...holding, pr: empty, emptyRollupObservations: 1 }).action, 'wait-checks');
    assert.equal(decideNext({ ...holding, pr: empty, emptyRollupObservations: 2 }).action, 'refire-ci');
    // With the run already requested there is nothing left to do but wait; a
    // second toggle would cancel the run it just asked for.
    assert.equal(
      decideNext({ ...holding, pr: empty, ciRequested: true, emptyRollupObservations: 9 }).action,
      'wait-checks',
    );
  });

  it('never re-fires when a run is already in flight', () => {
    const partial = [GREEN_ROLLUP[3], { name: 'MCP', status: 'IN_PROGRESS', conclusion: null }];
    assert.equal(decideNext({ ...holding, pr: readyPr({ statusCheckRollup: partial }) }).action, 'wait-checks');
  });

  it('knows which push already asked for the one CI run', () => {
    // A ready pull request's merge commit is a `synchronize` event, so CI is
    // already starting; a draft's push runs nothing. Reading this backwards
    // makes the lander toggle draft on a run in flight, cancelling it and
    // paying for a second.
    assert.equal(mergeFiredCi({ merged: true, isDraft: false }), true);
    assert.equal(mergeFiredCi({ merged: true, isDraft: true }), false);
    assert.equal(mergeFiredCi({ merged: false, isDraft: false }), false);
  });

  it('never re-fires CI on a ready pull request whose merge commit just landed', () => {
    // The merge commit is a head with no checks yet, which reads as "nothing
    // ever ran". With the push counted as the request, the lander waits.
    const freshHead = readyPr({ statusCheckRollup: [], headRefOid: 'f00dcafe0' });
    assert.equal(decideNext({ ...holding, pr: freshHead, ciRequested: true }).action, 'wait-checks');
    // Without it, it would toggle draft and buy a second run — once the empty rollup
    // has been seen twice, which is the separate guard for a run that is merely slow
    // to appear.
    assert.equal(decideNext({ ...holding, pr: freshHead, emptyRollupObservations: 2 }).action, 'refire-ci');
  });

  it('stops on a failing required check and names the job to open', () => {
    const step = decideNext({ ...holding, pr: RECORDED_PR, ciRequested: true });
    assert.equal(step.action, 'fail-checks');
    assert.match(step.checks.failed[0].url, /job\/103534040573/);
  });

  it('merges only with the lock held, main already in, and every required context green', () => {
    assert.equal(decideNext({ ...holding, pr: readyPr(), ciRequested: true }).action, 'merge');
    // Main moving underneath is impossible while the lock is held, but if the
    // comparison ever says so, the merge waits for a rebuilt tree.
    assert.equal(decideNext({ ...holding, pr: readyPr(), behindBy: 1, ciRequested: true }).action, 'merge-main');
  });

  it('reports an already merged pull request as done rather than as a refusal', () => {
    assert.equal(decideNext({ pr: { ...RECORDED_PR, state: 'MERGED' }, lock: freeLock, requiredContexts: REQUIRED_CONTEXTS }).action, 'done');
  });

  it('walks a whole draft landing without ever repeating a step', () => {
    // The sequence the header promises: lock, merge main, local checks, ready,
    // one CI run, merge.
    const seen = [];
    let pr = draftPr();
    let lock = freeLock;
    let selfLock = null;
    let localChecksPassed = false;
    let ciRequested = false;
    let behindBy = 4;
    for (let guard = 0; guard < 10; guard += 1) {
      const step = decideNext({ pr, lock, behindBy, requiredContexts: REQUIRED_CONTEXTS, selfLock, localChecksPassed, ciRequested });
      seen.push(step.action);
      if (step.action === 'take-lock') {
        lock = myLock;
        selfLock = 'me';
      } else if (step.action === 'merge-main') behindBy = 0;
      else if (step.action === 'local-checks') localChecksPassed = true;
      else if (step.action === 'make-ready') {
        ciRequested = true;
        pr = readyPr({ statusCheckRollup: DRAFT_ROLLUP.map((run) => ({ ...run, status: 'IN_PROGRESS', conclusion: null })) });
      } else if (step.action === 'wait-checks') pr = readyPr();
      else break;
    }
    assert.deepEqual(seen, ['take-lock', 'merge-main', 'local-checks', 'make-ready', 'wait-checks', 'merge']);
  });
});

 it('defers whole suites to required CI but retains focused checks and custom invocations', async () => {
  for (const command of ['pnpm knip', 'pnpm test:contracts', 'pnpm test:run']) assert.equal(isCiOwnedCommand(command), true);
  for (const command of ['pnpm test:run src/a.test.ts', 'pnpm test:contracts --reporter=json', 'pnpm lint', 'pnpm exec tsc --noEmit']) assert.equal(isCiOwnedCommand(command), false);
  const { buildImpactPlan } = await import('./classify-change.mjs');
  const { commandsForLane } = await import('./run-ci-lane.mjs');
  const paths = ['app/globals.css', 'src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx'];
  const local = localCheckPlan(paths);
  const ci = buildImpactPlan({ files: paths });
  assert.ok(local.deferred.some((row) => row.command === 'pnpm knip'));
  assert.ok(local.deferred.some((row) => row.command === 'pnpm test:contracts'));
  const commands = commandsForLane({lane:'unit', plan:ci, base:'origin/main', shard:'1/1'});
  assert.ok(commands.includes('pnpm knip'));
  assert.ok(commands.some((command) => command.includes('vitest run tests/contract')));
  assert.ok(local.commands.some((row) => row.command.includes('AppSettingsMenu.test.tsx')));
 });
