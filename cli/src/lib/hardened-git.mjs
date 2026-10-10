// Git hardening for every runtime `git` the CLI spawns. A vault's repo or a
// connected project source may be attacker-authored, so each invocation carries
// config that neutralises code execution driven by the repository's own git config
// before git honours it. Mirrors src-tauri/src/git/runner.rs and mcp/src/hardened-git.mjs.
//
// The CLI spawns git with the cwd option (no `-C`), so these return the `-c` prefix
// and guarded args only; the caller passes cwd to execFileSync/spawnSync.

import { spawnSync } from 'node:child_process';

// safe.bareRepository=explicit refuses a bare/embedded repo committed as tracked
// files (which also delivers a repo's config); core.fsmonitor=false blocks the
// fsmonitor hook.
const BASE_HARDENING = ['-c', 'safe.bareRepository=explicit', '-c', 'core.fsmonitor=false'];
// Repository hooks run a repo-controlled command; disabled for every verb except
// the snapshot commit, which classifies a rejecting pre-commit hook.
const HOOKS_HARDENING = ['-c', 'core.hooksPath=/dev/null'];
const NETWORK_HARDENING = ['-c', 'protocol.ext.allow=never'];
const DIFF_FAMILY = new Set(['diff', 'log', 'show']);
const NETWORK_SUBCOMMANDS = new Set(['fetch', 'pull', 'push', 'clone', 'ls-remote']);

function subcommandOf(args) {
  let skipValue = false;
  for (const arg of args) {
    if (skipValue) {
      skipValue = false;
      continue;
    }
    if (arg === '-c') {
      skipValue = true;
      continue;
    }
    if (typeof arg === 'string' && arg.startsWith('-')) continue;
    return arg;
  }
  return null;
}

const filterCache = new Map();

function collectFilterKeys(cwd, scopeArgs, filters) {
  const result = spawnSync(
    'git',
    [...BASE_HARDENING, 'config', ...scopeArgs, '--includes', '--name-only', '--get-regexp', '^filter\\.'],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (result.status !== 0 || typeof result.stdout !== 'string') return;
  for (const line of result.stdout.split('\n')) {
    const key = line.trim();
    if (!key.startsWith('filter.')) continue;
    const rest = key.slice('filter.'.length);
    const dot = rest.lastIndexOf('.');
    if (dot <= 0) continue;
    const name = rest.slice(0, dot);
    if (!name) continue;
    const isProcess = rest.slice(dot + 1) === 'process';
    const existing = filters.find((entry) => entry.name === name);
    if (existing) existing.hasProcess = existing.hasProcess || isProcess;
    else filters.push({ name, hasProcess: isProcess });
  }
}

function worktreeConfigEnabled(cwd) {
  const result = spawnSync(
    'git',
    [...BASE_HARDENING, 'config', '--local', '--includes', '--get', 'extensions.worktreeConfig'],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return result.status === 0 && typeof result.stdout === 'string' && result.stdout.trim() === 'true';
}

function discoverFilterOverrides(cwd) {
  // --local --includes also sees a filter body pulled in with include.path/includeIf;
  // the worktree scope sees .git/config.worktree when the repo enables it. --local is
  // never dropped, so the user's own global LFS/git-crypt filters keep working.
  const filters = [];
  collectFilterKeys(cwd, ['--local'], filters);
  if (worktreeConfigEnabled(cwd)) collectFilterKeys(cwd, ['--worktree'], filters);
  const overrides = [];
  for (const { name, hasProcess } of filters) {
    // Identity clean/smudge satisfy even a required filter (git-crypt).
    overrides.push('-c', `filter.${name}.clean=cat`, '-c', `filter.${name}.smudge=cat`);
    // Empty the process filter only when defined; an empty process= on a clean-only
    // filter breaks a required one.
    if (hasProcess) overrides.push('-c', `filter.${name}.process=`);
  }
  return overrides;
}

function filterOverridesFor(cwd) {
  const key = cwd ?? process.cwd();
  if (filterCache.has(key)) return filterCache.get(key);
  const overrides = discoverFilterOverrides(key);
  filterCache.set(key, overrides);
  return overrides;
}

function withDiffFamilyGuard(args) {
  const out = [];
  let guarded = false;
  let skipValue = false;
  for (const arg of args) {
    out.push(arg);
    if (guarded) continue;
    if (skipValue) {
      skipValue = false;
      continue;
    }
    if (arg === '-c') {
      skipValue = true;
      continue;
    }
    if (typeof arg === 'string' && arg.startsWith('-')) continue;
    if (DIFF_FAMILY.has(arg)) out.push('--no-ext-diff', '--no-textconv');
    guarded = true;
  }
  return out;
}

/**
 * Hardened argv for a `git` run whose cwd is passed to the spawner. `args` is the
 * subcommand and its arguments.
 */
export function hardenedGitArgs(cwd, args, { network = false } = {}) {
  const subcommand = subcommandOf(args);
  const isNetwork = network || NETWORK_SUBCOMMANDS.has(subcommand);
  return [
    ...BASE_HARDENING,
    // The snapshot commit keeps hooks so a rejecting pre-commit hook is classified;
    // every other verb runs with hooks off.
    ...(subcommand === 'commit' ? [] : HOOKS_HARDENING),
    ...(isNetwork ? NETWORK_HARDENING : []),
    ...filterOverridesFor(cwd),
    ...withDiffFamilyGuard(args),
  ];
}

export function clearFilterCache() {
  filterCache.clear();
}
