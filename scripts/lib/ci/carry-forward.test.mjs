import assert from 'node:assert/strict';
import test from 'node:test';
import { buildImpactPlan, validatePlan } from '../../ci/classify-change.mjs';
import { applyCarry, carryVerdict, parseTestedTree, testedTreeMessage } from './carry-forward.mjs';

const sha = (digit) => digit.repeat(40);
const expected = { base: sha('b'), head: sha('c'), tree: sha('d'), previousHead: sha('a'), previousTree: sha('e') };
const idle = buildImpactPlan();

// The previous head changed an MCP analyzer, a rendered component and the landing script.
const BEFORE = ['mcp/src/analyze/repo-structure.mjs', 'src/widgets/acp-chat-panel/ui/AcpPermissionCard.tsx', 'scripts/landing/pr-land.mjs'];

function job(id, name, suite, conclusion = 'success') {
  return { id, name, status: 'completed', conclusion, suite, appId: 15368, headSha: expected.previousHead };
}

function passingProof() {
  const annotation = { head: expected.previousHead, base: expected.base, tree: expected.previousTree, carried: [] };
  return {
    ok: true,
    owners: { 'Check impact plan': { ...annotation, suite: 1 }, 'E2E impact plan': { ...annotation, suite: 2 } },
    runs: [
      job(10, 'Check impact plan', 1), job(11, 'Types · Lint · Docs', 1),
      job(12, 'Unit · Contract 1/3', 1), job(13, 'Unit · Contract 2/3', 1), job(14, 'Unit · Contract 3/3', 1),
      job(15, 'Perf · Ratios', 1), job(16, 'MCP', 1),
      job(20, 'E2E impact plan', 2), job(21, 'Playwright (static export)', 2), job(22, 'Playwright (web surface)', 2),
      ...[1, 2, 3, 4, 5].map((shard) => job(30 + shard, `Playwright (chromium ${shard}/5)`, 2)),
    ],
  };
}

function cycle(fix, { proof = passingProof(), previousFiles = BEFORE } = {}) {
  const previous = buildImpactPlan({ files: previousFiles });
  const plan = buildImpactPlan({ files: [...new Set([...previousFiles, ...fix])] });
  const delta = buildImpactPlan({ files: fix });
  return { plan, verdict: carryVerdict({ plan, previous, delta, idle, expected, proof, plannerFiles: ['scripts/ci/classify-change.mjs'] }) };
}

const refusal = (verdict, lane) => verdict.refused.find((row) => row.lane === lane)?.reason;

test('planted: a fix that touches a passing lane input runs that lane again', () => {
  const { verdict } = cycle(['mcp/src/analyze/repo-structure.mjs']);
  assert.equal(refusal(verdict, 'mcp'), 'this push changed one of its inputs');
  assert.ok(!verdict.lanes.includes('mcp'));
  assert.ok(verdict.lanes.includes('playwright'), 'the browser suite does not read the analyzer');
});

test('planted: a fix that touches none of a lane input carries it, and the plan stays valid', () => {
  const { plan, verdict } = cycle(['scripts/landing/pr-land.mjs']);
  assert.deepEqual(verdict.lanes, ['mcp', 'playwright']);
  // The security and vault-format contracts read the whole tree, so every real edit is their input.
  assert.equal(refusal(verdict, 'unit'), 'this push changed one of its inputs');
  const carried = validatePlan(applyCarry(plan, verdict, { idle, expected }));
  assert.equal(carried.lanes.mcp.mode, 'skip');
  assert.equal(carried.lanes.e2e.mode, 'skip');
  assert.equal(carried.lanes.gates.run, true, 'Types · Lint · Docs always runs');
  assert.deepEqual(carried.lanes.gates, plan.lanes.gates);
  assert.deepEqual(carried.lanes.unit, plan.lanes.unit);
  assert.deepEqual(carried.carriedFrom, { head: expected.previousHead, base: expected.base, tree: expected.previousTree, lanes: ['mcp', 'playwright'] });
  assert.deepEqual(verdict.runs.playwright, [31, 32, 33, 34, 35]);
});

test('planted: a result proven on a different base is refused', () => {
  const proof = passingProof();
  for (const owner of Object.values(proof.owners)) owner.base = sha('f');
  const { verdict } = cycle(['scripts/landing/pr-land.mjs'], { proof });
  assert.deepEqual(verdict.lanes, []);
  assert.match(refusal(verdict, 'mcp'), /tested base f{9}, not b{9}/);
  assert.match(refusal(verdict, 'playwright'), /tested base f{9}, not b{9}/);
});

test('every weaker proof runs the lane again', () => {
  const cases = [
    ['a failed job', (p) => { p.runs.find((run) => run.name === 'MCP').conclusion = 'failure'; }, 'mcp', /MCP was failure/],
    ['a cancelled shard', (p) => { p.runs.find((run) => run.name === 'Playwright (chromium 4/5)').conclusion = 'cancelled'; }, 'playwright', /4\/5\) was cancelled/],
    ['a running job', (p) => { Object.assign(p.runs.find((run) => run.name === 'MCP'), { status: 'in_progress', conclusion: null }); }, 'mcp', /was in_progress/],
    ['a missing shard', (p) => { p.runs = p.runs.filter((run) => run.name !== 'Playwright (chromium 2/5)'); }, 'playwright', /shard is missing/],
    ['no job at all', (p) => { p.runs = p.runs.filter((run) => run.name !== 'MCP'); }, 'mcp', /no job/],
    ['a job from another workflow run', (p) => { p.runs.find((run) => run.name === 'MCP').suite = 9; }, 'mcp', /another workflow run/],
    ['a job from another app', (p) => { p.runs.find((run) => run.name === 'MCP').appId = 7; }, 'mcp', /another workflow run or app/],
    ['no annotation', (p) => { p.owners['E2E impact plan'] = null; }, 'playwright', /no tested-tree annotation/],
    ['an annotation for another head', (p) => { p.owners['Check impact plan'].head = sha('9'); }, 'mcp', /another head/],
    ['another tested tree', (p) => { p.owners['Check impact plan'].tree = sha('9'); }, 'mcp', /another tree/],
    ['a lane carried at the previous head', (p) => { p.owners['Check impact plan'].carried = ['mcp']; }, 'mcp', /itself carried/],
  ];
  for (const [name, mutate, lane, reason] of cases) {
    const proof = passingProof();
    mutate(proof);
    const { verdict } = cycle(['scripts/landing/pr-land.mjs'], { proof });
    assert.ok(!verdict.lanes.includes(lane), name);
    assert.match(refusal(verdict, lane), reason, name);
  }
});

test('planned work that differs between the heads runs the lane again', () => {
  // The push plans no MCP work, yet this head plans more of it than the previous head ran.
  const previous = buildImpactPlan({ files: BEFORE });
  const plan = buildImpactPlan({ files: BEFORE });
  plan.lanes.mcp = { mode: 'focused', commands: [...plan.lanes.mcp.commands, 'pnpm test:mcp:smoke'] };
  const verdict = carryVerdict({ plan, previous, delta: buildImpactPlan({ files: ['scripts/landing/pr-land.mjs'] }), idle, expected, proof: passingProof() });
  assert.equal(refusal(verdict, 'mcp'), 'its planned work differs from the previous head');
  assert.ok(verdict.lanes.includes('playwright'));
});

test('exhaustive, unreadable, workflow or planner changes carry nothing', () => {
  const run = (overrides) => {
    const previous = buildImpactPlan({ files: BEFORE });
    const plan = buildImpactPlan({ files: BEFORE });
    return carryVerdict({ plan, previous, delta: buildImpactPlan({ files: ['scripts/landing/pr-land.mjs'] }), idle, expected, proof: passingProof(), plannerFiles: ['scripts/ci/classify-change.mjs'], ...overrides });
  };
  const cases = [
    [{ delta: buildImpactPlan({ files: ['scripts/ci/classify-change.mjs'] }) }, /^the push needs an exhaustive run: CI impact authority changed/],
    [{ delta: buildImpactPlan({ files: ['unknown-top-level-file.xyz'] }) }, /^the push needs an exhaustive run: unclassified paths/],
    [{ plan: buildImpactPlan({ forceFull: true }) }, /^this plan is exhaustive/],
    [{ previous: buildImpactPlan({ forceFull: true }) }, /^the previous head planned an exhaustive run/],
    [{ previous: buildImpactPlan({ files: [...BEFORE, '.github/workflows/deploy-pages.yml'] }) }, /^\.github\/workflows\/deploy-pages\.yml differs from the base/],
    [{ plannerFiles: ['scripts/landing/pr-land.mjs'] }, /^scripts\/landing\/pr-land\.mjs differs from the base/],
    [{ proof: { ok: false, reason: 'GitHub HTTP 403' } }, /unreadable: GitHub HTTP 403$/],
    [{ proof: undefined }, /unreadable: no proof$/],
    [{ expected: { ...expected, previousHead: expected.head } }, /^the previous head is this head$/],
    [{ expected: { ...expected, previousTree: 'not-a-sha' } }, /^the tested commits are unknown$/],
  ];
  for (const [overrides, reason] of cases) {
    const verdict = run(overrides);
    assert.deepEqual(verdict.lanes, [], JSON.stringify(Object.keys(overrides)));
    assert.match(verdict.reason, reason);
  }
  const plan = buildImpactPlan({ files: BEFORE });
  assert.deepEqual(carryVerdict({ plan: { ...plan, reusedFrom: {} }, previous: plan, delta: idle, idle, expected, proof: passingProof() }).lanes, []);
});

test('a lane already idle on this head is neither carried nor refused', () => {
  const { verdict } = cycle(['scripts/landing/pr-land.mjs'], { previousFiles: ['scripts/landing/pr-land.mjs'] });
  assert.deepEqual(verdict.lanes, []);
  assert.deepEqual(verdict.refused.map((row) => row.lane), ['unit']);
});

test('the tested-tree annotation round-trips and rejects anything else', () => {
  const message = testedTreeMessage({ head: sha('a'), base: sha('b'), tree: sha('c'), carried: ['mcp', 'web'] });
  assert.deepEqual(parseTestedTree(message), { head: sha('a'), base: sha('b'), tree: sha('c'), carried: ['mcp', 'web'] });
  assert.deepEqual(parseTestedTree(testedTreeMessage({ head: sha('a'), base: sha('b'), tree: sha('c') })).carried, []);
  for (const bad of [message.replace('mcp', 'gates'), message.replace('mcp,web', 'mcp,mcp'), `${message} `, message.replace(sha('a'), 'a'), '', undefined]) {
    assert.equal(parseTestedTree(bad), null, String(bad));
  }
});

test('validatePlan refuses carried provenance that is malformed or still plans work', () => {
  const { plan, verdict } = cycle(['scripts/landing/pr-land.mjs']);
  const carried = applyCarry(plan, verdict, { idle, expected });
  const broken = [
    { ...carried, carriedFrom: { ...carried.carriedFrom, lanes: ['gates'] } },
    { ...carried, carriedFrom: { ...carried.carriedFrom, lanes: [] } },
    { ...carried, carriedFrom: { ...carried.carriedFrom, lanes: ['mcp', 'mcp'] } },
    { ...carried, carriedFrom: { ...carried.carriedFrom, base: 'main' } },
    { ...carried, carriedFrom: { ...carried.carriedFrom, lanes: ['unit'] } },
    { ...carried, carriedFrom: null },
  ];
  for (const candidate of broken) assert.throws(() => validatePlan(candidate), /unsupported CI impact plan/);
});
