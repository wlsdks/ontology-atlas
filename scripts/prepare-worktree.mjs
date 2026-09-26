#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Ignored outputs every worktree materializes from its authored inputs, in this order. */
export const MATERIALIZERS = Object.freeze(['scripts/build-docs-vault.mjs', 'scripts/build-messages.mjs']);

/**
 * `mcp/` is a separate package with its own lockfile, so a root install left it empty in every
 * fresh worktree and each parallel agent lost a run to missing MCP modules. CI installs it in its
 * own step. A failure here is reported, not fatal: it must not break the root install.
 */
export function installMcp({ root, spawn, stderr, env = process.env, exists = existsSync }) {
  if (env.CI || !exists(join(root, 'mcp', 'package.json'))) return;
  const installed = spawn('pnpm', ['--dir', 'mcp', 'install', '--frozen-lockfile', '--prefer-offline'], { cwd: root, stdio: 'inherit' });
  if (installed.status !== 0) stderr.write('[prepare] mcp install failed; run `pnpm --dir mcp install --frozen-lockfile`\n');
}

export function prepareWorktree({ root = process.cwd(), spawn = spawnSync, stderr = process.stderr, env = process.env, exists = existsSync } = {}) {
  const git = spawn('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
  if (git.status === 0) {
    const configured = spawn('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'inherit' });
    if (configured.status !== 0) return configured.status ?? 1;
  } else if (git.error?.code !== 'ENOENT' && git.status !== 128) {
    stderr.write(git.stderr ?? git.error?.message ?? '[prepare] git discovery failed\n');
    return git.status ?? 1;
  }

  installMcp({ root, spawn, stderr, env, exists });
  for (const script of MATERIALIZERS) {
    const built = spawn(process.execPath, [script], { cwd: root, stdio: 'inherit' });
    if (built.error) stderr.write(`[prepare] ${built.error.message}\n`);
    if (built.status !== 0) return built.status ?? 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = prepareWorktree();
}
