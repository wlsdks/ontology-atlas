import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const supervisor = pathToFileURL(join(import.meta.dirname, 'conductor-supervisor.mjs')).href;
const refFile = (dir, ref) => join(dir, ref.replaceAll('/', '_'));
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/*
 * A real supervisor process and a real conductor-like child blocked in `Atomics.wait` with the
 * conductor's own signal handlers, which never run. The locks live in files instead of GitHub refs.
 */
test('SIGTERM mid-wait releases only the child\'s lock within two seconds, exits 130 and leaves no child', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'pr-land-supervisor-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const lockFile = refFile(dir, 'refs/atlas/landing-lock');
  const fastFile = refFile(dir, 'refs/atlas/landing-fast');
  const otherToken = `${hostname()}-1-${Date.now()}`;
  writeFileSync(fastFile, JSON.stringify({ token: otherToken }));

  const child = join(dir, 'conductor.mjs');
  writeFileSync(child, `
    import { writeFileSync } from 'node:fs';
    import { hostname } from 'node:os';
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => process.exit(130));
    writeFileSync(${JSON.stringify(lockFile)}, JSON.stringify({ token: hostname() + '-' + process.pid + '-' + Date.now() }));
    for (;;) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
  `);
  const harness = `
    import { existsSync, readFileSync, rmSync } from 'node:fs';
    import { superviseConductor } from ${JSON.stringify(supervisor)};
    const file = (ref) => ${JSON.stringify(dir)} + '/' + ref.replaceAll('/', '_');
    const store = {
      read: async (ref) => (existsSync(file(ref)) ? JSON.parse(readFileSync(file(ref), 'utf8')) : null),
      release: async (ref) => rmSync(file(ref)),
    };
    superviseConductor({ script: ${JSON.stringify(child)}, argv: [], store, log: () => {} }).then((code) => process.exit(code));
  `;
  const parent = spawn(process.execPath, ['--input-type=module', '-e', harness], { stdio: 'ignore' });
  const exited = new Promise((done) => parent.once('exit', (code) => done(code)));

  const deadline = Date.now() + 10_000;
  while (!existsSync(lockFile) && Date.now() < deadline) await new Promise((done) => setTimeout(done, 50));
  assert.ok(existsSync(lockFile), 'the child never took the lock');
  const childPid = Number(JSON.parse(readFileSync(lockFile, 'utf8')).token.split('-').at(-2));
  assert.ok(alive(childPid));

  const sent = Date.now();
  parent.kill('SIGTERM');
  const code = await exited;
  const took = Date.now() - sent;

  assert.equal(code, 130);
  assert.ok(took < 2_000, `released and exited in ${took} ms`);
  assert.ok(!existsSync(lockFile), 'the child\'s lock was released');
  assert.ok(existsSync(fastFile), 'a lock another process holds stays');
  assert.equal(JSON.parse(readFileSync(fastFile, 'utf8')).token, otherToken);
  assert.ok(!alive(childPid), 'no orphaned conductor');
});
