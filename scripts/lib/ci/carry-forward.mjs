import { isDeepStrictEqual } from 'node:util';

/**
 * Carry-forward: after a fix push to a pull request, a lane that passed on the previous head is
 * not run again when nothing the push changed is an input of it. The proof is narrow on purpose:
 *
 * - the previous run tested a merge of the same base commit, and the tree it tested is the one
 *   Git rebuilds from that base and the previous head;
 * - the planner and the workflow files are unchanged everywhere, so the jobs that reported are
 *   the jobs these files define and the planner that annotated is this planner;
 * - the push plans nothing for the lane beyond what an empty change plans, and the lane's planned
 *   work is the same on both heads;
 * - every job of the lane passed at the previous head, in the same workflow run as the plan job
 *   that printed the tested tree, and none of them was itself carried.
 *
 * The Types · Lint · Docs lane is never carried. Anything unreadable or partial carries nothing.
 */

export const GITHUB_ACTIONS_APP_ID = 15368;
export const TESTED_TREE_TITLE = 'CI tested tree';
export const CARRIED_LANE_TITLE = 'CI lane carried forward';

const SHA = /^[0-9a-f]{40}$/;

const e2eSuite = (e2e) => {
  const { staticExport: _static, webSurface: _web, ...suite } = e2e;
  return suite;
};

/** Each lane names the plan job that annotates it, its jobs, and the slice of the plan it runs. */
const CARRY_LANES = Object.freeze({
  unit: {
    owner: 'Check impact plan',
    jobs: /^Unit · Contract (\d+)\/(\d+)$/,
    sharded: true,
    slice: (lanes) => lanes.unit,
    idle: (lanes) => lanes.unit.mode === 'skip',
  },
  perf: {
    owner: 'Check impact plan',
    jobs: /^Perf · Ratios$/,
    sharded: false,
    slice: (lanes) => lanes.perf,
    idle: (lanes) => lanes.perf.mode === 'skip',
  },
  mcp: {
    owner: 'Check impact plan',
    jobs: /^MCP$/,
    sharded: false,
    slice: (lanes) => lanes.mcp,
    idle: (lanes) => lanes.mcp.mode === 'skip',
  },
  playwright: {
    owner: 'E2E impact plan',
    jobs: /^Playwright \(chromium (\d+)\/(\d+)\)$/,
    sharded: true,
    slice: (lanes) => e2eSuite(lanes.e2e),
    idle: (lanes) => lanes.e2e.mode === 'skip',
  },
  static: {
    owner: 'E2E impact plan',
    jobs: /^Playwright \(static export\)$/,
    sharded: false,
    slice: (lanes) => ({ staticExport: lanes.e2e.staticExport }),
    idle: (lanes) => lanes.e2e.staticExport === false,
  },
  web: {
    owner: 'E2E impact plan',
    jobs: /^Playwright \(web surface\)$/,
    sharded: false,
    slice: (lanes) => ({ webSurface: lanes.e2e.webSurface }),
    idle: (lanes) => lanes.e2e.webSurface === false,
  },
});

export const CARRY_LANE_NAMES = Object.freeze(Object.keys(CARRY_LANES));
export const CARRY_OWNERS = Object.freeze([...new Set(Object.values(CARRY_LANES).map((lane) => lane.owner))]);

/** The one-line annotation every pull request plan job prints, and its strict reader. */
export function testedTreeMessage({ head, base, tree, carried = [] }) {
  return `head=${head} base=${base} tree=${tree} carried=${carried.length > 0 ? carried.join(',') : 'none'}`;
}

export function parseTestedTree(message) {
  const match = /^head=([0-9a-f]{40}) base=([0-9a-f]{40}) tree=([0-9a-f]{40}) carried=(none|[a-z]+(?:,[a-z]+)*)$/.exec(message ?? '');
  if (!match) return null;
  const carried = match[4] === 'none' ? [] : match[4].split(',');
  if (carried.some((lane) => !CARRY_LANE_NAMES.includes(lane)) || new Set(carried).size !== carried.length) return null;
  return { head: match[1], base: match[2], tree: match[3], carried };
}

/**
 * The changes the planner maps with certainty: an added or modified code module, whose readers the
 * import graph names. A deleted or moved file, prose, data or configuration can be read from disk
 * by a test no mapping names (the dogfood vault's `path:` drift test reads every file it names),
 * so any such path in the push carries nothing at all.
 */
const MAPPED_CODE = /^(?:scripts|mcp\/src|cli\/src|src|app|tests)\/(?:[\w@[\]().-]+\/)*[\w@[\]().-]+\.(?:[cm]?js|tsx?)$/;

/**
 * Trees whose modules are loaded by a computed path or spawned by file name, or which read files at
 * run time, so no import edge names their readers. A change inside one carries nothing.
 */
export const RUNTIME_LOADED_TREES = Object.freeze([
  ['mcp/', 'the server is spawned by path, loads its tools and guides at run time, and the app bundles its modules'],
  ['cli/src/', 'commands load by a computed path (`cli-commands.mjs`) and the MCP bridge imports the server by path'],
  ['scripts/dogfood/', 'the dogfood checks spawn the MCP server and the CLI by file name'],
  ['scripts/vault/', 'the vault migrator imports each migration by a computed path'],
  ['scripts/migrations/', 'migrations are loaded by the vault migrator, not imported'],
  ['scripts/design/', 'the UI audit imports its setup module by a path given on the command line'],
  ['scripts/quality/', 'the dead-code check imports the CLI command registry by path'],
  ['scripts/lib/check-rules/', 'the check advisor imports every rule file found in the directory'],
]);

export function uncertainChange({ files = [], deleted = [] }) {
  if (deleted.length > 0) return `the push deletes or moves ${deleted[0]}, and a missing file's readers are not mapped`;
  for (const path of files) {
    const tree = RUNTIME_LOADED_TREES.find(([prefix]) => path.startsWith(prefix));
    if (tree) return `${path} is in ${tree[0]}: ${tree[1]}`;
  }
  const unmapped = files.find((path) => !MAPPED_CODE.test(path));
  return unmapped ? `${unmapped} is not a code module the planner maps by imports` : null;
}

function completeShards(runs) {
  const sets = new Map();
  for (const { shard, of } of runs) {
    if (!sets.has(of)) sets.set(of, new Set());
    sets.get(of).add(shard);
  }
  return sets.size > 0 && [...sets].every(([of, shards]) => shards.size === of && [...shards].every((shard) => shard >= 1 && shard <= of));
}

/**
 * Decide which lanes carry. Every input is data: the plans come from `buildImpactPlan`, the proof
 * from `readCarryProof`, `change` lists the push's files (renames as a delete and an add),
 * `readers` maps a lane to every file its tests, commands or build import, and `plannerFiles` is
 * the planner's import closure.
 *
 * @returns {{ lanes: string[], refused: { lane: string, reason: string }[], reason: string, runs: Record<string, number[]> }}
 */
export function carryVerdict({ plan, previous, delta, idle, expected, proof, change, readers = {}, plannerFiles = [] }) {
  const none = (reason) => ({ lanes: [], refused: [], reason, runs: {}, from: {} });
  if (!expected || !['head', 'base', 'tree', 'previousHead', 'previousTree'].every((key) => SHA.test(expected[key] ?? ''))) {
    return none('the tested commits are unknown');
  }
  if (expected.previousHead === expected.head) return none('the previous head is this head');
  if (plan.reusedFrom || plan.full) return none('this plan is exhaustive or reuses a reviewed tree');
  if (!previous || previous.full) return none('the previous head planned an exhaustive run');
  if (!delta || delta.full) return none(`the push needs an exhaustive run: ${delta?.reason ?? 'no comparison'}`);
  const planner = new Set(plannerFiles);
  const touched = [...previous.paths, ...delta.paths].find((path) => path.startsWith('.github/') || planner.has(path));
  if (touched) return none(`${touched} differs from the base, so the earlier jobs and their planner are not these`);
  const uncertain = change ? uncertainChange(change) : 'the push is unknown';
  if (uncertain) return none(uncertain);
  if (!proof?.ok) return none(`the previous head's results are unreadable: ${proof?.reason ?? 'no proof'}`);

  const lanes = [];
  const refused = [];
  const runs = {};
  const from = {};
  for (const [name, lane] of Object.entries(CARRY_LANES)) {
    const now = lane.slice(plan.lanes);
    if (lane.idle(plan.lanes)) continue;
    const refuse = (reason) => refused.push({ lane: name, reason });
    if (!isDeepStrictEqual(lane.slice(delta.lanes), lane.slice(idle.lanes))) { refuse('this push changed one of its inputs'); continue; }
    const read = change.files.find((path) => !readers[name] || readers[name].has(path));
    if (read) { refuse(readers[name] ? `its tests or build import ${read}` : 'its readers are unknown'); continue; }
    if (!isDeepStrictEqual(lane.slice(previous.lanes), now)) { refuse('its planned work differs from the previous head'); continue; }
    const owner = proof.owners?.[lane.owner];
    if (!owner) { refuse(`no tested-tree annotation from ${lane.owner} at the previous head`); continue; }
    if (owner.head !== expected.previousHead) { refuse('the annotation names another head'); continue; }
    if (owner.base !== expected.base) { refuse(`the previous run tested base ${owner.base.slice(0, 9)}, not ${expected.base.slice(0, 9)}`); continue; }
    if (owner.tree !== expected.previousTree) { refuse('the previous run tested another tree than Git rebuilds'); continue; }
    if (owner.carried.includes(name)) { refuse('it was itself carried at the previous head'); continue; }
    const jobs = (proof.runs ?? []).filter((run) => lane.jobs.test(run.name));
    if (jobs.length === 0) { refuse('no job of this lane reported at the previous head'); continue; }
    const foreign = jobs.find((run) => run.suite !== owner.suite || run.appId !== GITHUB_ACTIONS_APP_ID);
    if (foreign) { refuse(`${foreign.name} came from another workflow run or app`); continue; }
    const unfinished = jobs.find((run) => run.conclusion !== 'success');
    if (unfinished) { refuse(`${unfinished.name} was ${unfinished.conclusion ?? unfinished.status} at the previous head`); continue; }
    if (lane.sharded && !completeShards(jobs.map((run) => {
      const [, shard, of] = lane.jobs.exec(run.name);
      return { shard: Number(shard), of: Number(of) };
    }))) { refuse('a shard is missing at the previous head'); continue; }
    lanes.push(name);
    runs[name] = jobs.map((run) => run.id).sort((a, b) => a - b);
    from[name] = owner.runId;
  }
  return { lanes, refused, reason: lanes.length > 0 ? `carried ${lanes.join(', ')}` : 'no lane qualified', runs, from };
}

/** The line a carried lane's own job prints instead of running. */
export function carriedMark(plan, lane) {
  const carried = plan.carriedFrom;
  return carried?.lanes.includes(lane) ? `carried from run ${carried.runs[lane]} on ${carried.head}` : '';
}

/** The plan with every carried lane set to what an empty change plans, and its provenance. */
export function applyCarry(plan, verdict, { idle, expected }) {
  if (verdict.lanes.length === 0) return plan;
  const lanes = structuredClone(plan.lanes);
  for (const name of verdict.lanes) {
    if (name === 'static') lanes.e2e.staticExport = idle.lanes.e2e.staticExport;
    else if (name === 'web') lanes.e2e.webSurface = idle.lanes.e2e.webSurface;
    else if (name === 'playwright') Object.assign(lanes.e2e, e2eSuite(structuredClone(idle.lanes.e2e)));
    else lanes[name] = structuredClone(idle.lanes[name]);
  }
  return {
    ...plan,
    reason: `${plan.reason}; ${verdict.lanes.join(', ')} carried from ${expected.previousHead.slice(0, 9)}`,
    lanes,
    carriedFrom: {
      head: expected.previousHead,
      base: expected.base,
      tree: expected.previousTree,
      lanes: [...verdict.lanes],
      runs: Object.fromEntries(verdict.lanes.map((name) => [name, verdict.from[name]])),
    },
  };
}

/** `validatePlan` calls this: provenance is well formed and every carried lane is idle. */
export function carriedProvenanceProblem(plan) {
  const carried = plan.carriedFrom;
  if (carried === undefined) return null;
  if (!carried || typeof carried !== 'object' || plan.reusedFrom || plan.full) return 'carried lanes beside an exhaustive or reused plan';
  if (!['head', 'base', 'tree'].every((key) => SHA.test(carried[key] ?? ''))) return 'carried lane provenance';
  if (!Array.isArray(carried.lanes) || carried.lanes.length === 0 || new Set(carried.lanes).size !== carried.lanes.length ||
      carried.lanes.some((lane) => !CARRY_LANE_NAMES.includes(lane))) return 'carried lane names';
  if (carried.lanes.some((lane) => !CARRY_LANES[lane].idle(plan.lanes))) return 'a carried lane still plans work';
  const runs = carried.runs;
  if (!runs || typeof runs !== 'object' || Object.keys(runs).sort().join() !== [...carried.lanes].sort().join() ||
      carried.lanes.some((lane) => !Number.isSafeInteger(runs[lane]) || runs[lane] < 1)) return 'carried lane runs';
  return null;
}
