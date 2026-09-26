/**
 * Who serves the port Playwright is about to reuse.
 *
 * `reuseExistingServer` accepts any process listening on the port. Locally that
 * has been a dev server from another worktree (2026-09-19) and, on 2026-09-26,
 * an unrelated project's server that had held :3100 for four days, so a spec
 * measured someone else's code and reported it as ours (lesson 823b9af4). The
 * config asks this module first and refuses a server whose working directory is
 * outside this checkout, naming it and the fix.
 */

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { sep } from 'node:path';

function run(bin, args) {
  try {
    return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const real = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

/**
 * The working directory of the process listening on `host:port`, or null when
 * nothing listens or it cannot be read. The host matters: a server on `[::1]`
 * does not answer `127.0.0.1`, and Playwright then starts its own.
 */
export function listenerDirectory(host, port, exec = run) {
  const address = host === 'localhost' ? `:${port}` : `@${host}:${port}`;
  const pid = exec('lsof', ['-nP', `-iTCP${address}`, '-sTCP:LISTEN', '-t']).split('\n')[0];
  if (!pid) return null;
  const cwd = exec('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'])
    .split('\n')
    .find((line) => line.startsWith('n'));
  return cwd ? cwd.slice(1) : null;
}

/** A refusal message when the server Playwright would reuse belongs to another directory, else null. */
export function foreignServer(host, port, checkout, exec = run) {
  const owner = listenerDirectory(host, port, exec);
  if (!owner) return null;
  const root = real(checkout);
  const dir = real(owner);
  if (dir === root || dir.startsWith(root + sep)) return null;
  return `${host}:${port} is served from ${owner}, not this checkout (${checkout}); Playwright would test that server. `
    + `Stop it or run with PLAYWRIGHT_BASE_URL=http://127.0.0.1:<free port>.`;
}
