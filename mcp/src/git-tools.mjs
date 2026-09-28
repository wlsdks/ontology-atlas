import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { hardenedGitArgv } from './hardened-git.mjs';

import { detachText } from './parser.mjs';
import { CONTAINMENT_KEYS, revisionClocks } from './stale-parent.mjs';

const MAX_GIT_OUTPUT = 4 * 1024 * 1024;
/** One screen paint asks about at most this many paths; documents are queued before code. */
const MAX_WALK_PATHS = 512;
const MAX_GIT_BATCH_OUTPUT = 64 * 1024 * 1024;
const GIT_BATCH_CHUNK = 256;
const NODE_REVISION_CACHE_LIMIT = 8;
const nodeRevisionCache = new Map();
const PATH_CHANGE_CACHE_LIMIT = 8;
const pathChangeCache = new Map();

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
  // `-z` disables C-style path quoting, so names with spaces, unicode, tabs or
  // newlines stay unambiguous.
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
  // Canonical paths: macOS exposes /var as a symlink to /private/var, and a vault
  // reached through it must not look outside.
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
  const result = spawnSync('git', hardenedGitArgv(cwd, args), {
    encoding: 'utf8',
    maxBuffer: MAX_GIT_OUTPUT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status === 0) return { ok: true, stdout: result.stdout || '', stderr: result.stderr || '' };
  if (allowFailure) return { ok: false, stdout: result.stdout || '', stderr: result.stderr || '' };
  throw new Error(`git ${args[0]} failed: ${(result.stderr || result.stdout || `exit ${result.status}`).trim()}`);
}

/**
 * Reads historical blobs through `git cat-file --batch` instead of one `git show`
 * per revision. A malformed or oversized chunk leaves its entries null and the
 * caller falls back to per-object reads.
 */
function gitBatchBlobs(cwd, objectSpecs, reduce) {
  const reduced = new Array(objectSpecs.length).fill(null);
  for (let start = 0; start < objectSpecs.length; start += GIT_BATCH_CHUNK) {
    const blobs = gitBatchBlobChunk(cwd, objectSpecs.slice(start, start + GIT_BATCH_CHUNK));
    if (blobs === null) continue;
    blobs.forEach((blob, index) => {
      if (blob !== null) reduced[start + index] = reduce(blob);
    });
  }
  return reduced;
}

function gitBatchBlobChunk(cwd, objectSpecs) {
  if (objectSpecs.length === 0) return [];
  if (objectSpecs.some((spec) => /[\r\n]/.test(spec))) return null;
  const result = spawnSync('git', hardenedGitArgv(cwd, ['cat-file', '--batch']), {
    encoding: null,
    input: Buffer.from(`${objectSpecs.join('\n')}\n`, 'utf8'),
    maxBuffer: MAX_GIT_BATCH_OUTPUT,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) return null;

  const blobs = [];
  let offset = 0;
  for (let index = 0; index < objectSpecs.length; index += 1) {
    const headerEnd = result.stdout.indexOf(0x0a, offset);
    if (headerEnd < 0) return null;
    const header = result.stdout.subarray(offset, headerEnd).toString('utf8');
    offset = headerEnd + 1;
    if (header.endsWith(' missing')) {
      blobs.push(null);
      continue;
    }
    const parts = header.split(' ');
    const type = parts.at(-2);
    const size = Number(parts.at(-1));
    if (type !== 'blob' || !Number.isSafeInteger(size) || size < 0) return null;
    const contentEnd = offset + size;
    if (contentEnd > result.stdout.length) return null;
    blobs.push(result.stdout.subarray(offset, contentEnd).toString('utf8'));
    offset = contentEnd;
    if (result.stdout[offset] === 0x0a) offset += 1;
  }
  return blobs;
}

function cloneNodeRevisionResult(result) {
  return {
    ...result,
    revisionsBySlug: new Map(
      [...result.revisionsBySlug].map(([slug, revisions]) => [
        slug,
        revisions.map((revision) => ({ ...revision })),
      ]),
    ),
  };
}

function readNodeRevisionCache(key) {
  const cached = nodeRevisionCache.get(key);
  if (!cached) return null;
  nodeRevisionCache.delete(key);
  nodeRevisionCache.set(key, cached);
  return cloneNodeRevisionResult(cached);
}

function writeNodeRevisionCache(key, result) {
  nodeRevisionCache.set(key, cloneNodeRevisionResult(result));
  while (nodeRevisionCache.size > NODE_REVISION_CACHE_LIMIT) {
    nodeRevisionCache.delete(nodeRevisionCache.keys().next().value);
  }
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
    // In -z mode a rename or copy record holds the destination first and the source
    // in the next record; agents use the destination.
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

function parseRevisionHeader(value) {
  const separator = value.indexOf('\x1f');
  if (separator < 1) return null;
  const sha = value.slice(0, separator).trim();
  const changedAt = value.slice(separator + 1).trim();
  if (!/^[a-f0-9]{40}$/i.test(sha) || !changedAt) return null;
  return { sha, changedAt };
}

function perFileRevisionRequests(gitRoot, filePath, slug, maxRevisions) {
  const log = git(
    gitRoot,
    ['log', `--max-count=${maxRevisions}`, '--format=%H%x1f%aI', '--no-renames', '--', filePath],
    { allowFailure: true },
  );
  if (!log.ok) return [];
  const requests = [];
  for (const line of String(log.stdout).split('\n')) {
    const parsed = parseRevisionHeader(line.trim());
    if (!parsed) continue;
    requests.push({ slug, filePath, ...parsed, objectSpec: `${parsed.sha}:${filePath}` });
  }
  return requests;
}

/**
 * Reads the union history once, then falls back per path only when the union
 * bound hid its oldest relevant revision. One extra commit is requested to tell
 * complete history from truncation, so a busy file cannot make a quiet summary
 * node look complete.
 */
function unionRevisionRequests(gitRoot, entries, maxRevisions) {
  if (entries.length === 0) return new Map();
  const unionLimit = Math.max(1, maxRevisions * entries.length);
  const log = git(
    gitRoot,
    [
      'log',
      '-z',
      `--max-count=${unionLimit + 1}`,
      '--format=%x1e%H%x1f%aI',
      '--name-only',
      '--no-renames',
      '--',
      ...entries.map((entry) => entry.filePath),
    ],
    { allowFailure: true },
  );
  if (!log.ok) return null;

  const byPath = new Map(entries.map((entry) => [entry.filePath, []]));
  const entryByPath = new Map(entries.map((entry) => [entry.filePath, entry]));
  const records = String(log.stdout).split('\x1e').filter(Boolean);
  for (const record of records.slice(0, unionLimit)) {
    const [header, ...rawPaths] = record.split('\0');
    const parsed = parseRevisionHeader(header);
    if (!parsed) return null;
    for (const rawPath of rawPaths) {
      const filePath = rawPath.startsWith('\n') ? rawPath.slice(1) : rawPath;
      const requests = byPath.get(filePath);
      if (!requests || requests.length >= maxRevisions) continue;
      const entry = entryByPath.get(filePath);
      requests.push({
        slug: entry.slug,
        filePath,
        ...parsed,
        objectSpec: `${parsed.sha}:${filePath}`,
      });
    }
  }

  if (records.length > unionLimit) {
    for (const entry of entries) {
      if ((byPath.get(entry.filePath)?.length ?? 0) >= maxRevisions) continue;
      byPath.set(
        entry.filePath,
        perFileRevisionRequests(gitRoot, entry.filePath, entry.slug, maxRevisions),
      );
    }
  }
  return byPath;
}

/**
 * Revisions of summary nodes, newest first, for the stale-parent
 * check: `{ changedAt, bodyDigest, membershipDigest }`, the membership being the
 * union of containment arrays. The union walk stops at `maxRevisions × nodes`;
 * results are reused only under the same HEAD. Parsing is line-level, not YAML: old
 * revisions may predate the schema, and a strict parser would take the whole
 * advisory down. Outside a repository it returns `{ ok: false, reason }`.
 */
export function collectNodeRevisions({ repoRoot, vaultRoot, slugs, maxRevisions = 40 }) {
  const scope = resolveVaultGitScope({ repoRoot, vaultRoot, operation: 'node_revisions' });
  if (!scope.ok) return scope;
  const { gitRoot, vaultRelative } = scope;
  const prefix = vaultRelative === '.' ? '' : `${vaultRelative}/`;
  const requestedSlugs = [...(slugs ?? [])];
  const head = git(gitRoot, ['rev-parse', 'HEAD'], { allowFailure: true });
  const cacheKey = head.ok
    ? JSON.stringify([gitRoot, vaultRelative, head.stdout.trim(), maxRevisions, requestedSlugs])
    : null;
  if (cacheKey) {
    const cached = readNodeRevisionCache(cacheKey);
    if (cached) return cached;
  }

  const revisionsBySlug = new Map();
  const requestsBySlug = new Map();
  const entries = requestedSlugs.map((slug) => ({ slug, filePath: `${prefix}${slug}.md` }));
  const unionRequests = unionRevisionRequests(gitRoot, entries, maxRevisions);
  for (const entry of entries) {
    const requests = unionRequests?.get(entry.filePath)
      ?? perFileRevisionRequests(gitRoot, entry.filePath, entry.slug, maxRevisions);
    requestsBySlug.set(entry.slug, requests);
  }
  const revisionRequests = requestedSlugs.flatMap((slug) => requestsBySlug.get(slug) ?? []);

  const clocksOfBlob = (raw) => revisionClocks(splitNodeRevision(raw));
  const batchClocks = gitBatchBlobs(
    gitRoot,
    revisionRequests.map((request) => request.objectSpec),
    clocksOfBlob,
  );
  const clocksBySpec = new Map(
    revisionRequests.map((request, index) => [request.objectSpec, batchClocks[index]]),
  );

  for (const slug of requestedSlugs) {
    const revisions = [];
    for (const request of requestsBySlug.get(slug) ?? []) {
      let clocks = clocksBySpec.get(request.objectSpec);
      if (!clocks) {
        const show = git(gitRoot, ['show', request.objectSpec], { allowFailure: true });
        if (!show.ok) continue;
        clocks = clocksOfBlob(show.stdout);
      }
      revisions.push({ changedAt: detachText(request.changedAt), ...clocks });
    }
    if (revisions.length) revisionsBySlug.set(slug, revisions);
  }

  const result = { operation: 'node_revisions', ok: true, repoRoot: gitRoot, revisionsBySlug };
  if (cacheKey) writeNodeRevisionCache(cacheKey, result);
  return cloneNodeRevisionResult(result);
}

/** Splits one historical revision into its body and its declared containment members. */
function splitNodeRevision(text) {
  const source = String(text ?? '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  const frontmatter = match ? match[1] : '';
  const body = match ? source.slice(match[0].length) : source;
  const children = [];
  for (const key of CONTAINMENT_KEYS) {
    const inline = new RegExp(`^${key}:[ \\t]*\\[(.*?)\\]`, 'm').exec(frontmatter);
    if (inline) {
      for (const ref of inline[1].split(',')) {
        const cleaned = ref.trim().replace(/^["']|["']$/g, '');
        if (cleaned) children.push(cleaned);
      }
    }
  }
  return { body, children: [...new Set(children)] };
}

/**
 * When each path last changed, in one bounded walk. `repoPaths` are
 * repository-relative `path:` values; `vaultPaths` are vault-relative documents.
 * Security: a path that could climb the tree or read as a flag is dropped, not
 * escaped. Mirrors `git_paths_last_change` in the desktop app so the agent and
 * the screen read one fact.
 */
export function collectPathLastChanges({ repoRoot, vaultRoot, repoPaths = [], vaultPaths = [], maxCommits = 3000 }) {
  const scope = resolveVaultGitScope({ repoRoot, vaultRoot, operation: 'path_last_changes' });
  if (!scope.ok) return scope;
  const { gitRoot, vaultRelative } = scope;
  const prefix = vaultRelative === '.' ? '' : `${vaultRelative}/`;
  /*
   * A `path:` is written against the caller's repository root, which in a monorepo
   * package is not the Git toplevel; resolving against the toplevel loses every
   * cited file.
   */
  const repoPrefix = (() => {
    try {
      const relative_ = relative(gitRoot, realpathSync(resolve(repoRoot)));
      if (!relative_ || relative_ === '.') return '';
      if (relative_ === '..' || relative_.startsWith(`..${sep}`)) return '';
      return `${relative_.split(sep).join('/')}/`;
    } catch {
      return '';
    }
  })();
  const wanted = [];
  const seen = new Set();
  const push = (key, resolved) => {
    if (wanted.length >= MAX_WALK_PATHS || seen.has(key)) return;
    seen.add(key);
    wanted.push({ key, resolved });
  };
  /*
   * Documents first: the cap is shared, and implementation paths must not starve
   * every concept document of a date.
   */
  for (const raw of vaultPaths) {
    const clean = safeRelativePath(raw);
    if (clean) push(raw, `${prefix}${clean}`);
  }
  for (const raw of repoPaths) {
    const clean = safeRelativePath(raw);
    if (clean) push(raw, `${repoPrefix}${clean}`);
  }
  const changes = new Map();
  if (wanted.length === 0) return { operation: 'path_last_changes', ok: true, repoRoot: gitRoot, changes };
  const commitLimit = Math.max(1, Math.min(maxCommits, 20000));
  const historyState = pathHistoryState(gitRoot);
  const cacheKey = historyState && JSON.stringify([gitRoot, historyState, commitLimit, wanted]);
  let last = cacheKey ? pathChangeCache.get(cacheKey) : null;
  if (last) {
    pathChangeCache.delete(cacheKey);
    pathChangeCache.set(cacheKey, last);
  } else {
    const walked = walkPathLastChanges(gitRoot, wanted, commitLimit);
    last = walked.last;
    // Keep only a successful walk under unchanged history; HEAD alone misses
    // shallow fetches, grafts and replace refs.
    if (walked.ok && cacheKey && historyState === pathHistoryState(gitRoot)) {
      pathChangeCache.set(cacheKey, last);
      while (pathChangeCache.size > PATH_CHANGE_CACHE_LIMIT) {
        pathChangeCache.delete(pathChangeCache.keys().next().value);
      }
    }
  }
  // Only committed dates are reused; working-tree deletes and restores must show
  // on every request.
  for (const { key, resolved } of wanted) {
    const onDisk = resolve(gitRoot, resolved);
    let isDir = false;
    try {
      isDir = statSync(onDisk).isDirectory();
    } catch {
      isDir = false;
    }
    changes.set(key, { exists: existsSync(onDisk), isDir, lastChangedAt: last.get(key) ?? null });
  }
  return { operation: 'path_last_changes', ok: true, repoRoot: gitRoot, changes };
}

function pathHistoryState(gitRoot) {
  const state = git(gitRoot, ['rev-parse', 'HEAD', '--git-path', 'shallow', '--git-path', 'info/grafts'], { allowFailure: true });
  if (!state.ok) return null;
  const [head, shallowPath, graftsPath, ...extra] = state.stdout.trimEnd().split('\n');
  if (!/^[a-f0-9]{40,64}$/i.test(head) || !shallowPath || !graftsPath || extra.length) return null;
  const replacements = git(gitRoot, ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/replace'], { allowFailure: true });
  if (!replacements.ok) return null;
  const historyFiles = [];
  for (const path of [shallowPath, graftsPath]) {
    try {
      historyFiles.push(readFileSync(resolve(gitRoot, path), 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') return null;
      historyFiles.push(null);
    }
  }
  return JSON.stringify([head, ...historyFiles, replacements.stdout]);
}

function walkPathLastChanges(gitRoot, wanted, commitLimit) {
  const REC = '\x1e';
  const log = git(
    gitRoot,
    [
      // Without this Git C-quotes non-ASCII paths, and a Korean path never matches
      // the path asked about.
      '-c',
      'core.quotepath=false',
      'log',
      `--max-count=${commitLimit}`,
      `--pretty=format:${REC}%cI`,
      '--name-only',
      '--no-renames',
      '--',
      ...wanted.map((w) => w.resolved),
    ],
    { allowFailure: true },
  );
  const last = new Map();
  if (log.ok) {
    let currentTime = null;
    for (const rawLine of log.stdout.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith(REC)) {
        currentTime = line.slice(1).trim();
        continue;
      }
      if (!currentTime) continue;
      for (const { key, resolved } of wanted) {
        if (last.has(key)) continue;
        if (line === resolved || line.startsWith(`${resolved}/`)) last.set(key, currentTime);
      }
    }
  }
  return { ok: log.ok, last };
}

function safeRelativePath(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (
    !trimmed ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('-') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0') ||
    trimmed.split('/').some((part) => part === '..')
  ) {
    return null;
  }
  return trimmed;
}
