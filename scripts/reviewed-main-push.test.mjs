import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { verifyReviewedMainPush } from './reviewed-main-push.mjs';

const captured = JSON.parse(readFileSync(new URL('./fixtures/reviewed-main-push.json', import.meta.url), 'utf8'));
const input = { eventName: 'push', ref: 'refs/heads/main', sha: captured.branch.commit.sha, currentTreeSha: captured.branch.commit.commit.tree.sha, repository: 'wlsdks/ontology-atlas', token: 'test-token' };
function response(value, { status = 200, link = '' } = {}) { return { ok: status >= 200 && status < 300, status, headers: { get: (name) => name.toLowerCase() === 'link' ? link : null }, json: async () => value }; }
function mock(change = () => {}) {
  const data = structuredClone(captured); change(data);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/branches/main')) return response(data.branch);
    if (url.includes('/rules/branches/main')) return response(data.rules);
    if (url.includes(`/commits/${input.sha}/pulls`)) return response(data.pulls);
    if (url.includes('/git/commits/')) return response(data.headCommit);
    if (url.includes('/check-runs')) return response(data.checks);
    throw new Error('unexpected URL');
  };
  return { data, calls, fetchImpl };
}
async function check(change) { const state = mock(change); return verifyReviewedMainPush({ ...input, fetchImpl: state.fetchImpl }); }

test('complete public REST proof reuses the exact reviewed tree', async () => {
  const state = mock();
  const result = await verifyReviewedMainPush({ ...input, fetchImpl: state.fetchImpl });
  assert.deepEqual({ ...result, reason: undefined }, { skip: true, pullRequest: 1593, commit: input.sha, tree: input.currentTreeSha, reviewedHead: captured.headCommit.sha, reason: undefined });
  assert.equal(state.calls.length, 5);
  assert.equal(new Set(state.calls.map((call) => call.options.signal)).size, 1);
  assert.ok(state.calls.every((call) => call.options.signal.aborted));
});

test('required contexts are the complete union and allow GitHub any-app bindings', async () => {
  const result = await check((data) => {
    data.branch.protection.required_status_checks.contexts = [];
    data.branch.protection.required_status_checks.checks[0].app_id = null;
    data.branch.protection.required_status_checks.checks[1].app_id = -1;
  });
  assert.equal(result.skip, true);
});

test('non-main events and hostile repository input make no request', async () => {
  for (const override of [{ eventName: 'pull_request' }, { eventName: 'schedule' }, { eventName: 'workflow_dispatch' }, { eventName: 'merge_group' }, { ref: 'refs/heads/topic' }, { repository: 'owner/repo/extra' }, { repository: '../repo' }, { repository: 'owner/%2Frepo' }, { token: '' }]) {
    let calls = 0;
    const result = await verifyReviewedMainPush({ ...input, ...override, fetchImpl: async () => { calls += 1; throw new Error('unexpected'); } });
    assert.equal(result.skip, false); assert.equal(calls, 0);
  }
});

test('policy, branch, PR, head and check ambiguity all retain CI', async () => {
  const mutations = [
    (d) => { d.rules.push({ id: 1 }); },
    (d) => { d.branch.protected = false; },
    (d) => { d.branch.protection.enabled = false; },
    (d) => { delete d.branch.protection.required_status_checks; },
    (d) => { d.branch.protection.required_status_checks.enforcement_level = 'off'; },
    (d) => { delete d.branch.protection.required_status_checks.enforcement_level; },
    (d) => { d.branch.protection.required_status_checks.checks[0].app_id = 7; },
    (d) => { d.branch.protection.required_status_checks.contexts.push('New gate'); },
    (d) => { d.branch.commit.sha = '0'.repeat(40); },
    (d) => { d.branch.commit.commit.tree.sha = '0'.repeat(40); },
    (d) => { d.pulls[0].state = 'open'; },
    (d) => { d.pulls.push({ ...d.pulls[0], number: 2 }); },
    (d) => { d.headCommit.sha = '0'.repeat(40); },
    (d) => { d.headCommit.tree.sha = 'bad'; },
    (d) => { d.checks.total_count += 1; },
    (d) => { d.checks.check_runs[0].head_sha = '0'.repeat(40); },
    (d) => { d.checks.check_runs[0].conclusion = 'failure'; },
    (d) => { d.checks.check_runs[0].app.id = 1; },
  ];
  for (const mutate of mutations) assert.equal((await check(mutate)).skip, false, mutate.toString());
});

test('HTTP, malformed JSON and Link next pagination fail closed without leaking token', async () => {
  for (const fetchImpl of [
    async () => response({}, { status: 403 }),
    async () => ({ ok: true, headers: { get: () => '' }, json: async () => { throw new Error('test-token'); } }),
    async () => response([], { link: '<https://api.github.com/next>; rel="next"' }),
    async () => response([], { link: '<https://api.github.com/next>; rel=next' }),
    async () => ({ ok: true, json: async () => captured.branch }),
  ]) {
    const result = await verifyReviewedMainPush({ ...input, fetchImpl });
    assert.equal(result.skip, false); assert.doesNotMatch(result.reason, /test-token/);
  }
});

test('one shared deadline aborts all remaining reads', async () => {
  const signals = [];
  const result = await verifyReviewedMainPush({ ...input, timeoutMs: 1, fetchImpl: async (_url, options) => {
    signals.push(options.signal);
    await delay(60_000, undefined, { signal: options.signal });
    throw new Error('not reached');
  } });
  assert.equal(result.skip, false);
  assert.equal(signals.length, 3);
  assert.equal(new Set(signals).size, 1);
  assert.equal(signals[0].aborted, true);
});
