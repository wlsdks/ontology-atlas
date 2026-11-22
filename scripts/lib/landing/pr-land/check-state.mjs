/** What a pull request's check rollup proves: the newest result per context, required or not. */

/** 2 means completed with a real result, 1 still running, 0 `SKIPPED`. */
function verdictRank(run) {
  const status = String(run?.status ?? run?.state ?? '').toUpperCase();
  const conclusion = String(run?.conclusion ?? run?.state ?? '').toUpperCase();
  if (status !== 'COMPLETED') return 1;
  return conclusion === 'SKIPPED' ? 0 : 2;
}

/**
 * When a rollup entry's check run **started**, which is what orders two runs. `startedAt`, not
 * `completedAt`: a superseded run is cancelled after its successor began, and GitHub writes
 * `0001-01-01T00:00:00Z` as the completion of anything in flight.
 */
function runStamp(run) {
  for (const field of [run?.startedAt, run?.completedAt]) {
    if (!field) continue;
    const ms = Date.parse(field);
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

function workflowRunId(check) {
  const id = /\/actions\/runs\/(\d+)\//.exec(String(check?.detailsUrl ?? check?.targetUrl ?? ''))?.[1];
  return id ? Number(id) : null;
}

/**
 * Drops a cancelled check whose workflow ran again on the same head. A run cancelled before its
 * matrix expanded leaves a job named `... ${{ matrix.shard }}/3` that its successor never reports,
 * so no newer result under that name would ever replace it.
 */
function withoutSupersededCancels(rollup) {
  const newestRun = new Map();
  for (const check of rollup) {
    const id = workflowRunId(check);
    if (id !== null && check.workflowName) newestRun.set(check.workflowName, Math.max(newestRun.get(check.workflowName) ?? 0, id));
  }
  return rollup.filter((check) => {
    if (String(check?.conclusion ?? '').toUpperCase() !== 'CANCELLED') return true;
    const id = workflowRunId(check);
    return id === null || !check.workflowName || id >= newestRun.get(check.workflowName);
  });
}

/**
 * The newest real result per context name. One name reports several times (a draft's `SKIPPED`,
 * the real run, a rerun): the newest run wins and rank breaks ties without stamps. Keeping the
 * last listed misread a real FAILURE as never ran.
 */
function latestByName(rollup = []) {
  const byName = new Map();
  for (const run of withoutSupersededCancels(rollup)) {
    const name = run?.name ?? run?.context;
    if (!name) continue;
    const held = byName.get(name);
    if (!held) {
      byName.set(name, run);
      continue;
    }
    const newer = runStamp(run) - runStamp(held);
    const better = newer > 0 || (newer === 0 && verdictRank(run) > verdictRank(held));
    if (better) byName.set(name, run);
  }
  return byName;
}

function isFailedRun(run) {
  const status = String(run?.status ?? run?.state ?? '').toUpperCase();
  if (status !== 'COMPLETED') return false;
  const conclusion = String(run?.conclusion ?? run?.state ?? '').toUpperCase();
  return conclusion !== 'SUCCESS' && conclusion !== 'SKIPPED';
}

const RUNNING_STATUSES = new Set(['QUEUED', 'IN_PROGRESS', 'WAITING', 'PENDING', 'REQUESTED', 'EXPECTED']);

function isRunningRun(run) {
  return RUNNING_STATUSES.has(String(run?.status ?? run?.state ?? '').toUpperCase());
}

/**
 * Every check that is not a required context: whether it failed, and whether it is still running.
 * A red unrequired lane must not pass as "every required context is green", and neither may one
 * that has not finished: the native Rust lanes outlast the required ones, so a merge that did not
 * wait for them could never see them fail. Accepting a lane is decided by name (`--allow-failing`),
 * which also stops waiting for it; never a blanket force.
 */
export function otherCheckState({ rollup = [], requiredContexts = [], allowFailing = [] }) {
  const required = new Set(requiredContexts);
  const allowed = new Set(allowFailing);
  const failed = [];
  const accepted = [];
  const running = [];
  for (const [name, run] of latestByName(rollup)) {
    if (required.has(name)) continue;
    if (isRunningRun(run) && !allowed.has(name)) {
      running.push(name);
      continue;
    }
    if (!isFailedRun(run)) continue;
    const row = {
      name,
      conclusion: String(run.conclusion ?? run.state ?? '').toUpperCase(),
      url: run.detailsUrl ?? run.targetUrl ?? null,
    };
    (allowed.has(name) ? accepted : failed).push(row);
  }
  const unmatched = [...allowed].filter((name) => !accepted.some((row) => row.name === name));
  const state = failed.length > 0 ? 'failed' : running.length > 0 ? 'running' : 'clear';
  return { state, failed, accepted, unmatched, running };
}

/**
 * The required contexts' result against the protection's own list. `SKIPPED` is not green: a
 * draft's jobs report skipped, which branch protection counts as satisfied, so a lander inheriting
 * that would merge an untested tree. `missing` and `pending` both wait.
 */
export function requiredCheckState({ rollup = [], requiredContexts = [] }) {
  const byName = latestByName(rollup);
  const pending = [];
  const failed = [];
  const missing = [];
  const skipped = [];
  for (const context of requiredContexts) {
    const run = byName.get(context);
    if (!run) {
      missing.push(context);
      continue;
    }
    const status = String(run.status ?? run.state ?? '').toUpperCase();
    const conclusion = String(run.conclusion ?? run.state ?? '').toUpperCase();
    if (status !== 'COMPLETED') {
      pending.push(context);
      continue;
    }
    if (conclusion === 'SUCCESS') continue;
    if (conclusion === 'SKIPPED') {
      skipped.push(context);
      continue;
    }
    failed.push({ name: context, conclusion, url: run.detailsUrl ?? run.targetUrl ?? null });
  }
  const unrun = [...missing, ...skipped];
  const state = failed.length > 0 ? 'failed' : pending.length + unrun.length > 0 ? 'waiting' : 'green';
  return { state, pending, failed, missing, skipped, unrun, neverRan: pending.length === 0 && unrun.length === requiredContexts.length };
}

/** Does workflow run `runId` still have a job queued or running in this rollup? */
export function runStillGoing(rollup = [], runId) {
  return rollup.some((run) => {
    const status = String(run?.status ?? run?.state ?? '').toUpperCase();
    return status !== 'COMPLETED' && String(run?.detailsUrl ?? run?.targetUrl ?? '').includes(`/actions/runs/${runId}/`);
  });
}

/** Is any check run for this head still queued or running? */
export function runInFlight(pr) {
  return (pr?.statusCheckRollup ?? []).some((run) => {
    const status = String(run?.status ?? run?.state ?? '').toUpperCase();
    return status === 'QUEUED' || status === 'IN_PROGRESS' || status === 'WAITING' || status === 'PENDING';
  });
}
