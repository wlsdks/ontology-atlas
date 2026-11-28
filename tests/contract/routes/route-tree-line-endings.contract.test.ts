import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { ROUTE_TREE } from '../../../scripts/web/build-app-and-site.mjs';

/**
 * `pnpm build:app` ends by reading `src/app/route-tree.gen.ts` back and failing if the router plugin
 * changed it. The plugin compares the file on disk with the LF text it generates and rewrites it when
 * they differ, so a CRLF checkout (Git for Windows ships `core.autocrlf=true`, which the Windows
 * runner uses) makes every build look like a stale commit. `.gitattributes` pins the file to LF:
 * with the `text` attribute unspecified Git converts by `core.autocrlf`, and `eol=lf` "uses the same
 * line endings in the working directory as in the index" (gitattributes(5), "eol").
 *
 * This replays that checkout in a scratch repository on any platform, with the repository's own
 * `.gitattributes`: commit LF files, delete them, check them out again under `core.autocrlf=true`.
 */

const ROOT = process.cwd();
const CONTROL = 'src/app/unpinned-control.ts';
const LF = 'export const routeTree = 1;\nexport const second = 2;\n';
const CRLF = LF.replace(/\n/g, '\r\n');

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-route-tree-eol-')));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const git = (...args: string[]) =>
  execFileSync('git', args, {
    cwd: scratch,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    // The caller's own Git configuration must not decide what the checkout does.
    env: { ...process.env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1' },
  });

/** Each path as a fresh checkout under `core.autocrlf=true` writes it, after being committed with LF. */
function windowsStyleCheckout(paths: readonly string[]): Record<string, string> {
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'atlas test');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'true');
  writeFileSync(join(scratch, '.gitattributes'), readFileSync(join(ROOT, '.gitattributes'), 'utf8').replace(/\r\n/g, '\n'));
  for (const path of paths) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), LF);
  }
  git('add', '--', '.gitattributes', ...paths);
  git('commit', '-qm', 'lf files');
  for (const path of paths) rmSync(join(scratch, path));
  git('checkout', '--', ...paths);
  return Object.fromEntries(paths.map((path) => [path, readFileSync(join(scratch, path), 'utf8')]));
}

describe('the committed route tree is checked out byte for byte on Windows and macOS', () => {
  const checkedOut = windowsStyleCheckout([ROUTE_TREE, CONTROL]);

  it('replays a checkout that converts: an unpinned file arrives with CRLF', () => {
    expect(checkedOut[CONTROL]).toBe(CRLF);
  });

  it('keeps the route tree LF there, so the router plugin finds nothing to rewrite', () => {
    expect(checkedOut[ROUTE_TREE]).toBe(LF);
  });
});
