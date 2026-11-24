// Git hardening for every runtime `git` the MCP server spawns. An opened
// vault or connected project source may be attacker-authored, so each invocation
// carries config that neutralises code execution driven by the repository's own
// git config before git honours it. The Rust desktop (`src-tauri/src/git/runner.rs`) mirrors
// these rules.

import { spawnSync } from 'node:child_process';

// safe.bareRepository=explicit refuses a bare/embedded repo committed as tracked
// files (which also delivers a repo's config); core.fsmonitor=false blocks the
// fsmonitor hook that fires on `status` with no click.
const BASE_HARDENING = ['-c', 'safe.bareRepository=explicit', '-c', 'core.fsmonitor=false'];

// Every path handed to git is a name a vault, repository or page chose, never
// pathspec magic or a glob. Git refuses this beside an inherited glob, noglob or
// icase setting, so spawn with gitEnv().
const LITERAL_PATHSPECS = ['--literal-pathspecs'];
const CONFLICTING_PATHSPEC_ENV = ['GIT_GLOB_PATHSPECS', 'GIT_NOGLOB_PATHSPECS', 'GIT_ICASE_PATHSPECS'];

// Repository hooks run a repo-controlled command (post-index-change on status,
// post-checkout on restore, post-merge on pull), so they are disabled for every
// verb except the snapshot commit, which must run the user's pre-commit hook.
const HOOKS_HARDENING = ['-c', 'core.hooksPath=/dev/null'];

// ext:: transports run an arbitrary command; a hostile remote URL must not reach one.
const NETWORK_HARDENING = ['-c', 'protocol.ext.allow=never'];

// A local read must never fetch: in a partial clone a missing object is fetched
// through a transport the repository's config names (`uploadpack`, `core.sshCommand`).
// The protocol list also covers Git before 2.45. Mirrors `read_policy_command` in
// src-tauri/src/git/runner.rs.
const LOCAL_READ_ENV = { GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '' };

// A config pre-read past this is refused: an included named pipe never answers.
const CONFIG_READ_TIMEOUT_MS = 5000;

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

/** One config pre-read; throws when it does not finish, so no git runs without its filter guard. */
function readConfig(cwd, args) {
  const result = spawnSync('git', [...BASE_HARDENING, ...LITERAL_PATHSPECS, '-C', cwd, 'config', ...args], {
    encoding: 'utf8',
    env: gitEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: CONFIG_READ_TIMEOUT_MS,
  });
  if (result.error?.code === 'ETIMEDOUT' || result.signal) throw new Error('git config read did not finish');
  return result;
}

// Adds every filter.<name> key from one config scope to `filters`, tracking whether
// that name defines a process filter.
function collectFilterKeys(cwd, scopeArgs, filters) {
  const result = readConfig(cwd, [...scopeArgs, '--includes', '--name-only', '--get-regexp', '^filter\\.']);
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
  const result = readConfig(cwd, ['--local', '--includes', '--get', 'extensions.worktreeConfig']);
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
 * its arguments, without a leading `-C`. Throws when the repository's config
 * cannot be read in time.
 */
export function hardenedGitArgv(cwd, args, { network = false } = {}) {
  const subcommand = subcommandOf(args);
  const isNetwork = network || NETWORK_SUBCOMMANDS.has(subcommand);
  return [
    ...BASE_HARDENING,
    ...LITERAL_PATHSPECS,
    // Every verb but the snapshot commit runs with hooks off.
    ...(subcommand === 'commit' ? [] : HOOKS_HARDENING),
    ...(isNetwork ? NETWORK_HARDENING : []),
    ...filterOverridesFor(cwd),
    '-C',
    cwd,
    ...withDiffFamilyGuard(args),
  ];
}

/**
 * The environment to spawn git with: `env` without settings that conflict with
 * literal paths, and with no fetch, since the MCP server runs no network verb.
 */
export function gitEnv(env = process.env) {
  const out = { ...env };
  for (const name of CONFLICTING_PATHSPEC_ENV) delete out[name];
  return { ...out, ...LOCAL_READ_ENV };
}

// Test hook: repository config is discovered once per directory; clearing lets a
// test rebuild a fixture under the same path.
export function clearFilterCache() {
  filterCache.clear();
}
