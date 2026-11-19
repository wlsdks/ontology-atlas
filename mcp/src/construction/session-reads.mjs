/**
 * The source lines this server served through `analyze_repo_structure`
 * sourceReads, each file with the line ranges and symbols read. Outlines are not
 * reads. The depth check asks this record, not a node's wording, which lines were
 * read.
 *
 * Over stdio one server process serves one client connection, and the transport
 * carries no session id, so the process is the session: a restarted server has
 * no record and says so. Files are keyed by their real absolute path, so a read
 * made with `rootPath` at a package folder counts for the repository it sits in,
 * and the path the server cited under that folder still names the file. Each
 * range keeps a hash of the lines it served; once the file's size, mtime or ctime
 * moves, the ranges are re-hashed and any whose lines changed no longer count.
 */

import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

const FILES = new Map();
const FILE_LIMIT = 20_000;
const RANGES_PER_FILE = 256;
const HASHED_BYTES = 2 * 1024 * 1024;

function realRoot(rootPath) {
  try {
    return realpathSync(String(rootPath ?? ''));
  } catch {
    return null;
  }
}

function stampOf(abs) {
  try {
    const stat = statSync(abs);
    return stat.isFile() && stat.size <= HASHED_BYTES ? `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}` : null;
  } catch {
    return null;
  }
}

function linesOf(abs) {
  try {
    return readFileSync(abs, 'utf8').split(/(?<=\n)/);
  } catch {
    return null;
  }
}

function hashLines(lines, range) {
  return createHash('sha256').update(lines.slice(range.startLine - 1, range.endLine).join('')).digest('hex');
}

/** Records every delivered line range, symbol read and context part in a `sourceEvidence:v1` packet. */
export function recordSourceEvidence(rootPath, packet) {
  if (!packet || !Array.isArray(packet.rows)) return;
  const root = realRoot(rootPath);
  if (!root) return;
  const texts = new Map();
  const add = (path, range) => {
    if (typeof path !== 'string' || !path || isAbsolute(path) || path.split('/').includes('..')) return;
    const abs = join(root, ...path.split('/'));
    const stamp = stampOf(abs);
    if (!stamp) return;
    if (!texts.has(abs)) texts.set(abs, linesOf(abs));
    const lines = texts.get(abs);
    if (!lines) return;
    let entry = FILES.get(abs);
    if (!entry || entry.stamp !== stamp) entry = { stamp, ranges: [], roots: new Set() };
    FILES.delete(abs);
    entry.roots.add(root);
    if (entry.ranges.length < RANGES_PER_FILE) entry.ranges.push({ ...range, sha256: hashLines(lines, range) });
    FILES.set(abs, entry);
    if (FILES.size > FILE_LIMIT) FILES.delete(FILES.keys().next().value);
  };
  for (const row of packet.rows) {
    if (row?.status !== 'read' || !row.actualRange || typeof row.path !== 'string') continue;
    // Which symbol read served a range: the parts one read returned are the roles its capability passes through.
    const read = row.symbol ? `${row.path}:L${row.actualRange.startLine}-L${row.actualRange.endLine}` : null;
    add(row.path, {
      startLine: row.actualRange.startLine,
      endLine: row.actualRange.endLine,
      ...(row.symbol ? { symbol: row.symbol, read } : {}),
    });
    // The context a symbol read returned was served too: a caller's guard, a constructor, a callee.
    for (const part of Array.isArray(row.context) ? row.context : []) {
      if (typeof part?.path !== 'string' || !Number.isSafeInteger(part.startLine) || !Number.isSafeInteger(part.endLine)) continue;
      add(part.path, { startLine: part.startLine, endLine: part.endLine, symbol: part.symbol, role: part.role, ...(read ? { read } : {}), ...(part.byName ? { byName: true } : {}) });
    }
  }
}

/** The entry's ranges whose lines are unchanged; re-hashes only when the file's stamp moved. */
function currentRanges(abs, entry) {
  const stamp = stampOf(abs);
  if (stamp === entry.stamp) return entry.ranges;
  const lines = stamp ? linesOf(abs) : null;
  entry.ranges = lines ? entry.ranges.filter((range) => hashLines(lines, range) === range.sha256) : [];
  entry.stamp = stamp;
  return entry.ranges;
}

const posix = (path) => path.split(sep).join('/');
const inside = (rel) => rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);

/**
 * Repository-relative `/` path -> ranges read inside `rootPath` whose lines are
 * unchanged; empty when none. A file read with `rootPath` at a folder inside the
 * repository is also listed under the path the server cited there (when no file
 * at the root has that path); `readPath` maps it back.
 */
export function sessionReads(rootPath) {
  const reads = new Map();
  const cited = new Map();
  Object.defineProperty(reads, 'cited', { value: cited, enumerable: false });
  const root = realRoot(rootPath);
  if (!root) return reads;
  for (const [abs, entry] of FILES) {
    const rel = relative(root, abs);
    if (!inside(rel)) continue;
    const ranges = currentRanges(abs, entry);
    if (ranges.length === 0) {
      FILES.delete(abs);
      continue;
    }
    reads.set(posix(rel), ranges);
    for (const readRoot of entry.roots) {
      const alias = posix(relative(readRoot, abs));
      if (readRoot !== root && inside(relative(readRoot, abs)) && !cited.has(alias)) cited.set(alias, posix(rel));
    }
  }
  for (const [alias, path] of cited) {
    if (reads.has(alias)) cited.delete(alias);
    else reads.set(alias, reads.get(path));
  }
  return reads;
}

/** The repository path a cited path names in `reads`: itself, or the file a sub-root read cited that way. */
export function readPath(reads, path) {
  return reads?.cited?.get(path) ?? path;
}

/** Forgets every recorded read; tests only. */
export function resetSessionReads() {
  FILES.clear();
}
