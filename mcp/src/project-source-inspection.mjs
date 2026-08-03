import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';

// Keep these values byte-for-byte aligned with src-tauri/src/lib.rs. The app
// mints the receipt; a fresh MCP process must reproduce the same bounded probe
// before it can call that receipt current.
const SOURCE_INVENTORY_VERSION = 'inventory-v2';
const SOURCE_INVENTORY_MAX_DEPTH = 20;
const SOURCE_INVENTORY_MAX_FILES = 4000;
const SOURCE_INVENTORY_MAX_HASH_BYTES = 32 * 1024 * 1024;
const SOURCE_PRUNE_DIR_NAMES = new Set([
  '.git',
  '.next',
  '.turbo',
  '.cache',
  'node_modules',
  'target',
  'dist',
  'build',
  'coverage',
]);
const ZERO = Buffer.from([0]);
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function sourceDigest(parts) {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(part);
    hash.update(ZERO);
  }
  return `sha256:${hash.digest('hex')}`;
}

function sizeBytes(size) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(size));
  return bytes;
}

function inventory() {
  const hash = createHash('sha256');
  hash.update(SOURCE_INVENTORY_VERSION);
  hash.update(ZERO);
  return { hash, files: [], hashedBytes: 0, truncated: false };
}

function hashRegularFile(path, state, size) {
  let remaining = SOURCE_INVENTORY_MAX_HASH_BYTES - state.hashedBytes;
  if (remaining === 0) {
    state.truncated = true;
    return;
  }
  const descriptor = openSync(path, 'r');
  let copied = 0;
  try {
    const chunk = Buffer.alloc(Math.min(64 * 1024, remaining));
    while (remaining > 0) {
      const read = readSync(descriptor, chunk, 0, Math.min(chunk.length, remaining), null);
      if (read === 0) break;
      state.hash.update(chunk.subarray(0, read));
      state.hashedBytes += read;
      copied += read;
      remaining -= read;
    }
  } finally {
    closeSync(descriptor);
  }
  if (copied < size) state.truncated = true;
}

function hashSourceFile(path, relative, state, hashContent) {
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  if (!metadata.isFile() && !metadata.isSymbolicLink()) return;

  state.files.push(relative);
  state.hash.update(relative);
  state.hash.update(ZERO);
  state.hash.update(sizeBytes(metadata.size));
  if (!hashContent) return;

  if (metadata.isSymbolicLink()) {
    const target = Buffer.from(readlinkSync(path));
    const remaining = SOURCE_INVENTORY_MAX_HASH_BYTES - state.hashedBytes;
    const copied = Math.min(remaining, target.length);
    state.hash.update(target.subarray(0, copied));
    state.hashedBytes += copied;
    if (copied < target.length) state.truncated = true;
    return;
  }
  hashRegularFile(path, state, metadata.size);
}

function walkFolder(root, prefix, depth, state) {
  if (state.files.length >= SOURCE_INVENTORY_MAX_FILES) {
    state.truncated = true;
    return;
  }
  if (depth > SOURCE_INVENTORY_MAX_DEPTH) {
    state.truncated = true;
    return;
  }

  const children = readdirSync(join(root, prefix), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.isFile())
    .sort((left, right) => compareUtf8(left.name, right.name));
  for (const child of children) {
    if (state.files.length >= SOURCE_INVENTORY_MAX_FILES) {
      state.truncated = true;
      break;
    }
    const relative = prefix ? `${prefix}/${child.name}` : child.name;
    if (child.isDirectory()) {
      if (!SOURCE_PRUNE_DIR_NAMES.has(child.name)) walkFolder(root, relative, depth + 1, state);
      continue;
    }
    hashSourceFile(join(root, relative), relative, state, true);
  }
}

function runGit(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: null,
    maxBuffer: GIT_MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function splitNul(buffer) {
  return buffer
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((path) => path.replaceAll('\\', '/'));
}

function findGitRoot(root) {
  try {
    const found = runGit(root, ['rev-parse', '--show-toplevel']).toString('utf8').trim();
    return found ? realpathSync(found) : null;
  } catch {
    return null;
  }
}

function inspectGit(root) {
  const visiblePaths = [...new Set(splitNul(runGit(root, [
    'ls-files', '--cached', '--others', '--exclude-standard', '-z',
  ])))].sort(compareUtf8);
  const dirtyPaths = new Set(splitNul(runGit(root, [
    'diff', '--name-only', '--no-renames', '-z', 'HEAD', '--',
  ])));
  for (const path of splitNul(runGit(root, ['ls-files', '--others', '--exclude-standard', '-z']))) {
    dirtyPaths.add(path);
  }

  const state = inventory();
  state.truncated = visiblePaths.length > SOURCE_INVENTORY_MAX_FILES;
  for (const relative of visiblePaths.slice(0, SOURCE_INVENTORY_MAX_FILES)) {
    hashSourceFile(join(root, relative), relative, state, dirtyPaths.delete(relative));
  }
  for (const relative of [...dirtyPaths].sort(compareUtf8)) {
    state.hash.update('deleted');
    state.hash.update(ZERO);
    state.hash.update(relative);
    state.hash.update(ZERO);
  }
  const inventoryFingerprint = `sha256:${state.hash.digest('hex')}`;
  const revision = runGit(root, ['rev-parse', 'HEAD']).toString('utf8').trim();
  const status = runGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  return {
    rootPath: root,
    sourceId: sourceDigest(['git', root]),
    kind: 'git',
    revision,
    fingerprint: sourceDigest(['git-state-v1', revision, inventoryFingerprint, status]),
    dirty: status.length > 0,
    truncated: state.truncated,
    files: state.files,
  };
}

function inspectFolder(root) {
  const state = inventory();
  walkFolder(root, '', 0, state);
  const fingerprint = `sha256:${state.hash.digest('hex')}`;
  return {
    rootPath: root,
    sourceId: sourceDigest(['folder', root]),
    kind: 'folder',
    revision: fingerprint,
    fingerprint,
    dirty: null,
    truncated: state.truncated,
    files: state.files,
  };
}

/** Reproduce the installed app's bounded local source probe in a fresh MCP process. */
export function inspectProjectSource(rootPath) {
  const root = realpathSync(rootPath);
  if (!statSync(root).isDirectory()) throw new Error('project source root must be a directory');
  const gitRoot = findGitRoot(root);
  return gitRoot ? inspectGit(gitRoot) : inspectFolder(root);
}
