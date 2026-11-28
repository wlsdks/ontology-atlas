import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, lstatSync, openSync, readSync, readlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { compareCodePoints } from '../compare-code-points.mjs';
import { gitEnv, hardenedGitArgv } from '../git/hardened-git.mjs';
import { SOURCE_INVENTORY_MAX_HASH_BYTES, SOURCE_INVENTORY_VERSION } from './project-source-inventory-limits.mjs';
import { filterStatus, isExcluded } from './project-source-vault-exclusion.mjs';

const ZERO = Buffer.from([0]);
// A listing of a very large repository is read whole; the cap only turns a runaway into an error.
const GIT_MAX_BUFFER = 1024 * 1024 * 1024;
const GITLINK_MODE = '160000';
const NO_COMMITS_YET = '(unborn)';

function runGit(root, args) {
  return execFileSync('git', hardenedGitArgv(root, args), {
    encoding: null,
    env: gitEnv(),
    maxBuffer: GIT_MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** The repository's top folder, or null when `root` is not inside one. */
export function findGitRoot(root) {
  try {
    const found = runGit(root, ['rev-parse', '--show-toplevel']).toString('utf8').trim();
    return found ? realpathSync(found) : null;
  } catch {
    return null;
  }
}

function sizeBytes(size) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(size));
  return bytes;
}

const pathOf = (record) => record.slice(record.indexOf('\t') + 1);
const stageOf = (record) => record.charAt(record.indexOf('\t') - 1);

/**
 * Every entry of the index as its own `mode blob stage<TAB>path` line: a committed or staged
 * file is identified by the blob id on that line, so no file is opened for it. Paths are NFC,
 * the one spelling a Windows, macOS and Linux checkout of a tree share, and the lines are in
 * path order. `bytes` are those lines NUL-terminated, the exact text the fingerprint covers.
 */
function indexLines(root, excluded) {
  const listing = runGit(root, ['ls-files', '--stage', '-z']);
  const text = listing.toString('utf8');
  const records = [];
  let asListed = excluded === null;
  let ordered = true;
  let previous = '';
  for (let start = 0; start < text.length;) {
    const end = text.indexOf('\0', start);
    const record = text.slice(start, end === -1 ? text.length : end);
    start = end === -1 ? text.length : end + 1;
    const path = pathOf(record);
    if (isExcluded(path, excluded)) continue;
    const normalized = path.normalize('NFC');
    const line = normalized === path ? record : `${record.slice(0, record.length - path.length)}${normalized}`;
    if (line !== record) asListed = false;
    if (compareCodePoints(previous, normalized) > 0) ordered = false;
    previous = normalized;
    records.push(line);
  }
  if (!ordered) {
    records.sort((left, right) => compareCodePoints(pathOf(left), pathOf(right)) || compareCodePoints(stageOf(left), stageOf(right)));
  }
  const bytes = asListed && ordered ? listing : Buffer.from(records.map((record) => `${record}\0`).join(''), 'utf8');
  return { records, bytes };
}

/**
 * The entries of `status --porcelain=v1 -z`. A path differs from the index when the work
 * tree changed it (`Y` is not blank) or nothing tracks it (`??`); a path the work tree
 * lost (`Y` is `D`) has no file to read.
 */
function statusEntries(status) {
  const tokens = status.toString('utf8').split('\0');
  if (tokens.at(-1) === '') tokens.pop();
  const entries = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const [x, y] = token;
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') index += 1;
    entries.push({
      path: token.slice(3),
      untracked: x === '?',
      lost: y === 'D',
      changedInWorkTree: x === '?' || (y !== ' ' && y !== 'D'),
    });
  }
  return entries;
}

/** Feeds one changed file into `hash`: its name, size and, within the byte budget, its bytes. */
function hashChangedFile(root, entry, hash, budget) {
  const absolute = join(root, entry.path);
  let metadata;
  try {
    metadata = lstatSync(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  if (!metadata.isFile() && !metadata.isSymbolicLink()) return;
  hash.update(entry.path.normalize('NFC'));
  hash.update(ZERO);
  hash.update(sizeBytes(metadata.size));
  if (metadata.isSymbolicLink()) {
    const target = Buffer.from(readlinkSync(absolute));
    const copied = Math.min(budget.remaining, target.length);
    hash.update(target.subarray(0, copied));
    budget.remaining -= copied;
    if (copied < target.length) budget.truncated = true;
    return;
  }
  const descriptor = openSync(absolute, 'r');
  let copied = 0;
  try {
    const chunk = Buffer.alloc(Math.min(64 * 1024, Math.max(budget.remaining, 1)));
    while (budget.remaining > 0) {
      const read = readSync(descriptor, chunk, 0, Math.min(chunk.length, budget.remaining), null);
      if (read === 0) break;
      hash.update(chunk.subarray(0, read));
      budget.remaining -= read;
      copied += read;
    }
  } finally {
    closeSync(descriptor);
  }
  if (copied < metadata.size) budget.truncated = true;
}

function headCommit(root) {
  try {
    return runGit(root, ['rev-parse', '--quiet', '--verify', 'HEAD']).toString('utf8').trim();
  } catch {
    return NO_COMMITS_YET;
  }
}

/**
 * The state of a repository's source as one fingerprint: `HEAD`, the index (every file's
 * blob id), what `status` reports, and the bytes of only the files the work tree changed.
 * Two git calls read the tree and the changes; no file is opened or measured for a file
 * nobody changed, so the cost follows the changes, not the size of the repository.
 */
export function inspectGitState(root, excluded) {
  const index = indexLines(root, excluded);
  const revision = headCommit(root);
  const status = filterStatus(
    runGit(root, ['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all']),
    excluded,
  );
  const changes = statusEntries(status);

  const treeHash = createHash('sha256');
  treeHash.update(SOURCE_INVENTORY_VERSION);
  treeHash.update(ZERO);
  treeHash.update(index.bytes);

  const changedHash = createHash('sha256');
  const budget = { remaining: SOURCE_INVENTORY_MAX_HASH_BYTES, truncated: false };
  const changedInWorkTree = changes
    .filter((change) => change.changedInWorkTree)
    .sort((left, right) => compareCodePoints(left.path.normalize('NFC'), right.path.normalize('NFC')));
  for (const change of changedInWorkTree) hashChangedFile(root, change, changedHash, budget);

  const lost = new Set(changes.filter((change) => change.lost).map((change) => change.path.normalize('NFC')));
  const files = [];
  for (const record of index.records) {
    const path = pathOf(record);
    if (!record.startsWith(GITLINK_MODE) && !lost.has(path) && path !== files.at(-1)) files.push(path);
  }
  let sawUntracked = false;
  for (const change of changes) {
    // A nested repository is listed as its folder, which holds no file of this one.
    if (!change.untracked || change.path.endsWith('/')) continue;
    files.push(change.path.normalize('NFC'));
    sawUntracked = true;
  }
  if (sawUntracked) files.sort(compareCodePoints);

  const digest = createHash('sha256');
  for (const part of ['git-state-v2', revision, treeHash.digest('hex'), changedHash.digest('hex'), status]) {
    digest.update(part);
    digest.update(ZERO);
  }
  return {
    revision,
    fingerprint: `sha256:${digest.digest('hex')}`,
    dirty: status.length > 0,
    truncated: budget.truncated,
    files,
  };
}
