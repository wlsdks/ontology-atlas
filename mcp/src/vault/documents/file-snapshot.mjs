// Synchronous fs throughout `vault/`: MCP tool calls are infrequent, so async buys nothing.

import { closeSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs';

import { contentHash } from './content-hash.mjs';

export function sameFileSnapshot(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

/**
 * One read of a file: its bytes, the stamp they were read under and their SHA-1.
 * The text is decoded only when asked for: a fresh pass over an unchanged vault
 * compares hashes and never needs it.
 */
class FileSnapshot {
  #raw = null;

  constructor(bytes, stats, hash) {
    this.bytes = bytes;
    this.stats = stats;
    this.hash = hash;
  }

  get raw() {
    this.#raw ??= this.bytes.toString('utf8');
    return this.#raw;
  }
}

/** Characters a snapshot's text has at most: its UTF-8 byte count, decoded or not. */
export function snapshotChars(snapshot) {
  return snapshot.bytes?.length ?? snapshot.raw.length;
}

/**
 * A cached document's bytes read back for its body: one read, no stamps. The hash
 * the caller compares proves them the bytes the parse came from, so a read torn by a
 * concurrent write fails that comparison instead of passing as the file.
 */
export function readBack(filePath) {
  const bytes = readFileSync(filePath);
  return new FileSnapshot(bytes, null, contentHash(bytes));
}

/** The path names something other than a regular file; a pass skips it as it skips a deleted one. */
function notAFile(filePath) {
  const error = new Error(`Not a regular file: ${filePath}`);
  error.code = 'ENOENT';
  return error;
}

/** Fills `bytes` from `descriptor`; fewer when the file shrank during the read. */
function readInto(descriptor, bytes) {
  let filled = 0;
  while (filled < bytes.length) {
    const read = readSync(descriptor, bytes, filled, bytes.length - filled, filled);
    if (read === 0) break;
    filled += read;
  }
  return filled;
}

/**
 * Reads bytes and stamp together from one open file: open, stamp, one read of the
 * stamped size, stamp again, close. Equal stamps around the read mean no write
 * landed during it; otherwise it is read again.
 */
export function readStableFileSnapshot(filePath) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let descriptor = null;
    try {
      descriptor = openSync(filePath, 'r');
      const before = fstatSync(descriptor);
      if (!before.isFile()) throw notAFile(filePath);
      const bytes = Buffer.allocUnsafe(before.size);
      const filled = readInto(descriptor, bytes);
      const after = fstatSync(descriptor);
      closeSync(descriptor);
      descriptor = null;
      // The stamp kept is the descriptor's, so a path replaced during the read leaves
      // an entry whose inode no longer matches the path, and the next pass re-reads it.
      if (filled === before.size && sameFileSnapshot(before, after)) {
        return new FileSnapshot(bytes, after, contentHash(bytes));
      }
    } catch (error) {
      lastError = error;
    } finally {
      if (descriptor !== null) {
        try {
          closeSync(descriptor);
        } catch {
          /* already closed */
        }
      }
    }
  }
  const reason = lastError?.message ? ` (${lastError.message})` : '';
  const error = new Error(`Could not capture a stable file snapshot: ${filePath}${reason}`);
  if (lastError?.code) error.code = lastError.code;
  throw error;
}
