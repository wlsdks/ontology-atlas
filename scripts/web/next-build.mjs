#!/usr/bin/env node
/**
 * `next build` with the type check run by native tsc 7 first; Next's own check (the TS 6 JS
 * compiler, most of a cold build) is skipped. `ATLAS_BUILD_SKIP_TYPECHECK=1` skips both, for a
 * commit the Checks gate already type-checked (`next.config.ts`).
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SKIP = 'ATLAS_BUILD_SKIP_TYPECHECK';

/** The steps in order; each is `[label, argv for node, extra env]`. */
export function buildSteps({ env = process.env, nextBin, tscEntry }) {
  const build = ['next build', [nextBin, 'build'], { [SKIP]: '1' }];
  if (env[SKIP] === '1') return [build];
  return [
    ['next typegen', [nextBin, 'typegen'], {}],
    ['tsc --noEmit', [tscEntry, '--noEmit'], {}],
    build,
  ];
}

/** Runs the steps and returns the first non-zero status, or 0. */
export function runSteps(steps, { env = process.env, run = defaultRun } = {}) {
  for (const [label, argv, extraEnv] of steps) {
    const status = run(argv, { ...env, ...extraEnv });
    if (status !== 0) {
      process.stderr.write(`[build] ${label} failed (exit ${status})\n`);
      return status;
    }
  }
  return 0;
}

function defaultRun(argv, env) {
  const result = spawnSync(process.execPath, argv, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function resolveBins(cwd) {
  const require = createRequire(join(cwd, 'package.json'));
  return {
    nextBin: require.resolve('next/dist/bin/next'),
    // The package's extensionless ESM bin only imports this entry (see Next's runTypeScriptCli.js).
    tscEntry: join(dirname(require.resolve('@typescript/native/package.json')), 'lib', 'tsc.js'),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runSteps(buildSteps(resolveBins(process.cwd())));
}
