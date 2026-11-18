/**
 * The source lines this server served through `analyze_repo_structure`
 * sourceReads, each file with the line ranges and symbols read. Outlines are not
 * reads. The depth check asks this record, not a node's wording, which lines were
 * read.
 *
 * Over stdio one server process serves one client connection, and the transport
 * carries no session id, so the process is the session: a restarted server has
 * no record and says so. Files are keyed by their real absolute path, so a read
 * made with `rootPath` at a package folder counts for the repository it sits in
 * and the other way round. Each file keeps the size and mtime it had when read;
 * once either changes, its ranges no longer count.
 */

import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

const FILES = new Map();
const FILE_LIMIT = 20_000;
const RANGES_PER_FILE = 256;

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
    return stat.isFile() ? `${stat.size}:${stat.mtimeMs}` : null;
  } catch {
    return null;
  }
}

/** Records every delivered line range, symbol read and context part in a `sourceEvidence:v1` packet. */
export function recordSourceEvidence(rootPath, packet) {
  if (!packet || !Array.isArray(packet.rows)) return;
  const root = realRoot(rootPath);
  if (!root) return;
  const add = (path, range) => {
    if (typeof path !== 'string' || !path || isAbsolute(path) || path.split('/').includes('..')) return;
    const abs = join(root, ...path.split('/'));
    const stamp = stampOf(abs);
    if (!stamp) return;
    let entry = FILES.get(abs);
    if (!entry || entry.stamp !== stamp) entry = { stamp, ranges: [] };
    FILES.delete(abs);
    if (entry.ranges.length < RANGES_PER_FILE) entry.ranges.push(range);
    FILES.set(abs, entry);
    if (FILES.size > FILE_LIMIT) FILES.delete(FILES.keys().next().value);
  };
  for (const row of packet.rows) {
    if (row?.status !== 'read' || !row.actualRange || typeof row.path !== 'string') continue;
    add(row.path, {
      startLine: row.actualRange.startLine,
      endLine: row.actualRange.endLine,
      ...(row.symbol ? { symbol: row.symbol } : {}),
    });
    // The context a symbol read returned was served too: a caller's guard, a constructor, a callee.
    for (const part of Array.isArray(row.context) ? row.context : []) {
      if (typeof part?.path !== 'string' || !Number.isSafeInteger(part.startLine) || !Number.isSafeInteger(part.endLine)) continue;
      add(part.path, { startLine: part.startLine, endLine: part.endLine, symbol: part.symbol, role: part.role });
    }
  }
}

/** Repository-relative `/` path -> ranges read inside `rootPath` and still current; empty when none. */
export function sessionReads(rootPath) {
  const reads = new Map();
  const root = realRoot(rootPath);
  if (!root) return reads;
  for (const [abs, entry] of FILES) {
    const rel = relative(root, abs);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) continue;
    if (stampOf(abs) !== entry.stamp) {
      FILES.delete(abs);
      continue;
    }
    reads.set(rel.split(sep).join('/'), entry.ranges);
  }
  return reads;
}

/** Forgets every recorded read; tests only. */
export function resetSessionReads() {
  FILES.clear();
}
