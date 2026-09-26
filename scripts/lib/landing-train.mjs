/**
 * The landing train's decisions, as pure functions.
 *
 * `scripts/pr-land.mjs` owns the input/output: `gh`, `git`, the clock and the lock. Everything that
 * decides something — which pull requests ride the next train, how a red train splits, whether a
 * pull request may skip the train, what the squash commit says, what a waiter's exit code is — lives
 * here, so it is tested from literals with no network at all. The header of `pr-land.mjs` carries
 * the measurements and the why.
 */

/** The label that is the queue. See `pr-land.mjs`, "Why a label". */
export const QUEUE_LABEL = 'landing-queue';

/** Pull requests per train unless `--batch=<n>` says otherwise. */
export const DEFAULT_BATCH = 20;

/** Train branches live under this prefix so a person reading the branch list knows what they are. */
const TRAIN_BRANCH_PREFIX = 'train/';

/**
 * Hidden markers in the conductor's comments. A waiter reads its outcome from them, because a
 * component a train landed is **closed**, not merged, and "closed" alone cannot tell landed from
 * abandoned.
 */
export const LANDED_MARKER = '<!-- landing-train:landed -->';
export const EJECTED_MARKER = '<!-- landing-train:ejected -->';

/** Reruns a train may spend on failures that are all in the flaky set before it splits or ejects. */
const FLAKY_RERUNS = 1;

/** Rebuilds a batch may spend because `main` moved into its files before it splits instead. */
export const MAX_REBUILDS = 2;

/** Consecutive empty rollups on a train pull request before the conductor asks GitHub again. */
export const EMPTY_BEFORE_REFIRE = 4;

const unique = (values) => [...new Set(values)];

export function intersect(left = [], right = []) {
  const other = new Set(right);
  return unique(left.filter((path) => other.has(path))).sort();
}

/**
 * The queue in arrival order.
 *
 * `nodes` are GraphQL pull-request nodes carrying their `LabeledEvent`s. A pull request's place is
 * the **latest** time the queue label was put on it: taking a pull request out and putting it back
 * moves it to the back, which is what re-queuing after an ejection should mean. A node with no
 * readable event still queues, after every dated one, by number.
 */
export function queueOrder(nodes = [], label = QUEUE_LABEL) {
  const rows = [];
  for (const node of nodes) {
    if (!node || typeof node.number !== 'number') continue;
    const events = node.timelineItems?.nodes ?? [];
    const stamps = events
      .filter((event) => event?.label?.name === label)
      .map((event) => Date.parse(event.createdAt ?? ''))
      .filter(Number.isFinite);
    const { timelineItems: _events, ...rest } = node;
    rows.push({ ...rest, queuedAt: stamps.length > 0 ? new Date(Math.max(...stamps)).toISOString() : null });
  }
  const rank = (row) => (row.queuedAt === null ? Number.POSITIVE_INFINITY : Date.parse(row.queuedAt));
  return rows.sort((a, b) => rank(a) - rank(b) || a.number - b.number);
}

/**
 * Which pull requests ride the next train.
 *
 * Pending halves of a split train go first, in the order the split produced them, so a bisect
 * finishes before new arrivals join. A half whose members all left the queue meanwhile (landed by
 * the fast path, closed, dequeued by hand) is dropped. Otherwise the train is the oldest
 * `batchSize` queued pull requests.
 */
export function nextTrain({ queue = [], splits = [], batchSize = DEFAULT_BATCH }) {
  const byNumber = new Map(queue.map((pr) => [pr.number, pr]));
  const remaining = [...splits];
  while (remaining.length > 0) {
    const half = remaining.shift().filter((number) => byNumber.has(number));
    if (half.length > 0) return { batch: half.map((number) => byNumber.get(number)), splits: remaining };
  }
  return { batch: queue.slice(0, Math.max(1, batchSize)), splits: [] };
}

/** Halve a train, first half the larger, keeping queue order. */
export function splitTrain(numbers) {
  const middle = Math.ceil(numbers.length / 2);
  return [numbers.slice(0, middle), numbers.slice(middle)].filter((half) => half.length > 0);
}

/**
 * What a red train does next.
 *
 * - Every failing context is in the flaky set and this train has not spent its rerun: **rerun** the
 *   failed jobs. This applies at every size, not only to a single pull request, because a bisect
 *   over a flaky context costs `log2(n)` CI runs to learn nothing.
 * - More than one component: **split** into halves, run as successive trains (bors-style).
 * - One component: **eject** it, naming the contexts.
 */
export function redTrainPlan({ components, failed = [], flaky = [], reruns = 0 }) {
  const names = unique(failed.map((check) => check.name));
  const flakySet = new Set(flaky);
  if (names.length > 0 && names.every((name) => flakySet.has(name)) && reruns < FLAKY_RERUNS) {
    return { action: 'rerun', names };
  }
  if (components.length > 1) return { action: 'split', halves: splitTrain(components), names };
  return { action: 'eject', names };
}

/**
 * The train pull request's CI, one poll at a time.
 *
 * `checks` and `other` are `requiredCheckState` and `otherCheckState` from `pr-land.mjs` on the
 * train's rollup. A train pull request is opened ready, so its `opened` event is the CI request; the
 * conductor asks again (a draft toggle) only after `EMPTY_BEFORE_REFIRE` empty readings with
 * nothing in flight, once.
 */
export function trainCiStep({ checks, other, inFlight = false, emptyRollupObservations = 0, refires = 0 }) {
  if (checks.state === 'failed') return { action: 'red', failed: [...checks.failed, ...(other?.failed ?? [])] };
  if (checks.neverRan && !inFlight && emptyRollupObservations >= EMPTY_BEFORE_REFIRE && refires < 1) {
    return { action: 'refire' };
  }
  if (checks.state === 'waiting') return { action: 'wait' };
  if (other?.state === 'failed') return { action: 'red', failed: other.failed };
  return { action: 'green' };
}

/**
 * Has `main` moved into this train's files since the train was cut?
 *
 * `strict` is off on `main`, so GitHub squash-merges a train onto whatever `main` is now. That is
 * safe exactly when `main` changed only files the train never touched: the tested tree and the
 * merged tree then differ only there. An overlap means the train was tested against a `main` that
 * no longer exists, and it is rebuilt.
 */
export function driftVerdict({ trainFiles, mainFiles }) {
  if (!Array.isArray(trainFiles) || !Array.isArray(mainFiles)) return { state: 'unknown', overlap: [] };
  const overlap = intersect(trainFiles, mainFiles);
  return { state: overlap.length > 0 ? 'overlap' : 'clear', overlap };
}

/**
 * May this pull request merge now, without the lock?
 *
 * Every rule is evaluated and returned, so the caller prints which one qualified or disqualified
 * it. Inputs a caller could not read arrive as `null` and fail their rule; a guess is never a pass.
 *
 * - `ready-green`: every required context is green on its head and no unaccepted check is red.
 * - `clean-merge`: `git merge-tree --write-tree origin/main <head>` is clean.
 * - `disjoint-from-main`: the files it changes do not intersect the files `main` changed since
 *   the merge base, so the merged tree differs from the tested one only in files it never touched.
 * - `no-overlapping-train`: the lock is free, or its train records a file set that does not
 *   intersect this one. A lock from an older `pr:land` records no file set and disqualifies.
 * - `not-full-plan`: `classify-change` does not plan the full lanes for it. A change to the impact
 *   authority, CI itself or the root contracts always takes the train.
 */
export function fastPathEligibility({ checks, other, mergeClean, prFiles, mainFiles, lock, fullPlan }) {
  const rules = [];
  const add = (rule, ok, detail) => rules.push({ rule, ok, detail });

  if (!checks) add('ready-green', false, 'the checks could not be read');
  else if (checks.state !== 'green') {
    const why = checks.state === 'failed'
      ? `${checks.failed.length} required context(s) failed`
      : `${checks.pending.length} required context(s) running, ${checks.unrun.length} not run (a draft runs none; \`pnpm pr:ci\` fires one)`;
    add('ready-green', false, why);
  } else if (other?.state === 'failed') add('ready-green', false, `unrequired check(s) red: ${other.failed.map((c) => c.name).join(', ')}`);
  else add('ready-green', true, 'every required context is green on its head');

  if (mergeClean === null || mergeClean === undefined) add('clean-merge', false, 'the trial merge could not run');
  else add('clean-merge', mergeClean, mergeClean ? 'merges onto origin/main without conflict' : 'conflicts with origin/main');

  if (!Array.isArray(prFiles) || !Array.isArray(mainFiles)) add('disjoint-from-main', false, 'the changed files could not be read');
  else {
    const overlap = intersect(prFiles, mainFiles);
    add(
      'disjoint-from-main',
      overlap.length === 0,
      overlap.length === 0
        ? `main changed ${mainFiles.length} file(s) since the merge base, none of its ${prFiles.length}`
        : `main also changed ${overlap.slice(0, 3).join(', ')}${overlap.length > 3 ? ` and ${overlap.length - 3} more` : ''}`,
    );
  }

  add('no-overlapping-train', ...trainOverlapRule(lock, prFiles));

  if (fullPlan === null || fullPlan === undefined) add('not-full-plan', false, 'the CI impact plan could not be built');
  else add('not-full-plan', !fullPlan.full, fullPlan.full ? `CI plans the full lanes: ${fullPlan.reason}` : 'CI plans affected lanes only');

  return { eligible: rules.every((row) => row.ok), rules };
}

function trainOverlapRule(lock, prFiles) {
  if (!lock || lock.state === 'unknown') return [false, 'the landing lock could not be read'];
  if (lock.state === 'free') return [true, 'no train is in flight'];
  if (lock.state === 'unreadable') return [false, 'the landing lock is unreadable'];
  const payload = lock.holder ?? {};
  if (!('train' in payload)) return [false, `PR #${payload.pr} is landing through an older pr:land that records no file set`];
  if (payload.train === null) return [true, 'the conductor is between trains'];
  const files = payload.train?.files;
  if (!Array.isArray(files)) return [false, 'a train is being assembled and its file set is not recorded yet'];
  if (!Array.isArray(prFiles)) return [false, 'this pull request\'s files could not be read'];
  const overlap = intersect(prFiles, files);
  return overlap.length === 0
    ? [true, `the train in flight touches none of its files`]
    : [false, `the train in flight also changes ${overlap.slice(0, 3).join(', ')}`];
}

export function describeFastPath(verdict) {
  return verdict.rules.map((row) => `${row.ok ? 'pass' : 'FAIL'} ${row.rule}: ${row.detail}`);
}

/** `train/20260926T101530Z-1885`: sortable, collision-free per second and first component. */
export function trainBranchName(nowMs, firstNumber) {
  const stamp = new Date(nowMs).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${TRAIN_BRANCH_PREFIX}${stamp}-${firstNumber}`;
}

/** `chore(train): land #1 #2 #3`, shortened past 100 characters so it stays a subject line. */
export function trainTitle(components) {
  const numbers = components.map((c) => `#${c.number}`);
  const full = `chore(train): land ${numbers.join(' ')}`;
  if (full.length <= 100) return full;
  const kept = [];
  for (const number of numbers) {
    const candidate = `chore(train): land ${[...kept, number].join(' ')} and ${numbers.length - kept.length - 1} more`;
    if (candidate.length > 100) break;
    kept.push(number);
  }
  return `chore(train): land ${kept.join(' ')} and ${numbers.length - kept.length} more`;
}

const componentLine = (c) => `- #${c.number} \`${c.headRefName}@${String(c.headRefOid ?? '').slice(0, 9)}\` ${c.title ?? ''}`.trimEnd();

export function trainBody({ components, base }) {
  return [
    '## Summary',
    '',
    `A landing train: ${components.length} queued pull request(s) merged onto \`main@${String(base).slice(0, 9)}\` in queue order, behind one CI run. Opened by \`pnpm pr:land\`; do not push to it or merge it by hand.`,
    '',
    ...components.map(componentLine),
    '',
    '## Test plan',
    '',
    '- The required contexts on this pull request, once. Each component ran `pnpm checks:changed` on its own branch.',
  ].join('\n');
}

/**
 * Every `Co-authored-by` a squash must carry: the trailers already in the component commits, and
 * each commit's own author, because a squash made by the conductor otherwise credits only it.
 * De-duplicated by e-mail, case-insensitively, first spelling wins.
 */
export function parseCoAuthors(logText) {
  const seen = new Map();
  for (const line of String(logText ?? '').split('\n')) {
    const match = /^\s*co-authored-by:\s*(.+?)\s*<([^>]+)>\s*$/i.exec(line);
    if (!match) continue;
    const email = match[2].trim().toLowerCase();
    if (!seen.has(email)) seen.set(email, `${match[1].trim()} <${match[2].trim()}>`);
  }
  return [...seen.values()];
}

export function composeSquashBody({ components, trainNumber }) {
  const trailers = unique(components.flatMap((c) => c.coAuthors ?? []));
  const byEmail = new Map();
  for (const trailer of trailers) {
    const email = /<([^>]+)>/.exec(trailer)?.[1]?.toLowerCase() ?? trailer;
    if (!byEmail.has(email)) byEmail.set(email, trailer);
  }
  const lines = [
    `Landed by train #${trainNumber}:`,
    '',
    ...components.map((c) => `- ${c.title ?? '(untitled)'} (#${c.number}, ${c.headRefName}@${String(c.headRefOid ?? '').slice(0, 9)})`),
  ];
  if (byEmail.size > 0) lines.push('', ...[...byEmail.values()].map((who) => `Co-authored-by: ${who}`));
  return lines.join('\n');
}

export function landedComment({ trainNumber, trainUrl, sha, branchKept = false }) {
  return [
    LANDED_MARKER,
    `Landed in \`main\` through train #${trainNumber} (${trainUrl}) at \`${String(sha).slice(0, 9)}\`.`,
    branchKept
      ? 'The branch moved after the train took it, so it was kept: commits after that sha did **not** land. Open a new pull request for them.'
      : 'The branch was deleted because `main` provably contains it.',
  ].join('\n');
}

export function conflictComment({ ahead = [] }) {
  const context = ahead.length > 0
    ? `onto \`main\` plus ${ahead.map((c) => `#${c.number}`).join(' ')}, which are ahead of it in this train`
    : 'onto `main`';
  return [
    EJECTED_MARKER,
    `Taken out of the landing queue: it conflicts when merged ${context}. Only its author can resolve that:`,
    '',
    '```bash',
    'git fetch origin && git merge origin/main   # after the pull requests ahead of it have landed',
    '# resolve, commit, push; then:',
    'pnpm pr:land <number>',
    '```',
    '',
    'Generated docs-vault JSON, the changelog and the ledger are never resolved by hand: `pnpm docs-vault:resolve-conflicts -- --dry-run`, then the write command.',
  ].join('\n');
}

export function ejectComment({ reason, failed = [], trainNumber = null }) {
  const lines = [EJECTED_MARKER, `Taken out of the landing queue${trainNumber ? ` after train #${trainNumber}` : ''}: ${reason}`];
  for (const check of failed) lines.push(`- ${check.name} ${check.conclusion ?? ''} ${check.url ?? ''}`.trimEnd());
  lines.push('', 'Fix it, push, then `pnpm pr:land <number>` again.');
  return lines.join('\n');
}

/**
 * What happened to a queued pull request, read from GitHub alone.
 *
 * `comments` count only when they are newer than `sinceIso`, the moment this waiter queued it, so
 * an ejection from an earlier attempt is not mistaken for this one's.
 */
export function waiterOutcome({ pr, comments = [], sinceIso = null, label = QUEUE_LABEL }) {
  if (!pr) return { state: 'unknown', exitCode: null };
  if (pr.state === 'MERGED') return { state: 'merged', exitCode: 0 };
  const since = sinceIso ? Date.parse(sinceIso) : Number.NEGATIVE_INFINITY;
  const recent = comments.filter((c) => !Number.isFinite(Date.parse(c?.createdAt ?? '')) || Date.parse(c.createdAt) >= since);
  const last = (marker) => [...recent].reverse().find((c) => String(c?.body ?? '').includes(marker)) ?? null;
  if (pr.state === 'CLOSED') {
    const landed = last(LANDED_MARKER);
    return landed ? { state: 'landed', exitCode: 0, comment: landed } : { state: 'closed', exitCode: 1 };
  }
  const queued = (pr.labels ?? []).some((l) => (l?.name ?? l) === label);
  if (queued) return { state: 'queued', exitCode: null };
  const ejected = last(EJECTED_MARKER);
  return ejected ? { state: 'ejected', exitCode: 1, comment: ejected } : { state: 'dequeued', exitCode: 1 };
}

/**
 * How long a waiter sleeps between reads.
 *
 * A waiter's poll costs one GraphQL read and two REST reads (the lock), and a burst of 400 queued
 * pull requests shares a 5,000-per-hour REST budget per account. The front of the queue polls
 * every 30 seconds; the back backs off to five minutes, which is still well inside a train's
 * 20-minute CI run.
 */
export function waiterPollSeconds(position, batchSize = DEFAULT_BATCH) {
  if (!Number.isFinite(position) || position <= batchSize) return 30;
  return Math.min(300, 30 + 10 * (position - batchSize));
}

/** Workflow run ids named by failing checks' URLs, for `gh run rerun <id> --failed`. */
export function runIdsFromChecks(failed = []) {
  return unique(
    failed
      .map((check) => /\/actions\/runs\/(\d+)/.exec(check?.url ?? '')?.[1])
      .filter(Boolean),
  );
}

export function describeTrain(train, nowMs) {
  if (!train) return 'between trains';
  const started = Date.parse(train.startedAt ?? '');
  const age = Number.isFinite(started) ? `, ${Math.max(0, Math.round((nowMs - started) / 60_000))} min` : '';
  const numbers = (train.components ?? []).map((n) => `#${n}`).join(' ');
  return `${train.pr ? `train #${train.pr}` : `train ${train.branch ?? '(assembling)'}`} carrying ${numbers || 'nothing yet'}${age}`;
}
