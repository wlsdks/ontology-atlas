import {
  closeSync,
  existsSync,
  fchmodSync,
  fsyncSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

export function readFileRevision(filePath) {
  try {
    const metadata = statSync(filePath);
    return {
      dev: metadata.dev,
      ino: metadata.ino,
      size: metadata.size,
      mtimeMs: metadata.mtimeMs,
      ctimeMs: metadata.ctimeMs,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function sameFileRevision(left, right) {
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

function assertExpectedRevision(filePath, expectedRevision) {
  if (!expectedRevision) return;
  if (sameFileRevision(expectedRevision, readFileRevision(filePath))) return;
  throw new Error(
    `Conflict: file changed or was deleted before atomic write: ${filePath}. Re-read and retry.`,
  );
}

function existingRegularFileMode(filePath) {
  try {
    const metadata = statSync(filePath);
    return metadata.isFile() ? metadata.mode & 0o777 : null;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Writes one file without a torn window (temp file, fsync, rename): `writeFileSync` truncates first, so a crash
 * could leave the user's markdown at zero bytes. Twin of `writeFileAtomically` in `mcp/src/vault.mjs`; a fix
 * lands in both (tests/contract/vault-integrity-guards.contract.test.ts).
 */
export function writeFileAtomically(filePath, text, { expectedRevision = null } = {}) {
  const temporaryPath = `${filePath}.oatlas-tmp-${process.pid}`;
  const existingMode = existingRegularFileMode(filePath);
  let descriptor = null;
  try {
    descriptor = openSync(temporaryPath, 'wx');
    // Apply the mode before the content, so a private original's permissions are
    // never briefly widened by the temp file.
    if (existingMode !== null) fchmodSync(descriptor, existingMode);
    writeFileSync(descriptor, text, 'utf-8');
    // Commit to disk before renaming. Otherwise power can be lost with the new
    // name in place and the content still sitting in cache.
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    // Re-check the original snapshot immediately before the rename. Without it, a
    // human edit made between re-reading the frontmatter and writing the temp file
    // is overwritten.
    assertExpectedRevision(filePath, expectedRevision);
    renameSync(temporaryPath, filePath);
  } finally {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        /* already closed */
      }
    }
    try {
      // On success the rename consumed it, so there is nothing to remove. It
      // survives only on failure, and is cleaned up without touching the original.
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    } catch {
      /* even if cleanup fails, the original is intact */
    }
  }
}
