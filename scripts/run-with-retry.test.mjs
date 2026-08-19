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
 * 시도할 때마다 카운터 파일에 한 줄씩 적고, 지정한 시도 번호부터 성공하는
 * 가짜 명령. 「몇 번 돌았나」를 밖에서 셀 수 있어야 재시도를 증명할 수 있다.
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
  // 끝나지 않는 명령. 타임아웃이 실제로 죽이는지 보려고 일부러 오래 잔다.
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
  // 경고가 없으면 「성공」과 구별되지 않는다 — 그게 이 저장소가 게이트에 대해
  // 반복해서 겪은 실패 모양이다.
  assert.match(result.stdout, /::warning title=/);
});

test('멈춘 명령은 타임아웃에 죽고, 그 자리가 재시도로 이어진다', async () => {
  // 시도마다 60초씩 자려는 명령. 타임아웃이 안 걸리면 이 테스트가 60초 넘게 걸려
  // 그 자체로 실패한다 — 「죽였다」를 시간으로도 증명한다.
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
