/**
 * `pnpm pr:land` runs its synchronous conductor in a child process and stays on the event loop
 * itself. Node runs a signal handler only when its event loop turns, which the conductor's blocking
 * waits never let happen, so this parent is the one that hears SIGTERM, SIGINT and SIGHUP: it kills
 * the child, releases the locks the child's token holds, and exits 130.
 */

import { execFile, spawn } from 'node:child_process';
import { hostname } from 'node:os';
import { promisify } from 'node:util';

import { FAST_LOCK_REF, LOCK_REF, parseLockToken } from './landing-lock.mjs';

const SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP'];

/** How long the parent waits for the killed child to be reaped before releasing anyway. */
const CHILD_EXIT_WAIT_MS = 500;

/** The locks over `gh`, asynchronous so the parent's event loop keeps turning. */
function githubLockStore() {
  const gh = promisify(execFile);
  const api = async (args) => (await gh('gh', ['api', ...args], { maxBuffer: 16 * 1024 * 1024 })).stdout;
  // Asked at start, so a signal waits only for the lock reads; a failure surfaces at release time.
  const slug = api(['repos/{owner}/{repo}', '--jq', '.full_name']).then((out) => out.trim());
  slug.catch(() => {});
  return {
    read: async (ref) => {
      const repo = await slug;
      const sha = (await api([`repos/${repo}/git/ref/${ref.replace('refs/', '')}`, '--jq', '.object.sha'])).trim();
      const blob = JSON.parse(await api([`repos/${repo}/git/blobs/${sha}`]));
      return JSON.parse(Buffer.from(blob.content, blob.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8'));
    },
    release: async (ref) => {
      await api(['-X', 'DELETE', `repos/${await slug}/git/${ref}`]);
    },
  };
}

/**
 * Release every lock whose token names this host and `pid`, the identity the dead-pid takeover
 * reads; a lock anybody else holds is left alone. Returns the refs released.
 */
async function releaseHeldBy({ pid, host = hostname(), store, refs = [LOCK_REF, FAST_LOCK_REF] }) {
  const released = await Promise.all(refs.map(async (ref) => {
    try {
      const holder = parseLockToken((await store.read(ref))?.token);
      if (holder?.host !== host || holder.pid !== pid) return null;
      await store.release(ref);
      return ref;
    } catch {
      return null;
    }
  }));
  return released.filter(Boolean);
}

/**
 * Run `script` as the conductor child with inherited stdio. Resolves with the child's exit code, or
 * 130 after a signal, once the child is killed and its locks are released.
 */
export function superviseConductor({ script, argv, cwd = process.cwd(), env = process.env, store = githubLockStore(), host = hostname(), log = console.error, signals = process }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...argv], { cwd, env, stdio: 'inherit' });
    let stopping = false;
    const exited = new Promise((done) => child.once('exit', (code, signal) => done({ code, signal })));
    const handlers = SIGNALS.map((name) => [name, () => stop(name)]);
    const detach = () => {
      for (const [name, handler] of handlers) signals.off(name, handler);
    };
    const stop = async (name) => {
      if (stopping) return;
      stopping = true;
      child.kill('SIGKILL');
      await Promise.race([exited, new Promise((done) => setTimeout(done, CHILD_EXIT_WAIT_MS))]);
      const released = await releaseHeldBy({ pid: child.pid, host, store });
      log(`[pr-land] ${name}: stopped the conductor (pid ${child.pid})${released.length > 0 ? ` and released ${released.join(', ')}` : '; it held no lock'}`);
      detach();
      resolve(130);
    };
    for (const [name, handler] of handlers) signals.on(name, handler);
    exited.then(({ code, signal }) => {
      if (stopping) return;
      detach();
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}
