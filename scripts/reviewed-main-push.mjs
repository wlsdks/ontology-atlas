import { reviewedMainPushVerdict } from './lib/reviewed-main-push.mjs';

// Read the live protection rule rather than copying its required-check names.
// Rulesets and truncated responses fall back to CI until their complete policy is supported.
const QUERY = `query($owner:String!,$name:String!,$sha:GitObjectID!) {
  repository(owner:$owner,name:$name) {
    rulesets(first:1,includeParents:true) { totalCount }
    ref(qualifiedName:"refs/heads/main") {
      branchProtectionRule { requiresStatusChecks requiredStatusCheckContexts }
    }
    object(oid:$sha) { ... on Commit {
      oid tree { oid }
      associatedPullRequests(first:10) {
        pageInfo { hasNextPage }
        nodes {
          number state mergedAt baseRefName mergeCommit { oid } headRefOid
          commits(last:1) { nodes { commit {
            oid tree { oid }
            statusCheckRollup { contexts(first:100) {
              pageInfo { hasNextPage }
              nodes {
                __typename
                ... on CheckRun {
                  name databaseId status conclusion startedAt completedAt
                  checkSuite { app { databaseId slug } }
                }
                ... on StatusContext { context }
              }
            } }
          } } }
        }
      }
    } }
  }
}`;

export async function verifyReviewedMainPush({
  eventName, ref, sha, currentTreeSha,
  repository = process.env.GITHUB_REPOSITORY,
  token = process.env.GH_TOKEN,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8_000,
} = {}) {
  const run = (reason) => ({ skip: false, reason });
  if (eventName !== 'push' || ref !== 'refs/heads/main') return run('not a main push');
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) return run('GitHub proof credentials or repository unavailable');
  if (![sha, currentTreeSha].every((value) => /^[a-f0-9]{40}$/.test(value ?? ''))) return run('current Git identity unavailable');
  const [owner, name] = repository.split('/');
  try {
    const response = await fetchImpl('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { owner, name, sha } }),
      signal: AbortSignal.timeout(Math.min(Math.max(1, timeoutMs), 8_000)),
    });
    if (!response.ok) return run(`GitHub proof HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.errors?.length) return run('GitHub proof contains GraphQL errors');
    const repo = payload.data?.repository;
    if (repo?.rulesets?.totalCount !== 0) return run('effective ruleset policy is not proven');
    const rule = repo.ref?.branchProtectionRule;
    if (!rule?.requiresStatusChecks || !Array.isArray(rule.requiredStatusCheckContexts)) return run('required-check policy unavailable');
    const commit = repo.object;
    if (commit?.oid !== sha || commit.tree?.oid !== currentTreeSha) return run('GitHub commit differs from the local tree');
    const associated = commit.associatedPullRequests;
    if (associated?.pageInfo?.hasNextPage !== false || !Array.isArray(associated.nodes)) return run('associated pull requests incomplete');
    const candidates = associated.nodes.filter((pr) => pr?.mergeCommit?.oid === sha && pr.state === 'MERGED');
    if (candidates.length !== 1) return run('no unique merged pull request for this commit');
    const pr = candidates[0];
    const heads = pr.commits?.nodes;
    if (heads?.length !== 1 || heads[0]?.commit?.oid !== pr.headRefOid) return run('reviewed head commit unavailable');
    const head = heads[0].commit;
    const contexts = head.statusCheckRollup?.contexts;
    if (contexts?.pageInfo?.hasNextPage !== false || !Array.isArray(contexts.nodes)) return run('check run response incomplete');
    if (contexts.nodes.some((check) => !check || !['CheckRun', 'StatusContext'].includes(check.__typename))) return run('unknown check evidence');
    if (contexts.nodes.some((check) => check.__typename === 'StatusContext' && rule.requiredStatusCheckContexts.includes(check.context))) return run('required legacy status attribution is not proven');
    const verdict = reviewedMainPushVerdict({
      eventName, ref, sha, currentTreeSha,
      protectionComplete: true,
      requiresStatusChecks: rule.requiresStatusChecks,
      requiredContexts: rule.requiredStatusCheckContexts,
      associatedPullRequestsComplete: true,
      associatedPullRequests: [{
        number: pr.number, state: 'closed', merged_at: pr.mergedAt,
        base: { ref: pr.baseRefName }, merge_commit_sha: pr.mergeCommit.oid,
        head: { sha: pr.headRefOid }, headTreeSha: head.tree?.oid,
      }],
      checkRunsComplete: true,
      checkRuns: contexts.nodes.filter((check) => check.__typename === 'CheckRun').map((check) => ({
        name: check.name, id: check.databaseId, head_sha: head.oid,
        status: check.status?.toLowerCase(), conclusion: check.conclusion?.toLowerCase(),
        started_at: check.startedAt, completed_at: check.completedAt,
        app: { id: check.checkSuite?.app?.databaseId, slug: check.checkSuite?.app?.slug },
      })),
    });
    return verdict.skip ? { ...verdict, commit: sha, tree: currentTreeSha, reviewedHead: head.oid } : verdict;
  } catch {
    return run('GitHub proof request failed, timed out or was malformed');
  }
}
