import assert from 'node:assert/strict';
import net from 'node:net';
import { test } from 'node:test';

import { freePort, main, suggestedChecks } from './brief-new.mjs';

async function run(argv, extra = {}) {
  let out = '';
  let error = '';
  const code = await main({
    argv,
    stdout: { write: (s) => { out += s; } },
    stderr: { write: (s) => { error += s; } },
    checks: () => ['pnpm test:example'],
    ...extra,
  });
  return { code, out, err: error };
}

test('port selection skips a port held open', async () => {
  const first = await freePort();
  const server = net.createServer();
  await new Promise((done) => server.listen({ port: first, host: '127.0.0.1' }, done));
  try {
    const next = await freePort({ from: first, to: 3299 });
    assert.notEqual(next, first);
    assert.ok(next > first);
    const { out } = await run(['--slug=feat/x', '--owns=a.mjs', '--port'], { findPort: () => freePort({ from: first, to: 3299 }) });
    assert.match(out, new RegExp(`1\\. Port: Use port ${next} only: set \`PLAYWRIGHT_BASE_URL=http://localhost:${next}\``));
    assert.match(out, /add `PLAYWRIGHT_STATIC=1` when proof must cover the exported build/);
    assert.match(out, /pass the same environment to `pnpm checks:changed`\. Run one spec at a time\./);
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test('--no-server says no server may run', async () => {
  const { code, out } = await run(['--', '--slug=feat/x', '--owns=a.mjs', '--no-server']);
  assert.equal(code, 0);
  assert.match(out, /1\. Port: No server may run\./);
  assert.match(out, /`pnpm test:example`/);
  assert.match(out, /6\. Primary sources: the owned files\./);
  assert.match(out, /8\. Budget: none\./);
  assert.match(out, /## Task\n/);
});

test('a slice commits for the integration branch, pushes nothing and runs only its own checks', async () => {
  const brief = await run(['--slug=feat/x', '--owns=a.mjs']);
  assert.equal(brief.code, 0);
  assert.match(brief.out, /do not push and open no pull request/);
  assert.match(brief.out, /merges it into the integration branch with `--no-ff` as soon as it returns; never squash, rebase or cherry-pick/);
  assert.match(brief.out, /`pnpm checks:changed -- --run --slice`/);
  assert.doesNotMatch(brief.out, /gh pr create/);
  assert.equal((await run(['--slug=feat/x', '--owns=a.mjs', '--path=integration'])).code, 0);
  const train = await run(['--slug=feat/x', '--owns=a.mjs', '--path=train']);
  assert.equal(train.code, 1);
  assert.match(train.err, /--path=train is retired/);
});

test('a brief lists only slice checks: the repo-wide lanes wait for the integration tree', () => {
  const checks = suggestedChecks(['src/shared/lib/cn.ts', 'scripts/harness/brief-new.mjs']);
  assert.ok(checks.some((command) => command.startsWith('pnpm exec eslint')), 'the planner ran and printed slice checks');
  for (const repoWide of [/^pnpm knip\b/, /^pnpm typecheck\b/, /^pnpm test:contracts\b/, /^pnpm build\b/, /^pnpm test:mcp:/]) {
    assert.ok(!checks.some((command) => repoWide.test(command)), `${repoWide} must not be a slice's must-stay-green line`);
  }
});
