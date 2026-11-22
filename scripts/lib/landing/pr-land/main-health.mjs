/** What main's own runs say about its health: the scheduled and post-merge checks, never a landing gate. */

export const SCHEDULED_CHECKS = [
  {
    workflow: 'e2e.yml',
    name: 'full browser run',
    // Every push to main runs the whole browser suite; a train runs only its mapped specs and the
    // merge smoke set, so this line is where a defect the train did not reach is announced.
    event: 'push',
    afterMerge: true,
    red: 'trains run only their mapped specs and the merge smoke set, so these stay red until someone fixes them; landing continues',
    idle: null,
  },
  {
    workflow: 'acp-registry.yml',
    name: 'daily ACP registry check',
    red: 'an agent adapter moved upstream, and release admission refuses it until the registry is refreshed and reviewed (`pnpm acp:registry:check` names what moved)',
    idle: 'an adapter that moved upstream since then is unknown until release admission',
  },
  {
    // A train runs only what its change can affect; the merged tree's push runs the full set.
    workflow: 'checks.yml',
    event: 'push',
    name: 'post-merge full Checks run',
    red: 'a suite the pre-merge plan left out is red on main, and every train inherits it until someone fixes it',
    idle: null,
  },
];
const SCHEDULED_RUN_STALE_HOURS = 48;

/** A reader verdict: main's latest push runs finished, but none of them ran the full browser suite. */
export const NO_FULL_RUN = 'no-full-run';

export function describeScheduledRun(check, run, nowMs = Date.now()) {
  if (!run) return null;
  const day = String(run.createdAt ?? '').slice(0, 10);
  if (run.conclusion === NO_FULL_RUN) {
    return `main's latest ${run.examined} push runs did not run the full browser suite (newest: ${run.url}); last full run: none among them, so a red outside the merge smoke set would not show here`;
  }
  if (run.conclusion === 'failure') {
    const specs = Array.isArray(run.failingSpecs) && run.failingSpecs.length > 0
      ? `: ${run.failingSpecs.length > 6 ? `${run.failingSpecs.slice(0, 6).join(', ')} and ${run.failingSpecs.length - 6} more` : run.failingSpecs.join(', ')}`
      : check.afterMerge ? ', with no failing spec annotated (open the run)' : '';
    return `the ${check.name} on main failed on ${day} (${run.url})${specs}; ${check.red}`;
  }
  const ageHours = (nowMs - Date.parse(run.createdAt)) / 3_600_000;
  if (check.idle && ageHours > SCHEDULED_RUN_STALE_HOURS) return `the last ${check.name} on main is from ${day}; ${check.idle}`;
  return null;
}

/**
 * What a finished run on main proves about the browser suite, from its timing artifacts, which
 * carry the plan's mode (`playwright-timings-<mode>-<shard>`). `full`: the whole suite ran.
 * `partial`: it ran only a change's plan (smoke or targeted timings, or a push from before the mode
 * was named). A green run that uploaded none executed nothing; a red one that uploaded none failed
 * before its specs and still counts, so a broken build on main is not hidden behind a green run.
 */
export function fullBrowserRunKind(conclusion, artifactNames) {
  const timings = artifactNames.filter((name) => name.startsWith('playwright-timings-'));
  if (timings.some((name) => name.startsWith('playwright-timings-full-'))) return 'full';
  if (timings.length > 0) return 'partial';
  return conclusion === 'failure' ? 'full' : 'empty';
}

/** One line per red or stalled check on main; reading them never blocks a landing. */
export function mainHealthWarnings(deps) {
  return SCHEDULED_CHECKS
    .map((check) => describeScheduledRun(check, readCheckRun(deps, check), deps.now()))
    .filter(Boolean);
}

/** One reader for every check on main: the event it names (a push, not the nightly run) included. */
function readCheckRun(deps, check) {
  return deps.gh.readScheduledRun?.(check.workflow, check.event, { fullBrowser: Boolean(check.afterMerge) }) ?? null;
}

/** The red after-merge browser run, for the body of the train being cut. */
export function mainBrowserNotes(deps) {
  const check = SCHEDULED_CHECKS.find((row) => row.afterMerge);
  const run = readCheckRun(deps, check);
  return run?.conclusion === 'failure' ? [describeScheduledRun(check, run, deps.now())] : [];
}
