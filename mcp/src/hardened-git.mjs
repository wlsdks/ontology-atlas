// Git hardening for every runtime `git` the MCP server spawns. An opened
// vault or connected project source may be attacker-authored, so each invocation
// carries config that neutralises code execution driven by the repository's own
// git config before git honours it. The Rust desktop (`src-tauri/src/git/runner.rs`) and
// the CLI (`cli/src/lib/hardened-git.mjs`) mirror these rules.

import { spawnSync } from 'node:child_process';

// safe.bareRepository=explicit refuses a bare/embedded repo committed as tracked
// files (which also delivers a repo's config); core.fsmonitor=false blocks the
// fsmonitor hook that fires on `status` with no click.
const BASE_HARDENING = ['-c', 'safe.bareRepository=explicit', '-c', 'core.fsmonitor=false'];

// Repository hooks run a repo-controlled command (post-index-change on status,
// post-checkout on restore, post-merge on pull), so they are disabled for every
// verb except the snapshot commit, which must run the user's pre-commit hook.
const HOOKS_HARDENING = ['-c', 'core.hooksPath=/dev/null'];

// ext:: transports run an arbitrary command; a hostile remote URL must not reach one.
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

// Adds every filter.<name> key from one config scope to `filters`, tracking whether
// that name defines a process filter.
function collectFilterKeys(cwd, scopeArgs, filters) {
  const result = spawnSync(
    'git',
    [...BASE_HARDENING, '-C', cwd, 'config', ...scopeArgs, '--includes', '--name-only', '--get-regexp', '^filter\\.'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
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
    [...BASE_HARDENING, '-C', cwd, 'config', '--local', '--includes', '--get', 'extensions.worktreeConfig'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return result.status === 0 && typeof result.stdout === 'string' && result.stdout.trim() === 'true';
}

function discoverFilterOverrides(cwd) {
  // Every config scope the hostile repo controls: --local --includes also sees a
  // filter body pulled in with include.path/includeIf, and the worktree scope sees
  // .git/config.worktree when the repo enables it. --local is never dropped, so the
  // user's own global LFS or git-crypt filters keep working.
  const filters = [];
  collectFilterKeys(cwd, ['--local'], filters);
  if (worktreeConfigEnabled(cwd)) collectFilterKeys(cwd, ['--worktree'], filters);
  const overrides = [];
  for (const { name, hasProcess } of filters) {
    // Identity clean/smudge satisfy even a required filter (git-crypt).
    overrides.push('-c', `filter.${name}.clean=cat`, '-c', `filter.${name}.smudge=cat`);
    // Empty the process filter only when one is defined, so git falls back to the
    // identity clean/smudge; an empty process= on a clean-only filter breaks a
    // required one.
    if (hasProcess) overrides.push('-c', `filter.${name}.process=`);
  }
  return overrides;
}

// A repo's config may bind an attribute to a filter whose command git runs on
// add/commit/checkout; the base flags cannot express a wildcard, so every filter
// the repo defines is redirected to an identity passthrough. Cached per working
// directory since a session's repo config is stable.
function filterOverridesFor(cwd) {
  if (filterCache.has(cwd)) return filterCache.get(cwd);
  const overrides = discoverFilterOverrides(cwd);
  filterCache.set(cwd, overrides);
  return overrides;
}

// diff/log/show honour diff.external and per-driver textconv, both config-supplied
// commands; disable them right after the subcommand.
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
 * Full argv for a hardened `git` run against `cwd`. `args` is the subcommand and
 * its arguments, without a leading `-C`.
 */
export function hardenedGitArgv(cwd, args, { network = false } = {}) {
  const subcommand = subcommandOf(args);
  const isNetwork = network || NETWORK_SUBCOMMANDS.has(subcommand);
  return [
    ...BASE_HARDENING,
    // Every verb but the snapshot commit runs with hooks off.
    ...(subcommand === 'commit' ? [] : HOOKS_HARDENING),
    ...(isNetwork ? NETWORK_HARDENING : []),
    ...filterOverridesFor(cwd),
    '-C',
    cwd,
    ...withDiffFamilyGuard(args),
  ];
}

// Test hook: repository config is discovered once per directory; clearing lets a
// test rebuild a fixture under the same path.
export function clearFilterCache() {
  filterCache.clear();
}
