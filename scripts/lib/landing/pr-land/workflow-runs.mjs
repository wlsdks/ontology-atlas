/**
 * What a head's workflow runs prove when its rollup cannot: a workflow GitHub could not start
 * reports no check at all, so its contexts would read as "not yet" until the train times out.
 */

/**
 * After every workflow run for the head finished, how long a required context may stay unreported
 * before it counts as never reporting. The REST run list leads the GraphQL rollup by seconds to a
 * minute, and a late-triggered workflow can appear after the others finished; three minutes covers
 * both and is still a thirtieth of the train timeout.
 */
export const UNREPORTED_GRACE_MS = 3 * 60_000;

const reportsJobs = (rollup, runId) => rollup.some((check) => String(check?.detailsUrl ?? check?.targetUrl ?? '').includes(`/actions/runs/${runId}/`));

/**
 * Runs that ended without a job: `startup_failure`, or `failure` with zero jobs, which is how
 * GitHub records a workflow file it could not parse. No rerun can change either.
 */
export function brokenRuns({ runs = [], rollup = [], jobCount }) {
  const broken = [];
  for (const run of runs) {
    if (run.status !== 'completed') continue;
    const name = run.path || run.name;
    if (run.conclusion === 'startup_failure') {
      broken.push({ name, conclusion: 'never started (startup_failure)', url: run.url ?? null });
    } else if (run.conclusion === 'failure' && !reportsJobs(rollup, run.id) && jobCount(run.id) === 0) {
      broken.push({ name, conclusion: 'failed before any job ran (workflow file error)', url: run.url ?? null });
    }
  }
  return broken;
}

/** Every run for the head has finished, and there is at least one. */
export function allRunsFinished(runs = []) {
  return runs.length > 0 && runs.every((run) => run.status === 'completed');
}
