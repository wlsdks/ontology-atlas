import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reviewedMainPushVerdict } from './reviewed-main-push.mjs';

const SHA = 'a'.repeat(40); const HEAD = 'b'.repeat(40); const TREE = 'c'.repeat(40);
const REQUIRED = ['Types · Lint · Docs', 'Unit · Contract', 'MCP'];
function fixture() {
  return {
    eventName: 'push', ref: 'refs/heads/main', sha: SHA, currentTreeSha: TREE,
    protectionComplete: true, requiresStatusChecks: true, requiredContexts: REQUIRED,
    associatedPullRequestsComplete: true,
    associatedPullRequests: [{ number: 1591, state: 'closed', merged_at: '2026-09-13T00:02:00Z', merge_commit_sha: SHA, base: { ref: 'main' }, head: { sha: HEAD }, headTreeSha: TREE }],
    checkRunsComplete: true,
    checkRuns: REQUIRED.map((name, index) => ({ id: index + 1, name, head_sha: HEAD, status: 'completed', conclusion: 'success', started_at: `2026-09-13T00:00:${String(index).padStart(2, '0')}Z`, completed_at: `2026-09-13T00:01:${String(index).padStart(2, '0')}Z`, app: { id: 15368, slug: 'github-actions' } })),
  };
}
const verdict = (change) => reviewedMainPushVerdict(Object.assign(fixture(), change));

describe('reviewed main push verdict', () => {
  it('skips the exact reviewed tree for a dynamic required-context set', () => assert.deepEqual(verdict({}), { skip: true, reason: 'exact main tree already passed every required GitHub Actions context', pullRequest: 1591 }));
  for (const [name, change] of [
    ['pull request event', { eventName: 'pull_request' }], ['schedule', { eventName: 'schedule' }], ['manual', { eventName: 'workflow_dispatch' }], ['merge group', { eventName: 'merge_group' }],
    ['branch', { ref: 'refs/heads/topic' }], ['commit', { sha: 'd'.repeat(40) }], ['tree', { currentTreeSha: 'd'.repeat(40) }], ['missing tree', { currentTreeSha: null }],
    ['partial protection', { protectionComplete: false }], ['no status protection', { requiresStatusChecks: false }],
    ['partial PR API', { associatedPullRequestsComplete: false }], ['partial check API', { checkRunsComplete: false }],
  ]) it(`runs for ${name}`, () => assert.equal(verdict(change).skip, false));

  it('rejects empty, duplicate, or newly added missing required contexts', () => {
    assert.equal(verdict({ requiredContexts: [] }).skip, false);
    assert.equal(verdict({ requiredContexts: [REQUIRED[0], REQUIRED[0]] }).skip, false);
    assert.match(verdict({ requiredContexts: [...REQUIRED, 'New required gate'] }).reason, /missing/);
  });

  it('runs when the matching PR is invalid or ambiguous', () => {
    for (const mutate of [(pr) => { pr.number = 0; }, (pr) => { pr.state = 'open'; }, (pr) => { pr.merged_at = null; }, (pr) => { pr.base.ref = 'develop'; }, (pr) => { pr.merge_commit_sha = 'd'.repeat(40); }]) {
      const data = fixture(); mutate(data.associatedPullRequests[0]); assert.equal(reviewedMainPushVerdict(data).skip, false);
    }
    const data = fixture(); data.associatedPullRequests.push({ ...data.associatedPullRequests[0], number: 2 });
    assert.equal(reviewedMainPushVerdict(data).skip, false);
  });

  it('runs for missing, red, skipped, incomplete, or foreign required contexts', () => {
    for (const mutate of [(d) => d.checkRuns.pop(), (d) => { d.checkRuns[0].conclusion = 'failure'; }, (d) => { d.checkRuns[0].conclusion = 'skipped'; }, (d) => { d.checkRuns[0].status = 'in_progress'; d.checkRuns[0].conclusion = null; }, (d) => { d.checkRuns[0].app.slug = 'foreign'; }]) {
      const data = fixture(); mutate(data); assert.equal(reviewedMainPushVerdict(data).skip, false);
    }
  });

  it('lets a newer failure override an older success even after merge', () => {
    for (const prepend of [true, false]) {
      const data = fixture(); const failed = { ...data.checkRuns[0], id: 99, conclusion: 'failure', started_at: '2026-09-14T00:00:00Z', completed_at: '2026-09-14T00:01:00Z' };
      data.checkRuns = prepend ? [failed, ...data.checkRuns] : [...data.checkRuns, failed];
      assert.equal(reviewedMainPushVerdict(data).skip, false);
    }
  });

  it('rejects a required check name observed on a different head SHA', () => {
    const data = fixture(); data.checkRuns.push({ ...data.checkRuns[0], id: 99, head_sha: SHA });
    assert.match(reviewedMainPushVerdict(data).reason, /different head SHA/);
  });

  it('fails closed on incomplete ordering or conflicting duplicate order keys', () => {
    const incomplete = fixture(); delete incomplete.checkRuns[0].started_at;
    assert.match(reviewedMainPushVerdict(incomplete).reason, /ordering is ambiguous/);
    const tied = fixture(); tied.checkRuns.push({ ...tied.checkRuns[0], conclusion: 'failure' });
    assert.match(reviewedMainPushVerdict(tied).reason, /conflicting tied/);
    const incompleteCompletion = fixture(); delete incompleteCompletion.checkRuns[0].completed_at;
    assert.match(reviewedMainPushVerdict(incompleteCompletion).reason, /completion timestamp/);
  });
});
