#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function prepareWorktree({ root = process.cwd(), spawn = spawnSync, stderr = process.stderr } = {}) {
  const git = spawn('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
  if (git.status === 0) {
    const configured = spawn('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'inherit' });
    if (configured.status !== 0) return configured.status ?? 1;
  } else if (git.error?.code !== 'ENOENT' && git.status !== 128) {
    stderr.write(git.stderr ?? git.error?.message ?? '[prepare] git discovery failed\n');
    return git.status ?? 1;
  }

  const built = spawn(process.execPath, ['scripts/build-docs-vault.mjs'], { cwd: root, stdio: 'inherit' });
  if (built.error) stderr.write(`[prepare] ${built.error.message}\n`);
  return built.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = prepareWorktree();
}
