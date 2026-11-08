#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STAMP = join('out', '.build-inputs');
const NOT_BUILT_FROM = [
  /^tests\//,
  /\.(test|spec|perf\.test)\.[cm]?[jt]sx?$/,
  /^\.(claude|agents|codex|github|githooks)\//,
];

export function isBuildInput(path) {
  return !NOT_BUILT_FROM.some((pattern) => pattern.test(path));
}

function git(args, { cwd, input } = {}) {
  const result = spawnSync('git', args, { cwd, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

export function buildInputsDigest({ cwd = process.cwd(), env = process.env } = {}) {
  const paths = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd })
    .split('\0')
    .filter((path) => path && isBuildInput(path) && existsSync(join(cwd, path)))
    .sort();
  const blobs = git(['hash-object', '--stdin-paths'], { cwd, input: paths.join('\n') }).trim().split('\n');
  const hash = createHash('sha256');
  hash.update(`node ${process.version}\n`);
  for (const [name, value] of Object.entries(env).filter(([name]) => name.startsWith('NEXT_PUBLIC_')).sort()) {
    hash.update(`env ${name}=${value}\n`);
  }
  paths.forEach((path, index) => hash.update(`${blobs[index]} ${path}\n`));
  return hash.digest('hex');
}

export function builtFrom(digest, { cwd = process.cwd() } = {}) {
  const stamp = join(cwd, STAMP);
  return existsSync(join(cwd, 'out', 'index.html')) && existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === digest;
}

export function runStaticBuild({
  cwd = process.cwd(), env = process.env, log = console.log,
  build = () => spawnSync('pnpm', ['build'], { cwd, env, stdio: 'inherit' }).status ?? 1,
} = {}) {
  const digest = buildInputsDigest({ cwd, env });
  if (builtFrom(digest, { cwd })) {
    log('[build:static] out/ is already built from these exact inputs; skipping the build.');
    return 0;
  }
  const stamp = join(cwd, STAMP);
  rmSync(stamp, { force: true });
  const status = build();
  if (status !== 0) return status;
  if (buildInputsDigest({ cwd, env }) !== digest) {
    log('[build:static] inputs changed during the build; output is not certified. Run again after edits settle.');
    return 1;
  }
  writeFileSync(stamp, `${digest}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(runStaticBuild());
