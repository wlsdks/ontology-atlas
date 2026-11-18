#!/usr/bin/env node
/**
 * `next build` with the type check done by the native TypeScript 7 compiler instead of Next's.
 *
 * `typescript` resolves to the TypeScript 6 compatibility package here, so Next checks types with
 * the JavaScript compiler: 49 s of a 66 s cold build, and no faster warm, because Next saves its
 * `.tsbuildinfo` before it computes diagnostics. `pnpm typecheck` checks the same `tsconfig.json`
 * program, route types included, with the native compiler in 3.6 s cold and 1.2 s warm. The build
 * still stops on a type error; it only stops sooner.
 *
 * `ATLAS_BUILD_SKIP_TYPECHECK=1` keeps its meaning: the Checks gate already ran `pnpm typecheck` on
 * this commit, so neither compiler runs (`next.config.ts`).
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
