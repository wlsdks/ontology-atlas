import { existsSync, realpathSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const MAX_GIT_OUTPUT = 4 * 1024 * 1024;

export function inspectVaultGit({ repoRoot, vaultRoot }) {
  const gitRootResult = git(repoRoot, ['rev-parse', '--show-toplevel'], { allowFailure: true });
  if (!gitRootResult.ok) {
    return {
      operation: 'git_status',
      ok: false,
      reason: 'not-a-git-repository',
      repoRoot: resolve(repoRoot),
      vaultRoot: resolve(vaultRoot),
    };
  }
  // macOS commonly exposes /var as a symlink to /private/var. Compare canonical
  // paths so a vault reached through a symlink is not misclassified as outside.
  const gitRoot = realpathSync(resolve(gitRootResult.stdout.trim()));
  const absoluteVault = realpathSync(resolve(vaultRoot));
  const vaultRelative = relative(gitRoot, absoluteVault) || '.';
  if (vaultRelative === '..' || vaultRelative.startsWith(`..${sep}`)) {
    return {
      operation: 'git_status',
      ok: false,
      reason: 'vault-outside-repository',
      repoRoot: gitRoot,
      vaultRoot: absoluteVault,
    };
  }

  const head = git(gitRoot, ['rev-parse', 'HEAD'], { allowFailure: true });
  const branch = git(gitRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowFailure: true });
  const scoped = git(gitRoot, ['status', '--porcelain=v1', '--untracked-files=all', '--', vaultRelative]);
  const all = git(gitRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
  const files = parsePorcelain(scoped.stdout);
  const allFiles = parsePorcelain(all.stdout);
  const stagedOutsideVault = allFiles
    .filter((row) => row.staged && !isInsidePathspec(row.path, vaultRelative))
    .map((row) => row.path);
  const outsideVaultChanges = allFiles.filter((row) => !isInsidePathspec(row.path, vaultRelative));
  const operationInProgress = detectGitOperation(gitRoot);

  return {
    operation: 'git_status',
    ok: true,
    repoRoot: gitRoot,
    vaultRoot: absoluteVault,
    vaultPathspec: vaultRelative,
    head: head.ok ? head.stdout.trim() : null,
    branch: branch.ok ? branch.stdout.trim() : null,
    detachedHead: !branch.ok,
    operationInProgress,
    counts: {
      total: files.length,
      staged: files.filter((row) => row.staged).length,
      unstaged: files.filter((row) => row.unstaged).length,
      untracked: files.filter((row) => row.status === 'untracked').length,
      outsideVault: outsideVaultChanges.length,
      stagedOutsideVault: stagedOutsideVault.length,
    },
    files,
    stagedOutsideVault,
    risk: {
      level: operationInProgress || !head.ok ? 'high' : stagedOutsideVault.length > 0 ? 'medium' : 'low',
      warnings: [
        ...(operationInProgress ? [`git ${operationInProgress} is in progress; snapshot is blocked`] : []),
        ...(!head.ok ? ['repository has no HEAD commit yet; create an initial commit before MCP snapshots'] : []),
        ...(stagedOutsideVault.length > 0
          ? [`${stagedOutsideVault.length} staged file(s) outside the vault will not be included`]
          : []),
        ...(outsideVaultChanges.length > 0
          ? [`${outsideVaultChanges.length} changed file(s) outside the vault remain untouched`]
          : []),
      ],
    },
  };
}

export function snapshotVaultGit({ repoRoot, vaultRoot, confirm = false, expectedHead, message }) {
  const status = inspectVaultGit({ repoRoot, vaultRoot });
  if (!status.ok) return { ...status, operation: 'git_snapshot', dryRun: !confirm, committed: false };
  const subject = message || semanticSubject(status.files);
  const preview = {
    operation: 'git_snapshot',
    ok: true,
    dryRun: !confirm,
    committed: false,
    repoRoot: status.repoRoot,
    vaultRoot: status.vaultRoot,
    vaultPathspec: status.vaultPathspec,
    expectedHead: status.head,
    subject,
    counts: status.counts,
    files: status.files,
    stagedOutsideVault: status.stagedOutsideVault,
    risk: status.risk,
    pushSupported: false,
    pushReason: 'MCP snapshots are local-only; remote push requires an explicit human-owned transport workflow.',
  };
  if (status.files.length === 0) return { ...preview, dryRun: !confirm, reason: 'no-changes' };
  if (!confirm) return preview;
  if (status.operationInProgress) {
    throw new Error(`git ${status.operationInProgress} is in progress; finish or abort it before snapshotting.`);
  }
  if (typeof expectedHead !== 'string' || !expectedHead) {
    throw new Error('expectedHead is required when confirm:true. Use the exact expectedHead from the dry-run preview.');
  }
  if (status.head !== expectedHead) {
    throw new Error(`Git HEAD changed since preview (expected ${expectedHead}, current ${status.head}). Run git_snapshot dry-run again.`);
  }

  const untracked = status.files.filter((row) => row.status === 'untracked').map((row) => row.path);
  if (untracked.length > 0) git(status.repoRoot, ['add', '--', ...untracked]);
  const commit = git(status.repoRoot, ['commit', '--only', '-m', subject, '--', status.vaultPathspec]);
  const nextHead = git(status.repoRoot, ['rev-parse', 'HEAD']).stdout.trim();
  return {
    ...preview,
    dryRun: false,
    committed: true,
    previousHead: status.head,
    commitHash: nextHead,
    commitSummary: commit.stdout.trim(),
  };
}

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    maxBuffer: MAX_GIT_OUTPUT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status === 0) return { ok: true, stdout: result.stdout || '', stderr: result.stderr || '' };
  if (allowFailure) return { ok: false, stdout: result.stdout || '', stderr: result.stderr || '' };
  throw new Error(`git ${args[0]} failed: ${(result.stderr || result.stdout || `exit ${result.status}`).trim()}`);
}

function parsePorcelain(text) {
  return String(text)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const index = line[0] || ' ';
      const worktree = line[1] || ' ';
      const rawPath = line.slice(3);
      const path = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) : rawPath;
      const untracked = index === '?' && worktree === '?';
      return {
        path,
        index,
        worktree,
        status: untracked ? 'untracked' : index === 'D' || worktree === 'D' ? 'deleted' : index === 'A' ? 'added' : 'modified',
        staged: !untracked && index !== ' ',
        unstaged: untracked || worktree !== ' ',
      };
    });
}

function isInsidePathspec(path, pathspec) {
  if (pathspec === '.') return true;
  return path === pathspec || path.startsWith(`${pathspec}/`);
}

function detectGitOperation(repoRoot) {
  const gitDir = git(repoRoot, ['rev-parse', '--git-dir']).stdout.trim();
  const root = resolve(repoRoot, gitDir);
  if (existsSync(resolve(root, 'MERGE_HEAD'))) return 'merge';
  if (existsSync(resolve(root, 'CHERRY_PICK_HEAD'))) return 'cherry-pick';
  if (existsSync(resolve(root, 'REVERT_HEAD'))) return 'revert';
  if (existsSync(resolve(root, 'rebase-merge')) || existsSync(resolve(root, 'rebase-apply'))) return 'rebase';
  return null;
}

function semanticSubject(files) {
  const counts = {
    added: files.filter((row) => row.status === 'added' || row.status === 'untracked').length,
    modified: files.filter((row) => row.status === 'modified').length,
    deleted: files.filter((row) => row.status === 'deleted').length,
  };
  const parts = [
    counts.added ? `+${counts.added}` : null,
    counts.modified ? `~${counts.modified}` : null,
    counts.deleted ? `-${counts.deleted}` : null,
  ].filter(Boolean);
  return `ontology snapshot: ${parts.join(', ')} vault file${files.length === 1 ? '' : 's'}`;
}
