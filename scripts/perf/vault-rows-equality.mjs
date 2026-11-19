#!/usr/bin/env node
// Runs `a_manifest_from_rows_equals_a_manifest_from_files` against the debug `vault-rows-bridge`
// that `cargo test` builds, so the lane that tests the native bridge (macOS locally, Windows in
// CI) also proves a manifest from cached rows is byte-equal to one from the files. Fails when the
// test was skipped or matched nothing, not only when it failed.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const EXE = process.platform === 'win32' ? '.exe' : '';
const BRIDGE = join(ROOT, 'src-tauri', 'target', 'debug', `vault-rows-bridge${EXE}`);
const TEST = 'src/entities/docs-vault/lib/local-manifest/build-local-manifest.rows.perf.test.ts';
const NAME = 'a_manifest_from_rows_equals_a_manifest_from_files';

if (!existsSync(BRIDGE)) {
  execFileSync('cargo', ['build', '--quiet', '-p', 'vault-index', '--bin', 'vault-rows-bridge', '--manifest-path', join(ROOT, 'src-tauri', 'Cargo.toml')], { stdio: 'inherit' });
}
const work = mkdtempSync(join(tmpdir(), 'vault-rows-equality-'));
const report = join(work, 'report.json');
try {
  const run = spawnSync('pnpm', ['exec', 'vitest', 'run', '--project=perf', TEST, '-t', NAME, '--reporter=default', '--reporter=json', `--outputFile.json=${report}`], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, VAULT_ROWS_BRIDGE: BRIDGE },
  });
  const results = existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : null;
  const passed = results?.testResults?.flatMap((file) => file.assertionResults ?? []).filter((test) => test.title === NAME && test.status === 'passed').length ?? 0;
  if (run.status !== 0 || passed !== 1) {
    console.error(`${NAME}: expected one passing run, got ${passed} (vitest exit ${run.status})`);
    process.exit(1);
  }
  console.log(`${NAME} ran and passed against ${BRIDGE}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
