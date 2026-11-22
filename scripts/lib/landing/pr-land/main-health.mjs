/** What main's own runs say about its health: the scheduled and post-merge checks, never a landing gate. */

export const SCHEDULED_CHECKS = [
  {
    workflow: 'e2e.yml',
    name: 'nightly browser run',
    // No landing lane runs a browser spec, so the night's whole run is where a screen defect a merge
    // brought in is announced, and the release browser gate refuses a stable release over it.
    event: 'schedule',
    wholeBrowserRun: true,
    red: 'merging continues, but a stable release of that commit cannot publish until the specs are fixed or quarantined with this run as evidence',
    idle: 'a screen defect merged since then is unknown, and a stable release cannot publish without a green whole run on its commit',
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

/** A reader verdict: main's latest browser runs finished, but none of them ran the whole suite. */
export const NO_FULL_RUN = 'no-full-run';

export function describeScheduledRun(check, run, nowMs = Date.now()) {
  if (!run) return null;
  const day = String(run.createdAt ?? '').slice(0, 10);
  if (run.conclusion === NO_FULL_RUN) {
    return `main's latest ${run.examined} ${check.name}s did not run the whole browser suite (newest: ${run.url}), so a red spec would not show here`;
  }
  if (run.conclusion === 'failure') {
    const specs = Array.isArray(run.failingSpecs) && run.failingSpecs.length > 0
      ? `: ${run.failingSpecs.length > 6 ? `${run.failingSpecs.slice(0, 6).join(', ')} and ${run.failingSpecs.length - 6} more` : run.failingSpecs.join(', ')}`
      : check.wholeBrowserRun ? ', with no failing spec annotated (open the run)' : '';
    return `the ${check.name} on main failed on ${day} (${run.url})${specs}; ${check.red}`;
  }
  const ageHours = (nowMs - Date.parse(run.createdAt)) / 3_600_000;
  if (check.idle && ageHours > SCHEDULED_RUN_STALE_HOURS) return `the last ${check.name} on main is from ${day}; ${check.idle}`;
  return null;
}

/**
 * What a finished run on main proves about the browser suite, from its timing artifacts, which
 * carry the plan's mode (`playwright-timings-<mode>-<shard>`). `full`: the whole suite ran.
 * `partial`: it ran only a change's plan (smoke or targeted timings, or a run from before the mode
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

/** One reader for every check on main: the event it names (the nightly run or a push) included. */
function readCheckRun(deps, check) {
  return deps.gh.readScheduledRun?.(check.workflow, check.event, { fullBrowser: Boolean(check.wholeBrowserRun) }) ?? null;
}

/** The red nightly browser run, for the body of the train being cut. */
export function mainBrowserNotes(deps) {
  const check = SCHEDULED_CHECKS.find((row) => row.wholeBrowserRun);
  const run = readCheckRun(deps, check);
  return run?.conclusion === 'failure' ? [describeScheduledRun(check, run, deps.now())] : [];
}
