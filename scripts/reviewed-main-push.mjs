import { reviewedMainPushVerdict } from './lib/reviewed-main-push.mjs';

const API = 'https://api.github.com';
const SHA = /^[0-9a-f]{40}$/i;
const REPO_PART = /^[A-Za-z0-9_.-]+$/;
class ProofReadError extends Error {}

export async function verifyReviewedMainPush({ eventName, ref, sha, currentTreeSha, repository = process.env.GITHUB_REPOSITORY, token = process.env.GH_TOKEN, fetchImpl = globalThis.fetch, timeoutMs = 8_000 } = {}) {
  const run = (reason) => ({ skip: false, reason });
  if (eventName !== 'push' || ref !== 'refs/heads/main') return run('not a main push');
  const parts = String(repository ?? '').split('/');
  if (!token || parts.length !== 2 || parts.some((part) => !REPO_PART.test(part) || part === '.' || part === '..')) return run('GitHub proof credentials or repository unavailable');
  if (![sha, currentTreeSha].every((value) => SHA.test(value ?? ''))) return run('current Git identity unavailable');
  const repoPath = `/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(1, timeoutMs), 8_000));
  const get = async (path) => {
    const response = await fetchImpl(`${API}${repoPath}${path}`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }, signal: controller.signal });
    if (!response?.ok) throw new ProofReadError(`GitHub proof HTTP ${Number.isInteger(response?.status) ? response.status : 'unknown'} at ${path}`);
    if (typeof response.headers?.get !== 'function') throw new ProofReadError('GitHub response pagination metadata unavailable');
    const link = response.headers.get('link') ?? '';
    if (/\brel\s*=\s*"?next\b/.test(link)) throw new ProofReadError('GitHub response pagination incomplete');
    return response.json();
  };
  try {
    const [branch, rules, pulls] = await Promise.all([get('/branches/main'), get('/rules/branches/main?per_page=100'), get(`/commits/${sha}/pulls?per_page=100`)]);
    if (!Array.isArray(rules) || rules.length !== 0) return run('effective rules policy is unsupported or incomplete');
    const protection = branch?.protection?.required_status_checks;
    if (branch?.name !== 'main' || branch.protected !== true || branch?.protection?.enabled !== true || !protection || !['everyone', 'non_admins'].includes(protection.enforcement_level)) return run('required status-check protection is absent or disabled');
    if (branch?.commit?.sha !== sha || branch?.commit?.commit?.tree?.sha !== currentTreeSha) return run('GitHub main commit differs from the requested local tree');
    if (!Array.isArray(protection.contexts) || !Array.isArray(protection.checks)) return run('required status-check policy is malformed');
    const required = new Set();
    for (const context of protection.contexts) { if (typeof context !== 'string' || !context.trim()) return run('required status-check context is malformed'); required.add(context); }
    for (const check of protection.checks) { if (!check || typeof check.context !== 'string' || !check.context.trim() || ![null, -1, 15368].includes(check.app_id)) return run('required status-check app binding is unsupported'); required.add(check.context); }
    if (required.size === 0) return run('required status-check policy is empty');
    if (!Array.isArray(pulls)) return run('associated pull request response is malformed');
    const candidates = pulls.filter((pr) => pr?.state === 'closed' && pr?.merged_at && pr?.base?.ref === 'main' && pr?.merge_commit_sha === sha);
    if (candidates.length !== 1 || !Number.isSafeInteger(candidates[0]?.number) || candidates[0].number <= 0 || !SHA.test(candidates[0]?.head?.sha ?? '')) return run('no unique valid merged pull request for this commit');
    const pr = candidates[0];
    const [headCommit, checks] = await Promise.all([get(`/git/commits/${pr.head.sha}`), get(`/commits/${pr.head.sha}/check-runs?per_page=100&filter=all`)]);
    if (headCommit?.sha !== pr.head.sha || !SHA.test(headCommit?.tree?.sha ?? '')) return run('reviewed head commit is malformed or mismatched');
    if (!Number.isSafeInteger(checks?.total_count) || !Array.isArray(checks?.check_runs) || checks.total_count !== checks.check_runs.length) return run('check run response is partial or malformed');
    const verdict = reviewedMainPushVerdict({ eventName, ref, sha, currentTreeSha, protectionComplete: true, requiresStatusChecks: true, requiredContexts: [...required], associatedPullRequestsComplete: true, associatedPullRequests: [{ ...pr, headTreeSha: headCommit.tree.sha }], checkRunsComplete: true, checkRuns: checks.check_runs });
    return verdict.skip ? { ...verdict, commit: sha, tree: currentTreeSha, reviewedHead: pr.head.sha } : verdict;
  } catch (error) { return run(error instanceof ProofReadError ? error.message : 'GitHub REST proof failed, timed out or was malformed'); }
  finally { clearTimeout(timer); controller.abort(); }
}
