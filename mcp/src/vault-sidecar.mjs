import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';

const SIDECAR_DIRECTORY = '.ontology-atlas';
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;

export class SidecarPathError extends Error {
  constructor(message, options = undefined) {
    super(message, options);
    this.name = 'SidecarPathError';
    this.code = 'unsafe_path';
  }
}

function unsafe(message, cause = undefined) {
  return new SidecarPathError(message, cause ? { cause } : undefined);
}

function lstatOrNull(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function revisionOf(metadata) {
  if (!metadata) return null;
  return {
    dev: metadata.dev,
    ino: metadata.ino,
    size: metadata.size,
    mtimeMs: metadata.mtimeMs,
    ctimeMs: metadata.ctimeMs,
  };
}

function sameRevision(left, right) {
  if (left === null || right === null) return left === right;
  return Boolean(
    left
      && right
      && left.dev === right.dev
      && left.ino === right.ino
      && left.size === right.size
      && left.mtimeMs === right.mtimeMs
      && left.ctimeMs === right.ctimeMs,
  );
}

function sameIdentity(left, right) {
  return Boolean(left && right && left.dev === right.dev && left.ino === right.ino);
}

function assertOneBasename(value, message) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value === '.'
    || value === '..'
    || basename(value) !== value
  ) {
    throw unsafe(message);
  }
}

function assertFilename(filename) {
  assertOneBasename(filename, 'Sidecar filename must be one basename directly below .ontology-atlas.');
}

function assertSubdirectoryName(subdirectory) {
  assertOneBasename(
    subdirectory,
    'Sidecar subdirectory must be one basename directly below .ontology-atlas.',
  );
}

function assertSidecarDirectory(root, sidecarPath, expectedIdentity = null) {
  const metadata = lstatOrNull(sidecarPath);
  if (!metadata || metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw unsafe('The .ontology-atlas sidecar must be a real directory, not a symlink or junction.');
  }
  if (expectedIdentity && !sameIdentity(expectedIdentity, metadata)) {
    throw unsafe('The .ontology-atlas directory changed during the operation.');
  }
  let resolved;
  try {
    resolved = realpathSync(sidecarPath);
  } catch (error) {
    throw unsafe('The .ontology-atlas directory cannot be resolved safely.', error);
  }
  if (realpathSync(dirname(resolved)) !== root) {
    throw unsafe('The .ontology-atlas directory resolves outside the selected vault.');
  }
  return metadata;
}

function sidecarContext(vaultRoot, { create = false, subdirectory = undefined } = {}) {
  let root;
  try {
    root = realpathSync(vaultRoot);
  } catch (error) {
    throw unsafe('The selected vault root cannot be resolved safely.', error);
  }
  const rootMetadata = lstatOrNull(root);
  if (!rootMetadata?.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw unsafe('The selected vault root must resolve to a real directory.');
  }

  const sidecarPath = join(root, SIDECAR_DIRECTORY);
  let sidecarMetadata = lstatOrNull(sidecarPath);
  if (!sidecarMetadata && !create) return null;
  if (!sidecarMetadata) {
    try {
      mkdirSync(sidecarPath, { recursive: false, mode: 0o700 });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
    sidecarMetadata = lstatOrNull(sidecarPath);
  }
  const verified = assertSidecarDirectory(root, sidecarPath);
  if (subdirectory === undefined) {
    return { root, sidecarPath, sidecarIdentity: revisionOf(verified ?? sidecarMetadata) };
  }

  // One named level below .ontology-atlas, held to the same discipline as the
  // sidecar itself: a real directory, no symlink, resolving under the verified
  // sidecar. The returned context re-checks that chain before every operation.
  assertSubdirectoryName(subdirectory);
  let sidecarReal;
  try {
    sidecarReal = realpathSync(sidecarPath);
  } catch (error) {
    throw unsafe('The .ontology-atlas directory cannot be resolved safely.', error);
  }
  const subdirectoryPath = join(sidecarPath, subdirectory);
  let subdirectoryMetadata = lstatOrNull(subdirectoryPath);
  if (!subdirectoryMetadata && !create) return null;
  if (!subdirectoryMetadata) {
    try {
      mkdirSync(subdirectoryPath, { recursive: false, mode: 0o700 });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
    subdirectoryMetadata = lstatOrNull(subdirectoryPath);
  }
  const verifiedSubdirectory = assertSidecarDirectory(sidecarReal, subdirectoryPath);
  return {
    root: sidecarReal,
    sidecarPath: subdirectoryPath,
    sidecarIdentity: revisionOf(verifiedSubdirectory ?? subdirectoryMetadata),
  };
}

function assertContext(context) {
  assertSidecarDirectory(context.root, context.sidecarPath, context.sidecarIdentity);
}

function sidecarFile(context, filename) {
  assertFilename(filename);
  return join(context.sidecarPath, filename);
}

function safeFileMetadata(context, filename) {
  assertContext(context);
  const filePath = sidecarFile(context, filename);
  const metadata = lstatOrNull(filePath);
  if (!metadata) return null;
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw unsafe(`Sidecar entry is not a regular file: ${filename}`);
  }
  if (metadata.nlink !== 1) {
    throw unsafe(`Sidecar entry must not have hardlink aliases: ${filename}`);
  }
  return metadata;
}

function openWithoutFollowing(filePath, flags, mode = undefined) {
  try {
    return mode === undefined
      ? openSync(filePath, flags | NO_FOLLOW)
      : openSync(filePath, flags | NO_FOLLOW, mode);
  } catch (error) {
    if (error?.code === 'ELOOP') {
      throw unsafe('Refusing to open a sidecar symlink.', error);
    }
    throw error;
  }
}

function assertOpenedFileMatches(metadata, descriptor, filename) {
  const opened = fstatSync(descriptor);
  if (!opened.isFile() || opened.nlink !== 1 || (metadata && !sameIdentity(metadata, opened))) {
    throw unsafe(`Sidecar file changed identity while opening: ${filename}`);
  }
  return opened;
}

function conflict(filename) {
  return new Error(`Conflict: sidecar file changed before atomic write: ${filename}. Re-read and retry.`);
}

function unlinkOwnedTemporary(filePath, identity) {
  if (!identity) return;
  try {
    const current = lstatOrNull(filePath);
    if (current?.isFile() && !current.isSymbolicLink() && sameIdentity(current, identity)) {
      unlinkSync(filePath);
    }
  } catch {
    // A failed cleanup must never broaden into deleting a path we no longer own.
  }
}

export function readVaultSidecarText(vaultRoot, filename, { subdirectory = undefined } = {}) {
  assertFilename(filename);
  const context = sidecarContext(vaultRoot, { subdirectory });
  if (!context) return null;
  const metadata = safeFileMetadata(context, filename);
  if (!metadata) return null;
  const filePath = sidecarFile(context, filename);
  let descriptor = null;
  try {
    descriptor = openWithoutFollowing(filePath, constants.O_RDONLY);
    assertOpenedFileMatches(metadata, descriptor, filename);
    assertContext(context);
    const text = readFileSync(descriptor, 'utf8');
    const after = fstatSync(descriptor);
    if (!sameRevision(revisionOf(metadata), revisionOf(after))) throw conflict(filename);
    return { text, revision: revisionOf(after) };
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

export function createVaultSidecarTextExclusive(vaultRoot, filename, text) {
  assertFilename(filename);
  const context = sidecarContext(vaultRoot, { create: true });
  const filePath = sidecarFile(context, filename);
  const existing = safeFileMetadata(context, filename);
  if (existing) return false;

  let descriptor = null;
  let createdIdentity = null;
  let complete = false;
  try {
    try {
      descriptor = openWithoutFollowing(
        filePath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
        0o600,
      );
    } catch (error) {
      if (error?.code === 'EEXIST') {
        const raced = safeFileMetadata(context, filename);
        if (raced) return false;
      }
      throw error;
    }
    createdIdentity = assertOpenedFileMatches(null, descriptor, filename);
    assertContext(context);
    writeFileSync(descriptor, text, 'utf8');
    fsyncSync(descriptor);
    complete = true;
    return true;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (!complete) unlinkOwnedTemporary(filePath, createdIdentity);
  }
}

export function replaceVaultSidecarText(
  vaultRoot,
  filename,
  text,
  { expectedRevision = undefined, temporaryName = undefined, subdirectory = undefined } = {},
) {
  assertFilename(filename);
  const context = sidecarContext(vaultRoot, { create: true, subdirectory });
  const filePath = sidecarFile(context, filename);
  const initial = safeFileMetadata(context, filename);
  const initialRevision = revisionOf(initial);
  if (expectedRevision !== undefined && !sameRevision(expectedRevision, initialRevision)) {
    throw conflict(filename);
  }

  const tempFilename = temporaryName
    ?? `.${filename}.oatlas-tmp-${process.pid}-${randomUUID()}`;
  assertFilename(tempFilename);
  if (tempFilename === filename) throw unsafe('Temporary sidecar filename must differ from target.');
  const temporaryPath = sidecarFile(context, tempFilename);

  let descriptor = null;
  let temporaryIdentity = null;
  let complete = false;
  try {
    descriptor = openWithoutFollowing(
      temporaryPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    temporaryIdentity = assertOpenedFileMatches(null, descriptor, tempFilename);
    assertContext(context);
    if (initial) fchmodSync(descriptor, initial.mode & 0o777);
    writeFileSync(descriptor, text, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;

    const currentRevision = revisionOf(safeFileMetadata(context, filename));
    const requiredRevision = expectedRevision === undefined ? initialRevision : expectedRevision;
    if (!sameRevision(requiredRevision, currentRevision)) throw conflict(filename);
    assertContext(context);
    renameSync(temporaryPath, filePath);
    complete = true;
    const committed = safeFileMetadata(context, filename);
    return revisionOf(committed);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (!complete) unlinkOwnedTemporary(temporaryPath, temporaryIdentity);
  }
}

export function appendVaultSidecarLine(vaultRoot, filename, line) {
  assertFilename(filename);
  const context = sidecarContext(vaultRoot, { create: true });
  const filePath = sidecarFile(context, filename);
  const initial = safeFileMetadata(context, filename);
  const completeLine = line.endsWith('\n') ? line : `${line}\n`;
  let descriptor = null;
  try {
    descriptor = openWithoutFollowing(
      filePath,
      constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT,
      0o600,
    );
    assertOpenedFileMatches(initial, descriptor, filename);
    assertContext(context);
    writeFileSync(descriptor, completeLine, 'utf8');
    return revisionOf(fstatSync(descriptor));
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

export function removeVaultSidecarFile(
  vaultRoot,
  filename,
  { expectedRevision = undefined } = {},
) {
  assertFilename(filename);
  const context = sidecarContext(vaultRoot);
  if (!context) return false;
  const initial = safeFileMetadata(context, filename);
  if (!initial) return false;
  const initialRevision = revisionOf(initial);
  if (expectedRevision !== undefined && !sameRevision(expectedRevision, initialRevision)) {
    throw conflict(filename);
  }
  const current = safeFileMetadata(context, filename);
  if (!sameRevision(initialRevision, revisionOf(current))) throw conflict(filename);
  assertContext(context);
  unlinkSync(sidecarFile(context, filename));
  return true;
}
