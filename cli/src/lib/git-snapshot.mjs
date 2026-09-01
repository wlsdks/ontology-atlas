// Pure git/frontmatter logic behind `ontology-atlas snapshot`; the command file
// (`cli/src/commands/snapshot.mjs`) is a thin CLI wrapper over this module.
//
// Trust charter: the default is a local commit only (nothing transmitted). Every
// git call takes an injectable `run`, so unit tests need no git process — the
// same pattern as `git-staged.mjs`. The vault's own tests use a real temporary
// git repository fixture, because only that proves the partial-commit pathspec
// behaviour (other staged files stay protected).
//
// Safety design — "never add a file outside the vault, never pollute what is
// already staged": `git commit -m <msg> -- <pathspec>` (git's "partial commit"
// form) commits working-tree changes and deletions of already-tracked files
// within the pathspec without touching the rest of the index, so changes staged
// outside the vault stay staged and do not join this commit. Untracked new files
// — the ones git does not know yet — are not picked up by a pathspec commit, so
// untracked files inside the vault are `git add`ed first (files outside it are
// never touched).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { parseFrontmatter } from './parse-frontmatter.mjs';

// Pipe every stdio stream explicitly, so git's own stderr on an expected failure
// path (`rev-parse` outside a repository, `@{u}` on a branch with no upstream)
// does not print over our error message and clutter the user's terminal.
function defaultRun(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Top level of the git repository containing the vault; null outside a repository. */
export function findGitRepoRoot(vaultRoot, { run = defaultRun } = {}) {
  try {
    const out = run(['rev-parse', '--show-toplevel'], vaultRoot);
    if (typeof out !== 'string') return null;
    const trimmed = out.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

/** The vault's pathspec relative to repoRoot; '.' when the vault is the repository root. */
export function vaultPathspec(repoRoot, vaultRoot) {
  const rel = relative(repoRoot, vaultRoot).replace(/\\/g, '/');
  return rel === '' ? '.' : rel;
}

/**
 * Parsed rows of `git status --porcelain -- <pathspec>`.
 * `null` when the git call fails (not a repository, or any other error) — the
 * caller decides what that means.
 *
 * @returns {{ index: string, worktree: string, path: string, renamedFrom: string|null }[] | null}
 */
export function getPorcelainStatus({ repoRoot, pathspec, run = defaultRun }) {
  let out;
  try {
    out = run(['status', '--porcelain', '-z', '--untracked-files=all', '--', pathspec], repoRoot);
  } catch {
    return null;
  }
  if (typeof out !== 'string') return null;
  return parsePorcelain(out);
}

/** Whole-repository `git status --porcelain`, for the staged-outside-vault gate. */
export function getFullPorcelainStatus({ repoRoot, run = defaultRun }) {
  let out;
  try {
    out = run(['status', '--porcelain', '-z', '--untracked-files=all'], repoRoot);
  } catch {
    return null;
  }
  if (typeof out !== 'string') return null;
  return parsePorcelain(out);
}

/*
 * `-z` (NUL-separated) output is parsed, never the newline form. With git's
 * default `core.quotePath`, the newline form C-quotes any non-ASCII path —
 * an untracked Korean-named file printed as `?? "\355\225\234..."` — and the
 * old parser kept the quotes and octal escapes literally, so `git add` on that
 * "path" exited 128 and the whole snapshot aborted, misclassified as a hook
 * rejection (bug sweep 2026-09-01, reproduced). `-z` emits raw bytes with no
 * quoting; a rename record is `XY new\0orig\0` (new path first, no ` -> `).
 */
function parsePorcelain(out) {
  const tokens = out.split('\0');
  const rows = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) continue;
    const index = token[0] ?? ' ';
    const worktree = token[1] ?? ' ';
    const path = token.slice(3);
    let renamedFrom = null;
    if (index === 'R' || index === 'C' || worktree === 'R' || worktree === 'C') {
      renamedFrom = tokens[i + 1] || null;
      i += 1;
    }
    rows.push({ index, worktree, path, renamedFrom });
  }
  return rows;
}

/** Classifies one porcelain row as 'added' | 'modified' | 'deleted' | 'renamed'. */
export function classifyChange(row) {
  if (row.index === 'D' || row.worktree === 'D') return 'deleted';
  if (row.index === 'R') return 'renamed';
  if ((row.index === '?' && row.worktree === '?') || row.index === 'A') return 'added';
  return 'modified';
}

/**
 * Enriches porcelain rows with meaning read from frontmatter.
 * Only `.md` files that were not deleted are read: a deleted file is not on disk,
 * and a non-markdown file has no frontmatter to begin with.
 */
export function buildChangeSummary(rows, { repoRoot, vaultRoot }) {
  return rows.map((row) => {
    const absPath = resolve(repoRoot, row.path);
    const status = classifyChange(row);
    let kind = null;
    let slug = relative(vaultRoot, absPath).replace(/\\/g, '/').replace(/\.md$/, '');
    if (row.path.endsWith('.md') && status !== 'deleted') {
      try {
        const raw = readFileSync(absPath, 'utf-8');
        const { frontmatter } = parseFrontmatter(raw);
        if (frontmatter && typeof frontmatter.kind === 'string' && frontmatter.kind) {
          kind = frontmatter.kind;
        }
        if (frontmatter && typeof frontmatter.slug === 'string' && frontmatter.slug) {
          slug = frontmatter.slug;
        }
      } catch {
        // Read failed — continue with the path-derived slug and no kind. This
        // never blocks the commit itself.
      }
    }
    // A rename keeps its previous path so the history reads as "renamed A → B".
    const renamedFrom = status === 'renamed' && row.renamedFrom ? row.renamedFrom : null;
    return { path: row.path, absPath, status, kind, slug, renamedFrom };
  });
}

/**
 * One-line commit summary in units of meaning — added/modified/removed counts
 * plus up to 3 representative slugs. Example:
 * `ontology snapshot: +2 concepts, ~3 updated (capabilities/foo, elements/bar, +1)`
 */
export function formatSnapshotSummary(changes) {
  const added = changes.filter((c) => c.status === 'added').length;
  const modified = changes.filter((c) => c.status === 'modified').length;
  const removed = changes.filter((c) => c.status === 'deleted').length;
  const renamed = changes.filter((c) => c.status === 'renamed').length;

  const parts = [];
  if (added > 0) parts.push(`+${added} concept${added === 1 ? '' : 's'}`);
  if (modified > 0) parts.push(`~${modified} updated`);
  if (renamed > 0) parts.push(`→${renamed} renamed`);
  if (removed > 0) parts.push(`-${removed} removed`);

  const headline = parts.length > 0 ? `ontology snapshot: ${parts.join(', ')}` : 'ontology snapshot: no concept changes';

  const slugs = changes.map((c) => c.slug);
  const shown = slugs.slice(0, 3);
  const overflow = slugs.length - shown.length;
  const slugText = shown.length > 0 ? ` (${shown.join(', ')}${overflow > 0 ? `, +${overflow}` : ''})` : '';

  return `${headline}${slugText}`;
}

/** Paths already staged outside the vault pathspec, for the protective warning. */
export function findStagedOutsideVault(fullStatusRows, pathspec) {
  return fullStatusRows
    .filter((row) => {
      const isStaged = row.index !== ' ' && row.index !== '?';
      if (!isStaged) return false;
      return !isUnderPathspec(row.path, pathspec);
    })
    .map((row) => row.path);
}

function isUnderPathspec(path, pathspec) {
  if (pathspec === '.') return true;
  return path === pathspec || path.startsWith(`${pathspec}/`);
}

/** Adds untracked files inside the vault only — files outside it are never touched. */
export function addPaths({ repoRoot, paths, run = defaultRun }) {
  if (!paths || paths.length === 0) return;
  run(['add', '--', ...paths], repoRoot);
}

/**
 * Pathspec-scoped partial commit — commits the vault's range without touching
 * changes already staged outside it (see the module header).
 */
export function commitPathspec({ repoRoot, pathspec, message, run = defaultRun }) {
  run(['commit', '-m', message, '--', pathspec], repoRoot);
}

export function getHeadHash({ repoRoot, run = defaultRun }) {
  return run(['rev-parse', 'HEAD'], repoRoot).trim();
}

export function getCurrentBranch({ repoRoot, run = defaultRun }) {
  return run(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot).trim();
}

/** The current branch's upstream ref (e.g. `origin/main`); null when there is none. */
export function getUpstreamRef({ repoRoot, run = defaultRun }) {
  try {
    const out = run(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], repoRoot);
    const trimmed = typeof out === 'string' ? out.trim() : '';
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

/** Pushes only a branch that already has an upstream — never sets `-u` automatically (trust charter). */
export function pushCurrentBranch({ repoRoot, run = defaultRun }) {
  run(['push'], repoRoot);
}

export function getRemoteUrl({ repoRoot, remoteName, run = defaultRun }) {
  return run(['remote', 'get-url', remoteName], repoRoot).trim();
}

// ── Graceful failure ──────────────────────────────────────────────────────
// commitPathspec / pushCurrentBranch / pullCurrentBranch propagate execFileSync's
// throw unchanged. The command wrapper hands that error to `classifyGitError`,
// which turns a raw stack-trace crash into "one line of cause + what to do next".
// Pure functions — no I/O here; the wrapper writes to stderr.

/** Joins an execFileSync error's stderr/stdout/message into one string. */
function gitErrorText(err) {
  if (!err) return '';
  const parts = [];
  for (const key of ['stderr', 'stdout']) {
    const v = err[key];
    if (typeof v === 'string') parts.push(v);
    else if (v && typeof v.toString === 'function') parts.push(v.toString('utf-8'));
  }
  if (typeof err.message === 'string') parts.push(err.message);
  return parts.join('\n');
}

/**
 * Classifies a git failure into one line a user understands plus a next action.
 * @param {Error} err the error execFileSync threw
 * @param {{ operation?: 'commit'|'push'|'pull'|'git' }} opts
 * @returns {{ reason: string, message: string, note: string|null, guidance: string|null }}
 */
export function classifyGitError(err, { operation = 'git' } = {}) {
  const raw = gitErrorText(err);
  const text = raw.toLowerCase();
  const firstLine = raw.split('\n').map((l) => l.trim()).filter(Boolean)[0] || null;

  // push: the remote is ahead (non-fast-forward). The commit is already local, so
  // this only advises.
  if (
    text.includes('non-fast-forward') ||
    text.includes('updates were rejected') ||
    (text.includes('[rejected]') && text.includes('fetch first'))
  ) {
    return {
      reason: 'push-non-fast-forward',
      message: 'the remote has moved ahead: run `git pull`, then snapshot again.',
      note: 'the commit is already recorded locally',
      guidance: 'git pull',
    };
  }

  // gpg signing failed
  if (
    text.includes('gpg failed to sign') ||
    text.includes('signing failed') ||
    (text.includes('gpg') && text.includes('sign'))
  ) {
    return {
      reason: 'gpg-sign-failed',
      message: 'commit signing (gpg) failed: check your signing key.',
      note: firstLine,
      guidance: 'git config commit.gpgsign false   # turn signing off, then snapshot again',
    };
  }

  // merge / rebase in progress — a pathspec partial commit is impossible
  if (
    text.includes('cannot do a partial commit during a merge') ||
    text.includes('cannot do a partial commit during a rebase') ||
    text.includes('cannot do a partial commit')
  ) {
    return {
      reason: 'merge-in-progress',
      message: 'a merge or rebase is in progress, so a vault-scoped commit is not possible: finish or abort it first.',
      note: null,
      guidance: 'git status   # see what is in progress',
    };
  }

  // pull: conflict
  if (text.includes('conflict') || text.includes('automatic merge failed')) {
    return {
      reason: 'pull-conflict',
      message: 'the pull hit a conflict: resolve the conflicting files, then commit.',
      note: null,
      guidance: 'git status   # see the conflicting files',
    };
  }

  // uncommitted local changes are at risk of being overwritten by the pull
  if (text.includes('would be overwritten') || text.includes('overwritten by merge')) {
    return {
      reason: 'local-changes',
      message: 'uncommitted local changes are in the way: commit them with snapshot, or stash them.',
      note: null,
      guidance: 'ontology-atlas snapshot   # commit the local changes first',
    };
  }

  // pull: no remote or tracking information
  if (
    text.includes('no tracking information') ||
    text.includes("couldn't find remote ref") ||
    text.includes('no such remote')
  ) {
    return {
      reason: 'no-upstream',
      message: 'this branch has no remote: set an upstream first.',
      note: null,
      guidance: 'git push -u origin <branch>',
    };
  }

  // pre-commit / commit-msg hook refused (the hook left "hook"/"pre-commit" behind)
  if (text.includes('pre-commit') || text.includes('commit-msg') || text.includes('hook')) {
    return {
      reason: 'pre-commit-hook',
      message: 'a commit hook rejected the snapshot: fix what the hook reported, then snapshot again.',
      note: firstLine,
      guidance: null,
    };
  }

  // Unclassified — a clean per-operation fallback plus git's first line, rather
  // than a raw stack trace.
  if (operation === 'commit') {
    return {
      reason: 'commit-rejected',
      message: 'the commit was rejected (a commit hook may have blocked it).',
      note: firstLine,
      guidance: null,
    };
  }
  return {
    reason: 'git-command-failed',
    message: `the git ${operation} command failed.`,
    note: firstLine,
    guidance: null,
  };
}

// ── Obsidian Git parity (read-only, transmission is opt-in) ───────────────
const LOG_FIELD_SEP = '\x1f';

/**
 * The most recent N commits touching the vault pathspec (git log -- <pathspec>).
 * `null` when there are no commits or the repository errors — the caller then
 * says "no history".
 * @returns {{ shortHash: string, hash: string, subject: string, relativeTime: string, isoTime: string }[] | null}
 */
export function getVaultLog({ repoRoot, pathspec, limit = 10, run = defaultRun }) {
  let out;
  try {
    out = run(
      [
        'log',
        `--max-count=${limit}`,
        `--pretty=format:%h${LOG_FIELD_SEP}%H${LOG_FIELD_SEP}%s${LOG_FIELD_SEP}%cr${LOG_FIELD_SEP}%cI`,
        '--',
        pathspec,
      ],
      repoRoot,
    );
  } catch {
    return null; // no commits yet, or not a repository
  }
  if (typeof out !== 'string') return null;
  const trimmed = out.trim();
  if (!trimmed) return [];
  return trimmed
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [shortHash, hash, subject, relativeTime, isoTime] = line.split(LOG_FIELD_SEP);
      return { shortHash, hash, subject, relativeTime, isoTime };
    });
}

/**
 * Diff of uncommitted changes inside the vault (git diff HEAD -- <pathspec>).
 * Falls back to the index when there is no HEAD (zero commits); null on failure.
 * Untracked new files never appear in a diff, so they are shown separately as a
 * file list.
 */
export function getVaultDiff({ repoRoot, pathspec, run = defaultRun }) {
  try {
    return run(['diff', 'HEAD', '--', pathspec], repoRoot);
  } catch {
    try {
      return run(['diff', '--', pathspec], repoRoot);
    } catch {
      return null;
    }
  }
}

/**
 * Pulls the current branch from its upstream (opt-in). Conflicts,
 * non-fast-forwards, and a missing remote propagate as a throw, which the wrapper
 * converts gracefully through `classifyGitError`.
 */
export function pullCurrentBranch({ repoRoot, run = defaultRun }) {
  return run(['pull'], repoRoot);
}
