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
 *
 * A symbol read also keeps what the server listed for it beyond what it served:
 * its callees, the parts the budget left out, and the rest of a declaration the
 * read was cut inside. A check asks this record what a node's evidence left
 * unserved, so it does not depend on how the node words what it did not read.
 */

import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

const FILES = new Map();
const FILE_LIMIT = 20_000;
const RANGES_PER_FILE = 256;
// Parts one symbol read lists at most: the omitted parts and the rests of cut parts.
const LISTED_PER_READ = 32;
// Roles whose omitted part is code the read depends on; a caller or the class header is not.
const LISTED_ROLES = new Set(['callee', 'implementation', 'constructor']);
const relativePath = (path) => typeof path === 'string' && path !== '' && !isAbsolute(path) && !path.split('/').includes('..');
const lineNumber = (line) => Number.isSafeInteger(line) && line > 0;

/**
 * What a symbol read listed without serving it, as `{ name, path, line, next? }`:
 * a part that decides something and that the budget left out, and where the
 * declaration or a part it was cut inside goes on. A callee the server examined
 * and found to hold no condition is not served and not owed: it decides nothing.
 */
function listedBy(row) {
  const listed = [];
  const push = (item) => {
    if (listed.length < LISTED_PER_READ && typeof item.name === 'string' && item.name && relativePath(item.path) && lineNumber(item.line)) listed.push(item);
  };
  for (const part of Array.isArray(row.contextOmitted) ? row.contextOmitted : []) {
    if (LISTED_ROLES.has(part?.role)) push({ name: part.symbol, path: part.path, line: part.line });
  }
  const rest = (path, symbol, next) => {
    if (next && lineNumber(next.startLine) && lineNumber(next.maxLines)) {
      push({ name: symbol, path, line: next.startLine, next: { path, startLine: next.startLine, maxLines: next.maxLines } });
    }
  };
  rest(row.path, row.symbol, row.next);
  for (const part of Array.isArray(row.context) ? row.context : []) {
    if (LISTED_ROLES.has(part?.role) && !part.byName) rest(part.path, part.symbol, part.next);
  }
  return listed;
}
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
    const same = entry.ranges.find((held) => held.startLine === range.startLine && held.endLine === range.endLine
      && held.symbol === range.symbol && held.role === range.role && held.read === range.read);
    // The same read again lists what the code holds now.
    if (same && range.listed) same.listed = range.listed;
    if (!same) {
      // A served range is always recorded: past the cap the oldest part another read served goes first, then the oldest read.
      if (entry.ranges.length >= RANGES_PER_FILE) {
        const part = entry.ranges.findIndex((held) => held.role);
        entry.ranges.splice(part >= 0 ? part : 0, 1);
      }
      entry.ranges.push({ ...range, sha256: hashLines(lines, range) });
    }
    FILES.set(abs, entry);
    if (FILES.size > FILE_LIMIT) FILES.delete(FILES.keys().next().value);
  };
  for (const row of packet.rows) {
    if (row?.status === 'refused') noteRefusal(root, row);
    if (row?.status !== 'read' || !row.actualRange || typeof row.path !== 'string') continue;
    // Which symbol read served a range: the parts one read returned are the roles its capability passes through.
    const read = row.symbol ? `${row.path}:L${row.actualRange.startLine}-L${row.actualRange.endLine}` : null;
    add(row.path, {
      startLine: row.actualRange.startLine,
      endLine: row.actualRange.endLine,
      ...(row.symbol ? { symbol: row.symbol, read, listed: listedBy(row) } : {}),
    });
    // The context a symbol read returned was served too: a caller's guard, a constructor, a callee.
    for (const part of Array.isArray(row.context) ? row.context : []) {
      if (typeof part?.path !== 'string' || !Number.isSafeInteger(part.startLine) || !Number.isSafeInteger(part.endLine)) continue;
      add(part.path, { startLine: part.startLine, endLine: part.endLine, symbol: part.symbol, role: part.role, ...(read ? { read } : {}), ...(part.byName ? { byName: true } : {}) });
    }
  }
}

/*
 * The reads this server refused for a reason that lasts while the file
 * is unchanged (an encoding, a size, a binary file, a path it never opens), so
 * a check that asks for the read can accept the server's own reason instead.
 * A budget or a file changing mid-read is not lasting: that read can be retried.
 */
const REFUSED = new Map();
const PASSING_REASONS = new Set(['file_changed', 'hash_mismatch', 'aggregate_text_budget', 'serialized_budget', 'range_beyond_eof']);
const REFUSED_PER_FILE = 64;

/** A file's size, mtime and inode, or 'missing': a refusal holds while this is unchanged. */
function refusalStamp(abs) {
  try {
    const stat = statSync(abs);
    return `${stat.size}:${stat.mtimeMs}:${stat.ino}`;
  } catch {
    return 'missing';
  }
}

/** A refused read by what it asked for: its symbol, or `L<start>` for lines from there. */
function refusalKey(row) {
  if (typeof row.symbol === 'string' && row.symbol) return row.symbol;
  return row.mode !== 'outline' && lineNumber(row.requestedRange?.startLine) ? `L${row.requestedRange.startLine}` : null;
}

function noteRefusal(root, row) {
  const { path, reason } = row;
  const symbol = refusalKey(row);
  if (!symbol || typeof path !== 'string' || !path || typeof reason !== 'string' || PASSING_REASONS.has(reason)) return;
  const key = `${root}\0${path}`;
  const stamp = isAbsolute(path) || path.split('/').includes('..') ? 'outside' : refusalStamp(join(root, ...path.split('/')));
  let entry = REFUSED.get(key);
  if (!entry || entry.stamp !== stamp) entry = { root, path, stamp, symbols: new Map() };
  REFUSED.delete(key);
  entry.symbols.delete(symbol);
  entry.symbols.set(symbol, reason);
  if (entry.symbols.size > REFUSED_PER_FILE) entry.symbols.delete(entry.symbols.keys().next().value);
  REFUSED.set(key, entry);
  if (REFUSED.size > FILE_LIMIT) REFUSED.delete(REFUSED.keys().next().value);
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
  // path -> symbol, or `L<start>` for a line read -> the reason it was refused, while the file is unchanged.
  const refused = new Map();
  Object.defineProperty(reads, 'refused', { value: refused, enumerable: false });
  for (const entry of REFUSED.values()) {
    if (entry.root !== root) continue;
    const stamp = entry.stamp === 'outside' ? 'outside' : refusalStamp(join(root, ...entry.path.split('/')));
    if (stamp === entry.stamp) refused.set(entry.path, entry.symbols);
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
  REFUSED.clear();
}
