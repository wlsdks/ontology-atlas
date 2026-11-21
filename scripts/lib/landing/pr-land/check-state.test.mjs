import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { REQUIRED_CONTEXTS, RECORDED_ROLLUP, GREEN_ROLLUP, DRAFT_ROLLUP, ROLLUP_WITH_RED_UNREQUIRED } from './recorded-rollup.mjs';
import { runInFlight, requiredCheckState, otherCheckState } from './check-state.mjs';
import { trainCiStep } from '../landing-train.mjs';

/** The train's CI result for a rollup, the way the conductor reads it. */
const trainStep = (rollup, extra = {}) => trainCiStep({
  checks: requiredCheckState({ rollup, requiredContexts: REQUIRED_CONTEXTS }),
  other: otherCheckState({ rollup, requiredContexts: REQUIRED_CONTEXTS, allowFailing: extra.allowFailing ?? [] }),
  inFlight: runInFlight({ statusCheckRollup: rollup }),
  emptyRollupObservations: extra.empty ?? 0,
  refires: extra.refires ?? 0,
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

  it('ignores a cancelled job whose workflow ran again on the same head, even under a name the rerun never reports', () => {
    const job = (name, run, conclusion) => ({
      name, status: 'COMPLETED', conclusion, workflowName: 'E2E smoke',
      detailsUrl: `https://github.com/wlsdks/ontology-atlas/actions/runs/${run}/job/1`,
    });
    const rollup = [
      ...REQUIRED_CONTEXTS.map((name) => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS' })),
      job('Playwright (chromium ${{ matrix.shard }}/3)', 44345450845, 'CANCELLED'),
      job('Playwright (web surface)', 44345450845, 'CANCELLED'),
      job('Playwright (web surface)', 44345543916, 'SUCCESS'),
    ];
    assert.equal(otherCheckState({ rollup, requiredContexts: REQUIRED_CONTEXTS }).state, 'clear');
    const unreplaced = rollup.filter((check) => !String(check.detailsUrl).includes('44345543916'));
    assert.equal(otherCheckState({ rollup: unreplaced, requiredContexts: REQUIRED_CONTEXTS }).state, 'failed');
    const failedNotCancelled = [...rollup, job('Old red lane', 44345450845, 'FAILURE')];
    assert.deepEqual(otherCheckState({ rollup: failedNotCancelled, requiredContexts: REQUIRED_CONTEXTS }).failed.map((c) => c.name), ['Old red lane']);
  });

  it('treats a skipped unrequired lane as no failure', () => {
    const rollup = [
      ...REQUIRED_CONTEXTS.map((name) => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS' })),
      { name: 'inactive lane', status: 'COMPLETED', conclusion: 'SKIPPED' },
    ];
    assert.equal(otherCheckState({ rollup, requiredContexts: REQUIRED_CONTEXTS }).state, 'clear');
    assert.equal(trainStep(rollup).action, 'green');
  });

  it('waits for an unrequired lane still running after every required context is green', () => {
    const rollup = [
      ...REQUIRED_CONTEXTS.map((name) => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS' })),
      { name: 'Verify unsigned Windows x64 beta', status: 'IN_PROGRESS', conclusion: '' },
    ];
    const other = otherCheckState({ rollup, requiredContexts: REQUIRED_CONTEXTS });
    assert.equal(other.state, 'running');
    assert.deepEqual(other.running, ['Verify unsigned Windows x64 beta']);
    assert.equal(trainStep(rollup).action, 'wait');
    assert.equal(trainStep(rollup, { allowFailing: ['Verify unsigned Windows x64 beta'] }).action, 'green');
  });
});
