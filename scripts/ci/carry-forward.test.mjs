import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { carryForward, laneReaders, readCarryProof } from './carry-forward.mjs';
import { buildImpactPlan, validatePlan } from './classify-change.mjs';
import { testedTreeMessage } from '../lib/ci/carry-forward.mjs';

const A = 'a'.repeat(40);
const input = { previousHead: A, repository: 'owner/repo', token: 'test-token' };

function response(value, { status = 200, link = '' } = {}) {
  return { ok: status >= 200 && status < 300, status, headers: { get: (name) => (name.toLowerCase() === 'link' ? link : null) }, json: async () => value };
}

function plan(id, name, suite, conclusion = 'success', runId = 900, appId = 15368) {
  return { id, name, status: 'completed', conclusion, check_suite: { id: suite }, app: { id: appId }, head_sha: A, details_url: `https://github.com/owner/repo/actions/runs/${runId}/job/${id}` };
}

function world({ runs, annotations = {}, pages = 1, override = () => undefined } = {}) {
  const checkRuns = runs ?? [
    plan(1, 'Check impact plan', 7, 'success', 901),
    plan(2, 'MCP', 7, 'success', 901),
    plan(3, 'E2E impact plan', 8, 'success', 902),
  ];
  const tested = testedTreeMessage({ head: A, base: 'b'.repeat(40), tree: 'c'.repeat(40) });
  const notes = { 1: [{ annotation_level: 'notice', title: 'CI tested tree', message: tested }], 3: [{ annotation_level: 'notice', title: '', message: 'runner image notice' }], ...annotations };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const custom = override(url);
    if (custom) return custom;
    const page = Number(new URL(url).searchParams.get('page') ?? 1);
    if (url.includes(`/commits/${A}/check-runs`)) {
      const size = Math.ceil(checkRuns.length / pages);
      return response({ total_count: checkRuns.length, check_runs: checkRuns.slice((page - 1) * size, page * size) }, { link: page < pages ? '<x>; rel="next"' : '' });
    }
    const id = /check-runs\/(\d+)\/annotations/.exec(url)?.[1];
    if (id) return response(notes[id] ?? []);
    throw new Error(`unexpected URL ${url}`);
  };
  return { calls, fetchImpl };
}

test('a complete read returns every latest run and each plan job annotation', async () => {
  const state = world({ pages: 2 });
  const proof = await readCarryProof({ ...input, fetchImpl: state.fetchImpl });
  assert.equal(proof.ok, true);
  assert.equal(proof.runs.length, 3);
  assert.deepEqual(proof.owners['Check impact plan'], { head: A, base: 'b'.repeat(40), tree: 'c'.repeat(40), carried: [], suite: 7, runId: 901 });
  assert.equal(proof.owners['E2E impact plan'], null, 'a plan job without the annotation proves nothing');
  assert.ok(state.calls.every((call) => call.options.headers.Authorization === 'Bearer test-token' && call.options.signal.aborted));
});

test('missing credentials or a hostile repository make no request', async () => {
  for (const override of [{ token: '' }, { repository: 'owner/repo/extra' }, { repository: '../repo' }, { previousHead: 'main' }]) {
    let calls = 0;
    const proof = await readCarryProof({ ...input, ...override, fetchImpl: async () => { calls += 1; throw new Error('unexpected'); } });
    assert.equal(proof.ok, false);
    assert.equal(calls, 0);
  }
});

test('an unreadable, partial or foreign read carries nothing', async () => {
  const foreign = [{ id: 1, name: 'MCP', status: 'completed', conclusion: 'success', check_suite: { id: 7 }, app: { id: 15368 }, head_sha: 'f'.repeat(40) }];
  const cases = [
    world({ override: (url) => (url.includes('/check-runs?') ? response({}, { status: 403 }) : undefined) }),
    world({ override: (url) => (url.includes('/check-runs?') ? response({ total_count: 9, check_runs: [] }) : undefined) }),
    world({ override: (url) => (url.includes('/annotations') ? response([], { link: '<x>; rel="next"' }) : undefined) }),
    world({ override: (url) => (url.includes('/annotations') ? response({ message: 'not a list' }) : undefined) }),
    world({ runs: foreign }),
    world({ pages: 4, runs: Array.from({ length: 4 }, (_, index) => ({ id: index + 1, name: `Job ${index}`, status: 'completed', conclusion: 'success', check_suite: { id: 7 }, app: { id: 15368 }, head_sha: A })) }),
    world({ override: () => { throw new Error('network'); } }),
  ];
  for (const [index, state] of cases.entries()) {
    const proof = await readCarryProof({ ...input, fetchImpl: state.fetchImpl });
    assert.equal(proof.ok, false, `case ${index}`);
  }
});

test('a duplicated, failed or forged plan-job annotation proves nothing', async () => {
  const tested = testedTreeMessage({ head: A, base: 'b'.repeat(40), tree: 'c'.repeat(40) });
  const twice = world({ annotations: { 1: [1, 2].map(() => ({ annotation_level: 'notice', title: 'CI tested tree', message: tested })) } });
  assert.equal((await readCarryProof({ ...input, fetchImpl: twice.fetchImpl })).owners['Check impact plan'], null);
  const warning = world({ annotations: { 1: [{ annotation_level: 'warning', title: 'CI tested tree', message: tested }] } });
  assert.equal((await readCarryProof({ ...input, fetchImpl: warning.fetchImpl })).owners['Check impact plan'], null);
  const failedPlan = world({ runs: [plan(1, 'Check impact plan', 7, 'failure')] });
  const read = await readCarryProof({ ...input, fetchImpl: failedPlan.fetchImpl });
  assert.equal(read.owners['Check impact plan'], null);
  assert.ok(!failedPlan.calls.some((call) => call.url.includes('/annotations')), 'a failed plan job is not read');
});

test('the skipped twin a draft push leaves is set aside, so the ready run on the same head proves', async () => {
  const runs = [
    plan(10, 'Check impact plan', 3, 'skipped', 800), plan(11, 'MCP', 3, 'skipped', 800),
    plan(1, 'Check impact plan', 7, 'success', 901), plan(2, 'MCP', 7, 'success', 901),
  ];
  const proof = await readCarryProof({ ...input, fetchImpl: world({ runs }).fetchImpl });
  assert.equal(proof.owners['Check impact plan']?.runId, 901);
  assert.deepEqual(proof.runs.map((run) => run.id), [1, 2], 'the skipped suite is gone, lane jobs too');
});

test('two ready runs, a plan job from another app or without a run link prove nothing', async () => {
  const cases = [
    [plan(1, 'Check impact plan', 7, 'success', 901), plan(4, 'Check impact plan', 9, 'success', 903)],
    [plan(1, 'Check impact plan', 7, 'success', 901, 7)],
    [{ ...plan(1, 'Check impact plan', 7), details_url: 'https://example.com/elsewhere' }],
  ];
  for (const runs of cases) {
    const proof = await readCarryProof({ ...input, fetchImpl: world({ runs }).fetchImpl });
    assert.equal(proof.ok, true);
    assert.equal(proof.owners['Check impact plan'], null, JSON.stringify(runs.map((run) => run.id)));
  }
});

// A real repository: base Y, previous head A, fix B, and GitHub-style merge commits of each.
function repository() {
  const root = mkdtempSync(join(tmpdir(), 'carry-forward-'));
  const git = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' } }).trim();
  const write = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  git(['init', '-q', '-b', 'main']);
  write('mcp/src/analyze/repo-structure.mjs', 'export const a = 1;\n');
  write('scripts/landing/pr-land.mjs', 'export const b = 1;\n');
  write('mcp/src/lib/other.mjs', 'export const other = 1;\n');
  write('README.md', 'base\n');
  git(['add', '.']); git(['commit', '-qm', 'base']);
  const base = git(['rev-parse', 'HEAD']);
  git(['checkout', '-qb', 'topic']);
  write('mcp/src/analyze/repo-structure.mjs', 'export const a = 2;\n');
  git(['commit', '-qam', 'previous head']);
  const previousHead = git(['rev-parse', 'HEAD']);
  git(['checkout', '-q', 'main']);
  write('README.md', 'main moved on a path the branch does not touch\n');
  git(['commit', '-qam', 'main']);
  const movedBase = git(['rev-parse', 'HEAD']);
  return { root, git, write, base, movedBase, previousHead, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function mergeOf(repo, base, head) {
  repo.git(['checkout', '-q', '--detach', base]);
  repo.git(['merge', '-q', '--no-ff', '-m', 'merge', head]);
  return { merge: repo.git(['rev-parse', 'HEAD']), tree: repo.git(['rev-parse', 'HEAD^{tree}']) };
}

test('a real fix push rebuilds the tested tree with Git and carries only the untouched lane', async () => {
  const repo = repository();
  try {
    // Main moved before the previous run, so the tree it tested is a real merge, not the head's tree.
    const previousMerge = mergeOf(repo, repo.movedBase, repo.previousHead);
    assert.notEqual(previousMerge.tree, repo.git(['rev-parse', `${repo.previousHead}^{tree}`]));
    repo.git(['checkout', '-q', 'topic']);
    repo.write('scripts/landing/pr-land.mjs', 'export const b = 2;\n');
    repo.git(['commit', '-qam', 'fix']);
    const head = repo.git(['rev-parse', 'HEAD']);
    mergeOf(repo, repo.movedBase, head);
    const plan = buildImpactPlan({ files: repo.git(['diff', '--name-only', `${repo.movedBase}...HEAD`]).split('\n') });
    let asked;
    const readProof = async ({ previousHead }) => {
      asked = previousHead;
      const owner = { head: previousHead, base: repo.movedBase, tree: previousMerge.tree, carried: [], suite: 1, runId: 77 };
      return { ok: true, owners: { 'Check impact plan': owner, 'E2E impact plan': { ...owner, suite: 2 } }, runs: [{ id: 5, name: 'MCP', status: 'completed', conclusion: 'success', suite: 1, appId: 15368, headSha: previousHead }] };
    };
    const result = await carryForward({ plan, base: repo.movedBase, previousHead: repo.previousHead, planFor: buildImpactPlan, git: repo.git, readProof, plannerFiles: [] });
    assert.equal(asked, repo.previousHead);
    assert.deepEqual(result.tested, { base: repo.movedBase, head, tree: repo.git(['rev-parse', 'HEAD^{tree}']) });
    assert.deepEqual(result.verdict.lanes, ['mcp'], result.verdict.reason);
    assert.equal(result.plan.carriedFrom.tree, previousMerge.tree);
    validatePlan(result.plan);

    // The same push tested on another base: the previous run's base no longer matches.
    mergeOf(repo, repo.base, head);
    const moved = await carryForward({ plan, base: repo.base, previousHead: repo.previousHead, planFor: buildImpactPlan, git: repo.git, readProof, plannerFiles: [] });
    assert.deepEqual(moved.verdict.lanes, []);
    assert.match(moved.verdict.refused.find((row) => row.lane === 'mcp').reason, /tested base/);
  } finally {
    repo.cleanup();
  }
});

test('a fix that moves a lane input away runs the lane again, though Git calls it a rename', async () => {
  const repo = repository();
  try {
    const previousMerge = mergeOf(repo, repo.base, repo.previousHead);
    repo.git(['checkout', '-q', 'topic']);
    repo.git(['mv', 'mcp/src/lib/other.mjs', 'scripts/landing/moved.mjs']);
    repo.git(['commit', '-qm', 'move']);
    mergeOf(repo, repo.base, repo.git(['rev-parse', 'topic']));
    const changed = (filter) => repo.git(['diff', '--name-only', `--diff-filter=${filter}`, `${repo.base}...HEAD`]).split('\n').filter(Boolean);
    const plan = buildImpactPlan({ files: changed('ACMRTUXB'), deletedFiles: changed('D') });
    let reads = 0;
    const readProof = async ({ previousHead }) => {
      reads += 1;
      const owner = { head: previousHead, base: repo.base, tree: previousMerge.tree, carried: [], suite: 1, runId: 77 };
      return { ok: true, owners: { 'Check impact plan': owner, 'E2E impact plan': owner }, runs: [{ id: 5, name: 'MCP', status: 'completed', conclusion: 'success', suite: 1, appId: 15368, headSha: previousHead }] };
    };
    const result = await carryForward({ plan, base: repo.base, previousHead: repo.previousHead, planFor: buildImpactPlan, git: repo.git, readProof, plannerFiles: [] });
    assert.equal(plan.lanes.mcp.mode, 'focused', 'the head still plans the analyzer work');
    assert.deepEqual(result.verdict.lanes, []);
    assert.equal(result.verdict.reason, 'the push deletes or moves mcp/src/lib/other.mjs, and a missing file\'s readers are not mapped');
    assert.equal(reads, 0, 'an uncertain push spends no GitHub request');
  } finally {
    repo.cleanup();
  }
});

test('no previous head, an unknown head or a non-merge checkout carries nothing and never throws', async () => {
  const repo = repository();
  try {
    const plan = buildImpactPlan({ files: ['scripts/landing/pr-land.mjs'] });
    const never = async () => { throw new Error('must not read'); };
    const args = { plan, planFor: buildImpactPlan, git: repo.git, readProof: never, plannerFiles: [] };
    assert.equal((await carryForward({ ...args, base: repo.movedBase, previousHead: repo.previousHead })).verdict.reason, 'HEAD is not a pull request merge');
    mergeOf(repo, repo.base, repo.previousHead);
    for (const [previousHead, reason] of [[undefined, 'no previous head'], ['0'.repeat(40), 'no previous head'], [repo.previousHead, 'the previous head is this head'], ['1'.repeat(40), 'the previous head is not in this history']]) {
      const result = await carryForward({ ...args, base: repo.base, previousHead });
      assert.equal(result.verdict.reason, reason);
      assert.equal(result.plan, plan);
    }
    assert.match((await carryForward({ ...args, base: repo.movedBase, previousHead: repo.base })).verdict.reason, /another commit than the merge base/);
    const broken = await carryForward({ ...args, base: repo.base, previousHead: repo.base, git: () => { throw new Error('git exploded'); } });
    assert.match(broken.verdict.reason, /carry-forward failed: git exploded/);
  } finally {
    repo.cleanup();
  }
});

test('every job that owns a required context prints the carried mark for its lane', () => {
  const workflow = (name) => readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
  const jobs = (text) => text.split(/\n(?= {2}[a-z][\w-]*:\n)/).map((block) => ({ name: /\n {4}name: (.+)\n/.exec(block)?.[1], block }));
  // Types · Lint · Docs is never carried; each other required context names the outputs it prints.
  const owners = [
    ['checks', 'Unit · Contract', ['carried_unit', 'carried_perf']],
    ['checks', 'MCP', ['carried_mcp']],
    ['e2e', 'Playwright (static export)', ['carried_static']],
    ['e2e', 'Playwright (web surface)', ['carried_web']],
    ['e2e', 'Playwright (chromium ${{ matrix.shard }}/3)', ['carried_playwright']],
  ];
  for (const [file, name, outputs] of owners) {
    const job = jobs(workflow(file)).find((candidate) => candidate.name === name);
    assert.ok(job, `${file}.yml has no job named ${name}`);
    for (const output of outputs) assert.match(job.block, new RegExp(`outputs\\.${output} \\}\\}`), `${name} prints ${output}`);
  }
});

test('each lane reader root is followed, so dropping any one leaves its file unread', () => {
  const root = mkdtempSync(join(tmpdir(), 'carry-readers-'));
  const write = (path, text = '') => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  try {
    // Each root imports one file only it reaches.
    write('package.json', JSON.stringify({ scripts: {
      build: 'pnpm docs:build && node scripts/web/build.mjs', 'docs:build': 'node scripts/docs/build.mjs',
      'build:static': 'node scripts/web/static.mjs', prepare: 'node scripts/prepare.mjs',
      'test:mcp:unit': 'node --test scripts/lib/rpc.test.mjs',
    } }));
    const root_ = (from, to) => { write(from, `import './${to.split('/').pop()}';\n`); write(to); };
    root_('src/views/page.tsx', 'src/views/from-src.mjs');
    root_('app/layout.tsx', 'app/from-app.mjs');
    root_('tests/e2e/flow.spec.ts', 'tests/e2e/from-e2e.ts');
    root_('scripts/web/build.mjs', 'scripts/web/from-build.mjs');
    root_('scripts/docs/build.mjs', 'scripts/docs/from-docs-build.mjs');
    root_('scripts/web/static.mjs', 'scripts/web/from-static.mjs');
    root_('scripts/prepare.mjs', 'scripts/from-prepare.mjs');
    write('next.config.ts', "import './scripts/from-next.mjs';\n"); write('scripts/from-next.mjs');
    write('playwright.config.ts', "import './scripts/from-playwright.mjs';\n"); write('scripts/from-playwright.mjs');
    root_('mcp/src/tool.test.mjs', 'mcp/src/from-mcp-test.mjs');
    root_('cli/src/command.test.mjs', 'cli/src/from-cli-test.mjs');
    root_('mcp/src/index.js', 'mcp/src/from-server.mjs');
    root_('cli/src/index.mjs', 'cli/src/from-cli.mjs');
    root_('scripts/lib/rpc.test.mjs', 'scripts/lib/from-mcp-command.mjs');
    write('docs/ontology/capabilities/x.md', '---\nkind: capability\npath: scripts/named-by-vault.mjs\n---\n');
    root_('src/map/ratio.perf.test.ts', 'src/map/from-perf.ts');
    write('src/views/page.test.tsx', "import '../../scripts/from-test-only.mjs';\n"); write('scripts/from-test-only.mjs');

    const readers = laneReaders({ root, mcpCommands: ['pnpm test:mcp:unit'] });
    const browser = ['src/views/from-src.mjs', 'app/from-app.mjs', 'tests/e2e/from-e2e.ts', 'scripts/web/from-build.mjs', 'scripts/docs/from-docs-build.mjs', 'scripts/web/from-static.mjs', 'scripts/from-prepare.mjs', 'scripts/from-next.mjs', 'scripts/from-playwright.mjs'];
    for (const lane of ['playwright', 'static', 'web']) for (const path of browser) assert.ok(readers[lane].has(path), `${lane} reads ${path}`);
    assert.ok(!readers.playwright.has('scripts/from-test-only.mjs'), 'a unit test is not the app');
    for (const path of ['mcp/src/from-mcp-test.mjs', 'cli/src/from-cli-test.mjs', 'mcp/src/from-server.mjs', 'cli/src/from-cli.mjs', 'scripts/lib/from-mcp-command.mjs', 'scripts/named-by-vault.mjs']) {
      assert.ok(readers.mcp.has(path), `mcp reads ${path}`);
    }
    assert.ok(readers.perf.has('src/map/from-perf.ts'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reproduced: the app bundles MCP modules, and the CLI loads commands by a computed path', async () => {
  const readers = laneReaders();
  for (const path of ['mcp/src/library/wiki-report.mjs', 'mcp/src/parser.mjs']) assert.ok(readers.playwright.has(path), `the app bundles ${path}`);
  const { uncertainChange } = await import('../lib/ci/carry-forward.mjs');
  assert.match(uncertainChange({ files: ['mcp/src/library/wiki-report.mjs'] }), /^mcp\/src\/library\/wiki-report\.mjs is in mcp\//);
  assert.match(uncertainChange({ files: ['cli/src/commands/graph-traversal/explain.mjs'] }), /computed path/);
});
