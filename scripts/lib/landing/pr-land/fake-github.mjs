/** A fake GitHub world for the landing tests: queued pull requests, CI results, a lock and every call made against it. */

import { QUEUE_LABEL } from '../landing-train.mjs';
import { LOCK_REF } from './landing-lock.mjs';
import { conduct } from './train-conductor.mjs';
import { REQUIRED_CONTEXTS, DRAFT_ROLLUP, green } from './recorded-rollup.mjs';

export function component(number, extra = {}) {
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
export function fakeWorld({ prs = [], queued = [], ci = () => green(), ownCi = () => green(), onOwnCiRead = () => {}, conflicts = new Set(), mainDrift = () => [], mainMoves = () => [], behindMain = () => false, lock = null, readOnly = false, history = [] } = {}) {
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
export const runConductor = (world, extra) => conduct({
  deps: world.deps,
  args: conductArgs(extra),
  requiredContexts: REQUIRED_CONTEXTS,
  token: 'fakehost-4242-1',
  deadline: world.deps.now() + 24 * 60 * 60_000,
});
export const called = (world, name) => world.calls.filter(([call]) => call === name);
