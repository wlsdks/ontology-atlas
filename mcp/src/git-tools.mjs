import { existsSync, realpathSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const MAX_GIT_OUTPUT = 4 * 1024 * 1024;

export function discoverGitRepositoryRoot(startPath) {
  const absoluteStart = resolve(startPath);
  if (!existsSync(absoluteStart)) return null;
  const result = git(absoluteStart, ['rev-parse', '--show-toplevel'], { allowFailure: true });
  if (!result.ok || !result.stdout.trim()) return null;
  try {
    return realpathSync(resolve(result.stdout.trim()));
  } catch {
    return null;
  }
}

export function inspectVaultGit({ repoRoot, vaultRoot }) {
  const scope = resolveVaultGitScope({ repoRoot, vaultRoot, operation: 'git_status' });
  if (!scope.ok) return scope;
  const { gitRoot, absoluteVault, vaultRelative } = scope;

  const head = git(gitRoot, ['rev-parse', 'HEAD'], { allowFailure: true });
  const branch = git(gitRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowFailure: true });
  // `-z` disables Git's C-style path quoting and makes filenames containing
  // spaces, unicode, tabs, or newlines unambiguous for machine consumers.
  const scoped = git(gitRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', vaultRelative]);
  const all = git(gitRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const files = parsePorcelain(scoped.stdout);
  const allFiles = parsePorcelain(all.stdout);
  const stagedOutsideVault = allFiles
    .filter((row) => row.staged && !isInsidePathspec(row.path, vaultRelative))
    .map((row) => row.path);
  const outsideVaultChanges = allFiles.filter((row) => !isInsidePathspec(row.path, vaultRelative));
  const operationInProgress = detectGitOperation(gitRoot);
  const detachedHead = head.ok && !branch.ok;

  return {
    operation: 'git_status',
    ok: true,
    repoRoot: gitRoot,
    vaultRoot: absoluteVault,
    vaultPathspec: vaultRelative,
    head: head.ok ? head.stdout.trim() : null,
    branch: branch.ok ? branch.stdout.trim() : null,
    detachedHead,
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
      level: operationInProgress || !head.ok || detachedHead ? 'high' : stagedOutsideVault.length > 0 ? 'medium' : 'low',
      warnings: [
        ...(operationInProgress ? [`git ${operationInProgress} is in progress; snapshot is blocked`] : []),
        ...(!head.ok ? ['repository has no HEAD commit yet; create an initial commit before MCP snapshots'] : []),
        ...(detachedHead ? ['repository is on a detached HEAD; snapshot is blocked to prevent an orphan commit'] : []),
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

export function inspectVaultGitHistory({ repoRoot, vaultRoot, limit = 20 }) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('limit must be an integer between 1 and 100.');
  }
  const scope = resolveVaultGitScope({ repoRoot, vaultRoot, operation: 'git_history' });
  if (!scope.ok) return scope;
  const { gitRoot, absoluteVault, vaultRelative } = scope;
  const head = git(gitRoot, ['rev-parse', 'HEAD'], { allowFailure: true });
  const branch = git(gitRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowFailure: true });
  const log = git(
    gitRoot,
    [
      'log',
      '-z',
      `--max-count=${limit + 1}`,
      '--format=%H%x1f%h%x1f%aI%x1f%s',
      '--',
      vaultRelative,
    ],
    { allowFailure: true },
  );
  const visibleHistory = log.ok ? parseHistory(log.stdout) : [];
  const hasMore = visibleHistory.length > limit;
  const commits = visibleHistory.slice(0, limit);
  const shallowResult = git(gitRoot, ['rev-parse', '--is-shallow-repository'], {
    allowFailure: true,
  });
  const shallow = shallowResult.ok && shallowResult.stdout.trim() === 'true';
  return {
    operation: 'git_history',
    ok: true,
    repoRoot: gitRoot,
    vaultRoot: absoluteVault,
    vaultPathspec: vaultRelative,
    head: head.ok ? head.stdout.trim() : null,
    branch: branch.ok ? branch.stdout.trim() : null,
    limit,
    count: commits.length,
    limited: hasMore,
    hasMore,
    shallow,
    historyComplete: !hasMore && !shallow,
    commits,
  };
}

export function snapshotVaultGit({ repoRoot, vaultRoot, confirm = false, expectedHead, message }) {
  const status = inspectVaultGit({ repoRoot, vaultRoot });
  if (!status.ok) {
    return {
      ...status,
      operation: 'git_snapshot',
      dryRun: !confirm,
      committed: false,
      previewReady: false,
      canConfirm: false,
      wouldChange: false,
      blockedReasons: [status.reason],
    };
  }
  const subject = message || semanticSubject(status.files);
  const blockedReasons = snapshotBlockedReasons(status);
  const preview = {
    operation: 'git_snapshot',
    ok: true,
    dryRun: !confirm,
    committed: false,
    previewReady: !confirm,
    canConfirm: !confirm && status.files.length > 0 && blockedReasons.length === 0,
    wouldChange: !confirm && status.files.length > 0,
    blockedReasons: !confirm ? blockedReasons : [],
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
  if (status.detachedHead) {
    throw new Error('Git is on a detached HEAD; switch to a branch before snapshotting to prevent an orphan commit.');
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

function resolveVaultGitScope({ repoRoot, vaultRoot, operation }) {
  const gitRootResult = git(repoRoot, ['rev-parse', '--show-toplevel'], { allowFailure: true });
  if (!gitRootResult.ok) {
    return {
      operation,
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
      operation,
      ok: false,
      reason: 'vault-outside-repository',
      repoRoot: gitRoot,
      vaultRoot: absoluteVault,
    };
  }
  return { ok: true, gitRoot, absoluteVault, vaultRelative };
}

function snapshotBlockedReasons(status) {
  return [
    ...(status.operationInProgress
      ? [`git ${status.operationInProgress} is in progress; finish or abort it before confirmation`]
      : []),
    ...(!status.head
      ? ['repository has no HEAD commit; create an initial commit before confirmation']
      : []),
    ...(status.detachedHead
      ? ['repository is on a detached HEAD; switch to a branch before confirmation']
      : []),
    ...(status.files.length === 0
      ? ['vault has no changes; confirmation would be a no-op']
      : []),
  ];
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
  const records = String(text).split('\0');
  const rows = [];
  for (let indexInRecords = 0; indexInRecords < records.length; indexInRecords += 1) {
    const line = records[indexInRecords];
    if (!line) continue;
    const index = line[0] || ' ';
    const worktree = line[1] || ' ';
    const path = line.slice(3);
    // In porcelain v1 -z mode, rename/copy records contain the destination
    // path first and the source path in the following NUL-delimited record.
    // The destination is the path agents should use for subsequent operations.
    if (['R', 'C'].includes(index) || ['R', 'C'].includes(worktree)) {
      indexInRecords += 1;
    }
    const untracked = index === '?' && worktree === '?';
    rows.push({
      path,
      index,
      worktree,
      status: untracked ? 'untracked' : index === 'D' || worktree === 'D' ? 'deleted' : index === 'A' ? 'added' : 'modified',
      staged: !untracked && index !== ' ',
      unstaged: untracked || worktree !== ' ',
    });
  }
  return rows;
}

function parseHistory(text) {
  return String(text)
    .split('\0')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, shortHash, authoredAt, ...subjectParts] = record.split('\x1f');
      return {
        hash,
        shortHash,
        authoredAt,
        subject: subjectParts.join('\x1f'),
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
  if (files.length === 0) return 'ontology snapshot: no vault changes';
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
