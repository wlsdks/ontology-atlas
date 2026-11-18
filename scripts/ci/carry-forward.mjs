import { importClosure } from '../lib/import-graph/test-reach.mjs';
import {
  applyCarry,
  CARRY_OWNERS,
  carryVerdict,
  GITHUB_ACTIONS_APP_ID,
  parseTestedTree,
  TESTED_TREE_TITLE,
} from '../lib/ci/carry-forward.mjs';

const API = 'https://api.github.com';
const SHA = /^[0-9a-f]{40}$/;
const REPO_PART = /^[A-Za-z0-9_.-]+$/;
const MAX_PAGES = 3;
class ProofReadError extends Error {}

/**
 * Read what the previous head proved: its latest check runs and the tested-tree annotation of
 * each plan job. Any failed, partial or ambiguous read returns `ok: false`, which carries nothing.
 */
export async function readCarryProof({ previousHead, repository = process.env.GITHUB_REPOSITORY, token = process.env.GH_TOKEN, fetchImpl = globalThis.fetch, timeoutMs = 8_000 } = {}) {
  const fail = (reason) => ({ ok: false, reason });
  const parts = String(repository ?? '').split('/');
  if (!token || parts.length !== 2 || parts.some((part) => !REPO_PART.test(part) || part === '.' || part === '..')) return fail('GitHub credentials or repository unavailable');
  if (!SHA.test(previousHead ?? '')) return fail('previous head unavailable');
  const repoPath = `/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(1, timeoutMs), 8_000));
  const get = async (path) => {
    const response = await fetchImpl(`${API}${repoPath}${path}`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }, signal: controller.signal });
    if (!response?.ok) throw new ProofReadError(`GitHub HTTP ${Number.isInteger(response?.status) ? response.status : 'unknown'} at ${path.split('?')[0]}`);
    if (typeof response.headers?.get !== 'function') throw new ProofReadError('GitHub response pagination metadata unavailable');
    return { body: await response.json(), next: /\brel\s*=\s*"?next\b/.test(response.headers.get('link') ?? '') };
  };
  try {
    const checkRuns = [];
    let total = null;
    for (let page = 1; ; page += 1) {
      const { body, next } = await get(`/commits/${previousHead}/check-runs?filter=latest&per_page=100&page=${page}`);
      if (!Number.isSafeInteger(body?.total_count) || !Array.isArray(body?.check_runs) || (total !== null && body.total_count !== total)) throw new ProofReadError('check run response is malformed');
      total = body.total_count;
      checkRuns.push(...body.check_runs);
      if (!next) break;
      if (page === MAX_PAGES) throw new ProofReadError('check run response has too many pages');
    }
    if (checkRuns.length !== total) throw new ProofReadError('check run response is partial');
    const runs = checkRuns.map((run) => ({
      id: run?.id, name: run?.name, status: run?.status, conclusion: run?.conclusion ?? null,
      suite: run?.check_suite?.id, appId: run?.app?.id, headSha: run?.head_sha,
    }));
    if (runs.some((run) => !Number.isSafeInteger(run.id) || typeof run.name !== 'string' || !Number.isSafeInteger(run.suite) || run.headSha !== previousHead)) {
      throw new ProofReadError('a check run is malformed or belongs to another commit');
    }
    const owners = {};
    for (const name of CARRY_OWNERS) {
      const named = runs.filter((run) => run.name === name);
      if (named.length !== 1) { owners[name] = null; continue; }
      const [run] = named;
      if (run.appId !== GITHUB_ACTIONS_APP_ID || run.status !== 'completed' || run.conclusion !== 'success') { owners[name] = null; continue; }
      const { body, next } = await get(`/check-runs/${run.id}/annotations?per_page=100`);
      if (!Array.isArray(body) || next) throw new ProofReadError('annotation response is malformed or partial');
      const tested = body.filter((annotation) => annotation?.annotation_level === 'notice' && annotation?.title === TESTED_TREE_TITLE);
      const parsed = tested.length === 1 ? parseTestedTree(tested[0].message) : null;
      owners[name] = parsed ? { ...parsed, suite: run.suite } : null;
    }
    return { ok: true, runs, owners };
  } catch (error) {
    return fail(error instanceof ProofReadError ? error.message : 'GitHub REST read failed, timed out or was malformed');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function lines(output) {
  return output ? output.split('\n').filter(Boolean) : [];
}

/**
 * Pull request runs test GitHub's merge of the base and the head. Returns the tested identity, the
 * plan with carried lanes, and the verdict. `git` runs a Git command and returns trimmed stdout;
 * `planFor` is `buildImpactPlan`. Never throws: a failure is a verdict that carries nothing.
 */
export async function carryForward({ plan, base, previousHead, planFor, git, readProof = readCarryProof, plannerFiles = [...importClosure(['scripts/ci/classify-change.mjs'])] }) {
  let tested = null;
  try {
    const parents = git(['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ');
    if (parents.length !== 3 || !parents.every((sha) => SHA.test(sha))) {
      return { plan, tested, verdict: { lanes: [], refused: [], reason: 'HEAD is not a pull request merge', runs: {} } };
    }
    tested = { base: parents[1], head: parents[2], tree: git(['rev-parse', 'HEAD^{tree}']) };
    const skip = (reason) => ({ plan, tested, verdict: { lanes: [], refused: [], reason, runs: {} } });
    if (base !== tested.base) return skip('the planner compared with another commit than the merge base');
    if (!SHA.test(previousHead ?? '') || /^0+$/.test(previousHead)) return skip('no previous head');
    if (previousHead === tested.head) return skip('the previous head is this head');
    try {
      git(['cat-file', '-e', `${previousHead}^{commit}`]);
    } catch {
      return skip('the previous head is not in this history');
    }
    let previousTree;
    try {
      previousTree = git(['merge-tree', '--write-tree', tested.base, previousHead]).split('\n')[0];
    } catch {
      return skip('the previous head does not merge cleanly with this base');
    }
    const diff = (from, to, filter, extra = []) => lines(git(['diff', '--name-only', ...extra, `--diff-filter=${filter}`, from, to]));
    // The same comparison the planner made for this head, from the same base to the tree tested.
    const previous = planFor({ files: diff(tested.base, previousTree, 'ACMRTUXB'), deletedFiles: diff(tested.base, previousTree, 'D') });
    // Without rename pairing, a moved file counts on both sides: its old path is touched too.
    const delta = planFor({ files: diff(previousTree, 'HEAD', 'ACMRTUXB', ['--no-renames']), deletedFiles: diff(previousTree, 'HEAD', 'D', ['--no-renames']) });
    const expected = { ...tested, previousHead, previousTree };
    const proof = await readProof({ previousHead });
    const idle = planFor();
    const verdict = carryVerdict({ plan, previous, delta, idle, expected, proof, plannerFiles });
    return { plan: applyCarry(plan, verdict, { idle, expected }), tested, verdict };
  } catch (error) {
    return { plan, tested, verdict: { lanes: [], refused: [], reason: `carry-forward failed: ${error instanceof Error ? error.message.split('\n')[0] : 'unknown'}`, runs: {} } };
  }
}
