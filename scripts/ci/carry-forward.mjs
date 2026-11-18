import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { importClosure } from '../lib/import-graph/test-reach.mjs';
import { packageScriptFiles } from '../lib/ci/package-script-files.mjs';
import {
  applyCarry,
  CARRY_OWNERS,
  carryVerdict,
  GITHUB_ACTIONS_APP_ID,
  parseTestedTree,
  TESTED_TREE_TITLE,
  uncertainChange,
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
    const all = checkRuns.map((run) => ({
      id: run?.id, name: run?.name, status: run?.status, conclusion: run?.conclusion ?? null,
      suite: run?.check_suite?.id, appId: run?.app?.id, headSha: run?.head_sha,
      runId: Number(/\/actions\/runs\/(\d+)\/job\//.exec(run?.details_url ?? '')?.[1] ?? Number.NaN),
    }));
    if (all.some((run) => !Number.isSafeInteger(run.id) || typeof run.name !== 'string' || !Number.isSafeInteger(run.suite) || run.headSha !== previousHead)) {
      throw new ProofReadError('a check run is malformed or belongs to another commit');
    }
    // A push while the pull request was a draft leaves a run whose every job was skipped. The head
    // `pnpm pr:land` then marks ready is the same commit, so that skipped twin proves nothing either
    // way and is set aside, whole, by its plan job.
    const skipped = new Set(all.filter((run) => CARRY_OWNERS.includes(run.name) && run.conclusion === 'skipped').map((run) => run.suite));
    const runs = all.filter((run) => !skipped.has(run.suite));
    const owners = {};
    for (const name of CARRY_OWNERS) {
      const named = runs.filter((run) => run.name === name);
      if (named.length !== 1) { owners[name] = null; continue; }
      const [run] = named;
      if (run.appId !== GITHUB_ACTIONS_APP_ID || run.status !== 'completed' || run.conclusion !== 'success' || !Number.isSafeInteger(run.runId) || run.runId < 1) { owners[name] = null; continue; }
      const { body, next } = await get(`/check-runs/${run.id}/annotations?per_page=100`);
      if (!Array.isArray(body) || next) throw new ProofReadError('annotation response is malformed or partial');
      const tested = body.filter((annotation) => annotation?.annotation_level === 'notice' && annotation?.title === TESTED_TREE_TITLE);
      const parsed = tested.length === 1 ? parseTestedTree(tested[0].message) : null;
      owners[name] = parsed ? { ...parsed, suite: run.suite, runId: run.runId } : null;
    }
    return { ok: true, runs, owners };
  } catch (error) {
    return fail(error instanceof ProofReadError ? error.message : 'GitHub REST read failed, timed out or was malformed');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function listed(root, directory, pattern) {
  if (!existsSync(`${root}/${directory}`)) return [];
  return readdirSync(`${root}/${directory}`, { recursive: true })
    .map((name) => `${directory}/${String(name).replaceAll('\\', '/')}`)
    .filter((path) => !path.includes('/node_modules/') && pattern.test(path));
}

/**
 * Every file each carriable lane's tests, commands or build import, from the files on disk. The
 * MCP lane also reads every file the dogfood vault names, through its drift and walk checks.
 */
export function laneReaders({ root = '.', mcpCommands = [] } = {}) {
  const close = (entries) => importClosure(entries, root);
  const browser = close([
    ...listed(root, 'tests/e2e', /\.(?:[cm]?[jt]s)$/),
    ...packageScriptFiles(['build', 'build:static', 'prepare'], root),
    'next.config.ts',
    'playwright.config.ts',
  ]);
  const vaultNamed = listed(root, 'docs/ontology', /\.md$/)
    .flatMap((path) => [...readFileSync(`${root}/${path}`, 'utf8').matchAll(/(?:scripts|mcp|cli|src|app|tests)\/[\w@[\]().\/-]+\.\w+/g)].map((match) => match[0]));
  const mcp = close([
    ...listed(root, 'mcp/src', /\.test\.[cm]?js$/),
    ...listed(root, 'cli/src', /\.test\.[cm]?js$/),
    'mcp/src/index.js',
    'cli/src/index.mjs',
    ...packageScriptFiles(mcpCommands.map((command) => /^pnpm (\S+)/.exec(command)?.[1]).filter(Boolean), root),
  ]);
  for (const path of vaultNamed) mcp.add(path);
  const perf = close(listed(root, 'src', /\.perf\.test\.tsx?$/));
  return { mcp, perf, playwright: browser, static: browser, web: browser };
}

function lines(output) {
  return output ? output.split('\n').filter(Boolean) : [];
}

/**
 * Pull request runs test GitHub's merge of the base and the head. Returns the tested identity, the
 * plan with carried lanes, and the verdict. `git` runs a Git command and returns trimmed stdout;
 * `planFor` is `buildImpactPlan`. Never throws: a failure is a verdict that carries nothing.
 */
export async function carryForward({ plan, base, previousHead, planFor, git, readProof = readCarryProof, plannerFiles = [...importClosure(['scripts/ci/classify-change.mjs'])], readers = () => laneReaders() }) {
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
    const change = { files: diff(previousTree, 'HEAD', 'ACMRTUXB', ['--no-renames']), deleted: diff(previousTree, 'HEAD', 'D', ['--no-renames']) };
    const uncertain = uncertainChange(change);
    if (uncertain) return skip(uncertain);
    const delta = planFor({ files: change.files, deletedFiles: change.deleted });
    const expected = { ...tested, previousHead, previousTree };
    const proof = await readProof({ previousHead });
    const idle = planFor();
    const verdict = carryVerdict({ plan, previous, delta, idle, expected, proof, change, readers: readers(), plannerFiles });
    return { plan: applyCarry(plan, verdict, { idle, expected }), tested, verdict };
  } catch (error) {
    return { plan, tested, verdict: { lanes: [], refused: [], reason: `carry-forward failed: ${error instanceof Error ? error.message.split('\n')[0] : 'unknown'}`, runs: {} } };
  }
}
