import assert from 'node:assert/strict';
import net from 'node:net';
import { test } from 'node:test';

import { freePort, main } from './brief-new.mjs';

async function run(argv, extra = {}) {
  let out = '';
  let err = '';
  const code = await main({
    argv,
    stdout: { write: (s) => { out += s; } },
    stderr: { write: (s) => { err += s; } },
    checks: () => ['pnpm test:example'],
    ...extra,
  });
  return { code, out, err };
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

test('train pushes a draft while integration does not push', async () => {
  const train = await run(['--slug=feat/x', '--owns=a.mjs', '--path=train']);
  assert.match(train.out, /gh pr create --draft/);
  assert.match(train.out, /never mark it ready or run `pnpm pr:land`/);
  const integration = await run(['--slug=feat/x', '--owns=a.mjs']);
  assert.match(integration.out, /do not push/);
  assert.doesNotMatch(integration.out, /gh pr create/);
});
