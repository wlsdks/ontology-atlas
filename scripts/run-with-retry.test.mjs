import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { promisify } from 'node:util';

import { parseArgs } from './run-with-retry.mjs';

const execFileAsync = promisify(execFile);
const SCRIPT = new URL('./run-with-retry.mjs', import.meta.url).pathname;

const workspace = mkdtempSync(join(tmpdir(), 'run-with-retry-'));
after(() => rmSync(workspace, { recursive: true, force: true }));

/**
 * A fake command that appends a line to a counter file on each attempt and starts
 * succeeding at the given attempt number. Proving a retry requires counting the runs
 * from outside.
 */
function fakeCommand({ name, succeedFromAttempt = Infinity, hangMs = 0 }) {
  const counter = join(workspace, `${name}.count`);
  writeFileSync(counter, '');
  const script = join(workspace, `${name}.mjs`);
  writeFileSync(
    script,
    `import { appendFileSync, readFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(counter)}, 'x');
const attempt = readFileSync(${JSON.stringify(counter)}, 'utf8').length;
if (${hangMs} > 0) {
  // A command that never finishes — it sleeps deliberately to show the timeout really kills it.
  setTimeout(() => process.exit(0), ${hangMs});
} else {
  process.exit(attempt >= ${succeedFromAttempt} ? 0 : 7);
}
`,
  );
  return {
    argv: [process.execPath, script],
    attempts: () => readFileSync(counter, 'utf8').length,
  };
}

async function run(args) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT, ...args], {
      cwd: workspace,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

test('성공하면 한 번만 돌고 0으로 끝난다', async () => {
  const fake = fakeCommand({ name: 'ok', succeedFromAttempt: 1 });
  const result = await run(['--attempts=3', '--backoff-ms=1', '--', ...fake.argv]);

  assert.equal(result.code, 0);
  assert.equal(fake.attempts(), 1, '성공했는데 또 돌았다');
});

test('두 번째에 성공하면 세 번째는 돌지 않는다', async () => {
  const fake = fakeCommand({ name: 'flaky', succeedFromAttempt: 2 });
  const result = await run(['--attempts=3', '--backoff-ms=1', '--', ...fake.argv]);

  assert.equal(result.code, 0);
  assert.equal(fake.attempts(), 2);
  assert.match(result.stdout, /2번째 시도에 성공/);
});

test('계속 실패하면 정확히 attempts 만큼 돌고 1로 끝난다', async () => {
  const fake = fakeCommand({ name: 'dead' });
  const result = await run(['--attempts=3', '--backoff-ms=1', '--', ...fake.argv]);

  assert.equal(result.code, 1, '필수 단계가 실패했는데 0으로 끝났다');
  assert.equal(fake.attempts(), 3);
  assert.match(result.stderr, /3번 다 실패/);
});

test('--best-effort 면 다 실패해도 0으로 끝나되, 조용히 넘어가지 않는다', async () => {
  const fake = fakeCommand({ name: 'best-effort' });
  const result = await run(['--attempts=2', '--backoff-ms=1', '--best-effort', '--', ...fake.argv]);

  assert.equal(result.code, 0);
  assert.equal(fake.attempts(), 2);
  // Without a warning this is indistinguishable from success — the failure shape this
  // repository has repeatedly hit with gates.
  assert.match(result.stdout, /::warning title=/);
});

test('멈춘 명령은 타임아웃에 죽고, 그 자리가 재시도로 이어진다', async () => {
  // A command that wants to sleep 60 s per attempt. Without the timeout this test takes
  // over 60 s and fails on its own — proving "it was killed" by wall clock too.
  const fake = fakeCommand({ name: 'hang', hangMs: 60_000 });
  const started = Date.now();
  const result = await run(['--attempts=2', '--timeout-ms=700', '--backoff-ms=1', '--', ...fake.argv]);
  const elapsed = Date.now() - started;

  assert.equal(result.code, 1);
  assert.equal(fake.attempts(), 2, '타임아웃 뒤에 재시도가 안 일어났다');
  assert.match(result.stdout, /700ms 안에 안 끝남/);
  assert.ok(elapsed < 20_000, `타임아웃이 안 먹었다 — ${elapsed}ms 걸렸다`);
});

test('없는 명령은 spawn 단계에서 실패로 잡힌다', async () => {
  const result = await run([
    '--attempts=2',
    '--backoff-ms=1',
    '--',
    'oatlas-command-that-does-not-exist',
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /spawn-error/);
});

test('parseArgs — `--` 가 없거나 뒤가 비면 거절한다', () => {
  assert.throws(() => parseArgs(['--attempts=2']), /`--` 뒤에 실행할 명령/);
  assert.throws(() => parseArgs(['--attempts=2', '--']), /`--` 뒤가 비었다/);
});

test('parseArgs — 옵션을 읽고, 이상한 값은 거절한다', () => {
  const { options, command } = parseArgs([
    '--attempts=5',
    '--timeout-ms=1000',
    '--best-effort',
    '--label=apt',
    '--',
    'echo',
    'hi',
  ]);

  assert.equal(options.attempts, 5);
  assert.equal(options.timeoutMs, 1000);
  assert.equal(options.bestEffort, true);
  assert.equal(options.label, 'apt');
  assert.deepEqual(command, ['echo', 'hi']);

  assert.throws(() => parseArgs(['--attempts=0', '--', 'echo']), /양수여야 한다/);
  assert.throws(() => parseArgs(['--attempts=nope', '--', 'echo']), /양수여야 한다/);
  assert.throws(() => parseArgs(['--unknown', '--', 'echo']), /모르는 옵션/);
});

test('label 을 안 주면 명령 자체가 라벨이 된다', () => {
  const { options } = parseArgs(['--', 'pnpm', 'exec', 'playwright', 'install-deps']);
  assert.equal(options.label, 'pnpm exec playwright install-deps');
});
