/**
 * The GitHub side of `deps`, over the `gh` CLI, and what a `gh` reply means. Everything the
 * conductor does reaches `gh`, `git` and the clock through `deps`, so tests drive it against a fake.
 */

import { execFileSync } from 'node:child_process';

import { FAILING_SPEC_TITLE } from '../../../ci/run-playwright-ci.mjs';
import { QUEUE_LABEL, TRAIN_HISTORY_LIMIT, queueOrder } from '../landing-train.mjs';
import { NO_FULL_RUN, fullBrowserRunKind } from './main-health.mjs';

const TRAIN_TITLE_SEARCHES = ['chore(merge):', 'chore(train): land'];

const MAIN_FULL_RUN_CANDIDATES = 5;
/** A run that executed nothing finishes in about 45 s; any run that ran the suite takes 5 minutes or more. */
const MAIN_FULL_RUN_MIN_MS = 2 * 60_000;

function describeReadFailure(output) {
  const text = String(output ?? '');
  if (/rate limit exceeded/i.test(text)) {
    return {
      reason: 'rate-limited',
      detail: 'the shared GitHub REST quota is exhausted (`gh api rate_limit` says when it returns)',
    };
  }
  const first = text.trim().split('\n').find((line) => line.trim().length > 0) ?? '';
  return { reason: 'unreachable', detail: first.trim() || 'the request failed without a message' };
}

/**
 * `{ value }` when the repository answered — including the 404 that means 「there is no such
 * ref」, which arrives as a null value — or `{ failure }` when the request did not happen at all.
 */
export function readOutcome(out) {
  if (typeof out === 'string') {
    try {
      return { value: JSON.parse(out), failure: null };
    } catch {
      return { value: null, failure: { reason: 'unreadable', detail: 'the reply was not JSON' } };
    }
  }
  const text = String(out?.output ?? '');
  if (/HTTP 404|Not Found/i.test(text)) return { value: null, failure: null };
  return { value: null, failure: describeReadFailure(text) };
}

/**
 * The protection's own list, or `null` when the question could not be asked. A 404 here is not an
 * answer: the endpoint answers a caller without admin rights much as it answers a branch with no
 * rule, and 「main declares no required status checks」 is the one sentence that invites a person
 * to go and weaken branch protection.
 */
export function protectionFrom(read) {
  if (read.failure) return { contexts: null, failure: read.failure };
  if (!read.value) {
    return {
      contexts: null,
      failure: { reason: 'unreadable', detail: "main's protection returned no body; 「no rule」 and 「not allowed to look」 read alike here" },
    };
  }
  return { contexts: Array.isArray(read.value.contexts) ? read.value.contexts : [], failure: null };
}

export function ghRun(args, { allowFailure = false } = {}) {
  try {
    // `stdio` is explicit: a tolerated 404 printing `gh: Not Found` reads as a failure mid-run.
    return execFileSync('gh', args, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (allowFailure) return { failed: true, output: `${error.stderr ?? ''}${error.stdout ?? ''}` };
    const detail = `${error.stderr ?? ''}${error.stdout ?? ''}`.trim();
    throw new Error(`gh ${args.slice(0, 3).join(' ')} failed: ${detail || error.message}`);
  }
}

const PR_FIELDS = [
  'number',
  'state',
  'title',
  'body',
  'url',
  'isDraft',
  'mergeable',
  'mergeStateStatus',
  'headRefName',
  'headRefOid',
  'baseRefName',
  'isCrossRepository',
  'statusCheckRollup',
  'labels',
].join(',');

const QUEUE_QUERY = `query($owner: String!, $name: String!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, labels: ["${QUEUE_LABEL}"], first: 50, after: $endCursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url state isDraft mergeable isCrossRepository headRefName headRefOid baseRefName
        timelineItems(itemTypes: [LABELED_EVENT], last: 20) { nodes { ... on LabeledEvent { createdAt label { name } } } }
      }
    }
  }
}`;

/** The GitHub side of `deps`, over the `gh` CLI. */
export function createGithub(slug, run = ghRun) {
  const read = (args) => readOutcome(run(args, { allowFailure: true }));
  const json = (args) => {
    const out = run(args);
    try {
      return JSON.parse(out);
    } catch {
      throw new Error(`gh ${args.slice(0, 3).join(' ')} did not return JSON`);
    }
  };
  const ok = (args) => typeof run(args, { allowFailure: true }) === 'string';
  const writeBlob = (body) => json(['api', '-X', 'POST', `repos/${slug}/git/blobs`, '-f', `content=${JSON.stringify(body)}`, '-f', 'encoding=utf-8']).sha;
  const [owner, name] = slug.split('/');

  return {
    slug,
    readPr: (number) => json(['pr', 'view', String(number), '--json', PR_FIELDS]),
    readPrComments: (number) => json(['pr', 'view', String(number), '--json', 'comments']).comments ?? [],
    listQueue: () => {
      const out = run(['api', 'graphql', '--paginate', '-F', `owner=${owner}`, '-F', `name=${name}`, '-f', `query=${QUEUE_QUERY}`,
        '--jq', '.data.repository.pullRequests.nodes[]']);
      const nodes = String(out).split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));
      return queueOrder(nodes);
    },
    readRequiredContexts: () => protectionFrom(read(['api', `repos/${slug}/branches/main/protection/required_status_checks`])),
    readLock: (ref) => {
      const refRead = read(['api', `repos/${slug}/git/ref/${ref.replace('refs/', '')}`]);
      if (refRead.failure) return { payload: null, unreadable: refRead.failure };
      const sha = refRead.value?.object?.sha ?? null;
      if (!sha) return { payload: null, unreadable: null };
      const blob = read(['api', `repos/${slug}/git/blobs/${sha}`]);
      if (blob.failure) return { payload: null, unreadable: blob.failure };
      if (!blob.value?.content) return { payload: {}, unreadable: null };
      try {
        const encoding = blob.value.encoding === 'base64' ? 'base64' : 'utf8';
        return { payload: JSON.parse(Buffer.from(blob.value.content, encoding).toString('utf8')), unreadable: null };
      } catch {
        return { payload: {}, unreadable: null };
      }
    },
    takeLock: (ref, body, { force = false } = {}) => {
      const sha = writeBlob(body);
      if (force) return ok(['api', '-X', 'PATCH', `repos/${slug}/git/${ref}`, '-f', `sha=${sha}`, '-F', 'force=true']);
      return ok(['api', '-X', 'POST', `repos/${slug}/git/refs`, '-f', `ref=${ref}`, '-f', `sha=${sha}`]);
    },
    refreshLock: (ref, body) => {
      const sha = writeBlob(body);
      ok(['api', '-X', 'PATCH', `repos/${slug}/git/${ref}`, '-f', `sha=${sha}`, '-F', 'force=true']);
    },
    releaseLock: (ref) => ok(['api', '-X', 'DELETE', `repos/${slug}/git/${ref}`]),
    addLabel: (number) => {
      if (ok(['pr', 'edit', String(number), '--add-label', QUEUE_LABEL])) return true;
      ok(['label', 'create', QUEUE_LABEL, '--color', '5319e7', '--description', 'Queued for the landing train (pnpm pr:land)']);
      return ok(['pr', 'edit', String(number), '--add-label', QUEUE_LABEL]);
    },
    removeLabel: (number) => ok(['pr', 'edit', String(number), '--remove-label', QUEUE_LABEL]),
    /**
     * Recent train pull requests with their comments, for the red rate (`chooseBatch`). One
     * GraphQL search; `null` when it could not be read, which keeps the default size.
     */
    listTrainHistory: () => {
      const rows = new Map();
      for (const title of TRAIN_TITLE_SEARCHES) {
        const out = run(['pr', 'list', '--state', 'all', '--search', `"${title}" in:title`, '--limit', String(TRAIN_HISTORY_LIMIT),
          '--json', 'number,title,state,headRefName,comments'], { allowFailure: true });
        if (typeof out !== 'string') return null;
        let parsed;
        try {
          parsed = JSON.parse(out);
        } catch {
          return null;
        }
        for (const row of parsed) if (String(row.headRefName ?? '').startsWith('train/')) rows.set(row.number, row);
      }
      return [...rows.values()].sort((a, b) => b.number - a.number).slice(0, TRAIN_HISTORY_LIMIT);
    },
    readChangedFiles: (number) => {
      const out = run(['api', '--paginate', `repos/${slug}/pulls/${number}/files`, '--jq', '.[].filename'], { allowFailure: true });
      return typeof out === 'string' ? out.split('\n').filter(Boolean) : null;
    },
    /**
     * The newest verdict of a check on main, for the event it names. A run may be cancelled, so
     * the verdict can sit behind a cancelled one. With `fullBrowser`, a run counts
     * only by what its shards uploaded (`fullBrowserRunKind`), and a red one carries the spec files
     * its shards annotated as failing.
     */
    readScheduledRun: (workflow, event = 'schedule', { fullBrowser = false } = {}) => {
      const out = run(['run', 'list', '--workflow', workflow, '--event', event, '--branch', 'main',
        '--limit', fullBrowser ? '20' : event === 'push' ? '5' : '1',
        '--json', fullBrowser ? 'conclusion,createdAt,updatedAt,url,databaseId' : 'conclusion,createdAt,url'], { allowFailure: true });
      if (typeof out !== 'string') return null;
      let rows;
      try {
        rows = JSON.parse(out);
      } catch {
        return null;
      }
      if (!fullBrowser) return rows.find((row) => row.conclusion && row.conclusion !== 'cancelled') ?? null;
      const finished = rows.filter((row) => ['success', 'failure'].includes(row.conclusion) && Number.isSafeInteger(row.databaseId)
        // Read artifacts only for a run long enough to have run specs, or one that went red.
        && (row.conclusion === 'failure' || Date.parse(row.updatedAt) - Date.parse(row.createdAt) >= MAIN_FULL_RUN_MIN_MS));
      for (const candidate of finished.slice(0, MAIN_FULL_RUN_CANDIDATES)) {
        const names = run(['api', `repos/${slug}/actions/runs/${candidate.databaseId}/artifacts?per_page=100`,
          '--jq', '.artifacts[].name'], { allowFailure: true });
        if (typeof names !== 'string') return null;
        if (fullBrowserRunKind(candidate.conclusion, names.split('\n')) !== 'full') continue;
        const result = { conclusion: candidate.conclusion, createdAt: candidate.createdAt, url: candidate.url };
        if (candidate.conclusion !== 'failure') return result;
        const jobs = run(['api', `repos/${slug}/actions/runs/${candidate.databaseId}/jobs?per_page=100`,
          '--jq', '.jobs[] | select(.conclusion == "failure") | .id'], { allowFailure: true });
        const failingSpecs = new Set();
        for (const id of (typeof jobs === 'string' ? jobs.split('\n').filter((line) => /^\d+$/.test(line)) : []).slice(0, 10)) {
          const paths = run(['api', `repos/${slug}/check-runs/${id}/annotations`,
            '--jq', `.[] | select(.title == "${FAILING_SPEC_TITLE}") | .path`], { allowFailure: true });
          for (const path of typeof paths === 'string' ? paths.split('\n') : []) {
            if (/^tests\/e2e\/[\w./-]+\.spec\.ts$/.test(path)) failingSpecs.add(path);
          }
        }
        return { ...result, failingSpecs: [...failingSpecs].sort() };
      }
      // Runs exist but none of the latest ran the whole suite: say so rather than look green.
      const newest = rows.find((row) => row.conclusion && row.conclusion !== 'cancelled');
      const examined = rows.filter((row) => row.conclusion && row.conclusion !== 'cancelled').length;
      return newest ? { conclusion: NO_FULL_RUN, createdAt: newest.createdAt, url: newest.url, examined } : null;
    },
    comment: (number, body) => ok(['pr', 'comment', String(number), '--body', body]),
    closePr: (number, body) => ok(['pr', 'close', String(number), '--comment', body]),
    createBranch: (branch, sha) => ok(['api', '-X', 'POST', `repos/${slug}/git/refs`, '-f', `ref=refs/heads/${branch}`, '-f', `sha=${sha}`]),
    deleteBranch: (branch) => ok(['api', '-X', 'DELETE', `repos/${slug}/git/refs/heads/${branch}`]),
    /**
     * `POST .../merges`: `201` created a merge commit, `204` means the base already contains the head,
     * `409` is a conflict. Server-side; no checkout is touched.
     */
    mergeInto: (base, head, message) => {
      const result = run(['api', '-X', 'POST', `repos/${slug}/merges`, '-f', `base=${base}`, '-f', `head=${head}`, '-f', `commit_message=${message}`],
        { allowFailure: true });
      if (typeof result === 'string') return { state: result.trim() === '' ? 'up-to-date' : 'merged' };
      if (/409|[Mm]erge conflict/.test(result.output ?? '')) return { state: 'conflict', detail: result.output };
      return { state: 'error', detail: result.output };
    },
    openPr: ({ title, head, base, body }) => {
      const created = json(['api', '-X', 'POST', `repos/${slug}/pulls`, '-f', `title=${title}`, '-f', `head=${head}`, '-f', `base=${base}`, '-f', `body=${body}`, '-F', 'draft=false']);
      return { number: created.number, url: created.html_url };
    },
    /** Merge the exact head CI measured while preserving original commit ancestry. */
    mergePr: (number, { sha, title = null, message = null, method = 'merge' }) => {
      if (method !== 'merge') return { ok: false, detail: 'Landing requires a merge commit to preserve original history.' };
      const args = ['api', '-X', 'PUT', `repos/${slug}/pulls/${number}/merge`, '-f', `merge_method=${method}`, '-f', `sha=${sha}`];
      if (title) args.push('-f', `commit_title=${title}`);
      if (message) args.push('-f', `commit_message=${message}`);
      const result = run(args, { allowFailure: true });
      if (typeof result !== 'string') return { ok: false, detail: String(result.output ?? '').trim() };
      try {
        const body = JSON.parse(result);
        return { ok: body.merged === true, detail: result.trim(), sha: typeof body.sha === 'string' ? body.sha : null };
      } catch {
        return { ok: false, detail: result.trim() };
      }
    },
    markReady: (number) => ok(['pr', 'ready', String(number)]),
    markDraft: (number) => ok(['pr', 'ready', String(number), '--undo']),
    rerunFailed: (runId) => ok(['run', 'rerun', String(runId), '--failed']),
    /** Which attempt a workflow run is on: 1 until someone reran it. `null` when unreadable. */
    readRunAttempt: (runId) => {
      const run = read(['api', `repos/${slug}/actions/runs/${runId}`]);
      return Number.isInteger(run.value?.run_attempt) ? run.value.run_attempt : null;
    },
  };
}
