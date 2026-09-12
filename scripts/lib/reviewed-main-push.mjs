/**
 * Pure, fail-closed verdict for reusing an exact pull request review on the
 * resulting main push. The caller owns complete GitHub pagination, ruleset
 * exclusion, and commit-tree resolution.
 */
export function reviewedMainPushVerdict(input) {
  const run = (reason) => ({ skip: false, reason });
  if (input?.eventName !== 'push') return run('event is not push');
  if (input.ref !== 'refs/heads/main') return run('push is not refs/heads/main');
  if (!isSha(input.sha) || !isSha(input.currentTreeSha)) return run('current commit or tree is missing');
  if (input.protectionComplete !== true || input.requiresStatusChecks !== true) return run('required status-check protection is not completely known');
  if (!validContexts(input.requiredContexts)) return run('required contexts must be a nonempty unique string list');
  if (input.associatedPullRequestsComplete !== true) return run('associated pull request response is incomplete');
  if (!Array.isArray(input.associatedPullRequests)) return run('associated pull requests are missing');

  const candidates = input.associatedPullRequests.filter((pr) =>
    Number.isSafeInteger(pr?.number) && pr.number > 0 &&
    pr.state === 'closed' && validTimestamp(pr.merged_at) &&
    pr?.base?.ref === 'main' && pr.merge_commit_sha === input.sha
  );
  if (candidates.length !== 1) return run(`expected one exact merged pull request, received ${candidates.length}`);
  const pr = candidates[0];
  if (!isSha(pr?.head?.sha) || !isSha(pr.headTreeSha)) return run('pull request head commit or tree is missing');
  if (pr.headTreeSha !== input.currentTreeSha) return run('merged tree differs from reviewed pull request head tree');
  if (input.checkRunsComplete !== true) return run('check run response is incomplete or pagination is ambiguous');
  if (!Array.isArray(input.checkRuns)) return run('check runs are missing');

  const latest = new Map();
  for (const check of input.checkRuns) {
    if (typeof check?.name !== 'string' || !input.requiredContexts.includes(check.name)) continue;
    if (check.head_sha !== pr.head.sha) return run(`required context appears on a different head SHA: ${check.name}`);
    if (!Number.isSafeInteger(check.id) || !Number.isFinite(runTime(check))) return run(`required context ordering is ambiguous: ${check.name}`);
    if (check.status === 'completed' && !validTimestamp(check.completed_at)) return run(`completed context has no valid completion timestamp: ${check.name}`);
    const prior = latest.get(check.name);
    const order = prior ? compareRuns(check, prior) : 1;
    if (prior && order === 0 && !sameVerdict(check, prior)) return run(`conflicting tied check runs: ${check.name}`);
    if (!prior || order > 0) latest.set(check.name, check);
  }
  for (const name of input.requiredContexts) {
    const check = latest.get(name);
    if (!check) return run(`required context is missing: ${name}`);
    if (check?.app?.slug !== 'github-actions' || check?.app?.id !== 15368) return run(`required context has foreign app attribution: ${name}`);
    if (check.status !== 'completed') return run(`required context is incomplete: ${name}`);
    if (check.conclusion !== 'success') return run(`latest required context is not successful: ${name}`);
  }
  return { skip: true, reason: 'exact main tree already passed every required GitHub Actions context', pullRequest: pr.number };
}

function validContexts(value) {
  return Array.isArray(value) && value.length > 0 && value.every((name) => typeof name === 'string' && name.trim() === name && name.length > 0) && new Set(value).size === value.length;
}
function isSha(value) { return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value); }
function validTimestamp(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function runTime(check) { return Date.parse(check.started_at ?? check.created_at ?? ''); }
function compareRuns(left, right) { return runTime(left) - runTime(right) || left.id - right.id; }
function sameVerdict(left, right) {
  return left.head_sha === right.head_sha && left.status === right.status && left.conclusion === right.conclusion && left.completed_at === right.completed_at && left?.app?.id === right?.app?.id && left?.app?.slug === right?.app?.slug;
}
