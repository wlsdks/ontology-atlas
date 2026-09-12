import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { verifyReviewedMainPush } from './reviewed-main-push.mjs';

const captured = JSON.parse(readFileSync(new URL('./fixtures/reviewed-main-push.json', import.meta.url), 'utf8'));
const current = captured.data.repository.object;
const input = {
  eventName: 'push', ref: 'refs/heads/main', sha: current.oid,
  currentTreeSha: current.tree.oid, repository: 'wlsdks/ontology-atlas', token: 'test-only-token',
};
const check = async (change = () => {}) => {
  const payload = structuredClone(captured);
  change(payload);
  return verifyReviewedMainPush({ ...input, fetchImpl: async () => ({ ok: true, json: async () => payload }) });
};

test('the captured merged PR proves its exact tree without a copied required-name list', async () => {
  const { reason, ...verdict } = await check();
  assert.ok(reason);
  assert.deepEqual(verdict, {
    skip: true,
    commit: current.oid,
    pullRequest: 1591,
    tree: current.tree.oid,
    reviewedHead: current.associatedPullRequests.nodes[0].headRefOid,
  });
});

test('other events, branches and missing credentials never make a network request', async () => {
  for (const override of [{ eventName: 'pull_request' }, { eventName: 'schedule' }, { eventName: 'workflow_dispatch' }, { ref: 'refs/heads/topic' }, { token: '' }, { sha: 'unknown' }]) {
    let calls = 0;
    const result = await verifyReviewedMainPush({ ...input, ...override, fetchImpl: async () => { calls += 1; throw new Error('unexpected'); } });
    assert.equal(result.skip, false);
    assert.equal(calls, 0);
  }
});

test('partial GraphQL, policy, commit and pagination evidence retain CI', async () => {
  const mutations = [
    (p) => { p.errors = [{ message: 'partial access' }]; },
    (p) => { p.data.repository.rulesets.totalCount = 1; },
    (p) => { delete p.data.repository.ref.branchProtectionRule; },
    (p) => { p.data.repository.ref.branchProtectionRule.requiredStatusCheckContexts.push('A newly required gate'); },
    (p) => { p.data.repository.object.tree.oid = '0'.repeat(40); },
    (p) => { p.data.repository.object.associatedPullRequests.pageInfo.hasNextPage = true; },
    (p) => { p.data.repository.object.associatedPullRequests.nodes[0].commits.nodes = []; },
    (p) => { p.data.repository.object.associatedPullRequests.nodes[0].commits.nodes[0].commit.statusCheckRollup.contexts.pageInfo.hasNextPage = true; },
    (p) => { p.data.repository.object.associatedPullRequests.nodes[0].commits.nodes[0].commit.statusCheckRollup.contexts.nodes.push({ __typename: 'StatusContext', context: 'MCP' }); },
  ];
  for (const mutate of mutations) assert.equal((await check(mutate)).skip, false, mutate.toString());
});

test('HTTP, malformed body and network failures fall back without exposing credentials', async () => {
  for (const fetchImpl of [
    async () => ({ ok: false, status: 403 }),
    async () => ({ ok: true, json: async () => { throw new Error('test-only-token'); } }),
    async () => { throw new Error('test-only-token'); },
  ]) {
    const result = await verifyReviewedMainPush({ ...input, fetchImpl });
    assert.equal(result.skip, false);
    assert.doesNotMatch(result.reason, /test-only-token/);
  }
});

test('the request is one bounded read against the fixed GitHub endpoint', async () => {
  let calls = 0;
  let aborted = false;
  const result = await verifyReviewedMainPush({ ...input, timeoutMs: 1, fetchImpl: async (url, options) => {
    calls += 1;
    assert.equal(url, 'https://api.github.com/graphql');
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    assert.deepEqual(body.variables, { owner: 'wlsdks', name: 'ontology-atlas', sha: input.sha });
    assert.doesNotMatch(body.query, /\bmutation\b/);
    assert.ok(options.signal instanceof AbortSignal);
    try { await delay(60_000, undefined, { signal: options.signal }); }
    catch (error) { aborted = options.signal.aborted; throw error; }
    throw new Error('the timeout guard did not abort');
  } });
  assert.equal(result.skip, false);
  assert.equal(calls, 1);
  assert.equal(aborted, true);
});
