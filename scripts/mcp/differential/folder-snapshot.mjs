// A folder read as the harness compares it after a case: every entry's kind, permission bits and
// bytes, and for a file that started with a planted time whether it still has it. Other times are
// left out on purpose: the time the system gives a file a server wrote is the one value two runs
// cannot share; the answers are checked for it separately.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import path from 'node:path';

/**
 * @param {string} root
 * @param {{ planted?: Map<string, number>, prefix?: string, skip?: (relative: string) => boolean }} [options]
 *   `planted` maps a path under `root` to the time the harness planted on it; `prefix` is put in
 *   front of every key so several roots share one map; `skip` leaves a top-level entry out.
 * @returns {Map<string, { kind: string, mode?: number, sha?: string, size?: number, link?: string, text?: string, timeKept?: boolean }>}
 */
export function snapshotFolder(root, { planted, prefix = '', skip } = {}) {
  const entries = new Map();
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(root, full);
      if (skip?.(relative)) continue;
      // A real repository's own bookkeeping (index, locks) is not the vault; commits are compared by hash.
      if (entry.name === '.git' && existsSync(path.join(full, 'HEAD'))) continue;
      const info = lstatSync(full);
      const key = `${prefix}${relative}`;
      if (info.isSymbolicLink()) {
        entries.set(key, { kind: 'symlink', link: readlinkSync(full) });
      } else if (info.isDirectory()) {
        entries.set(key, { kind: 'dir', mode: info.mode & 0o777 });
        visit(full);
      } else {
        let bytes;
        try {
          bytes = readFileSync(full);
        } catch (error) {
          // A file a case made unreadable on purpose is still part of what two servers must leave alike.
          entries.set(key, { kind: 'file', mode: info.mode & 0o777, unreadable: String(error.code ?? error) });
          continue;
        }
        const plantedAt = planted?.get(relative);
        entries.set(key, {
          kind: 'file',
          mode: info.mode & 0o777,
          size: bytes.length,
          sha: createHash('sha256').update(bytes).digest('hex'),
          text: bytes.length <= 262_144 ? bytes.toString('latin1') : undefined,
          ...(plantedAt === undefined ? {} : { timeKept: plantedAt === info.mtimeMs }),
        });
      }
    }
  };
  visit(root);
  return entries;
}

/** Entries that differ between two snapshots: `{ path, change, a, b }`, sorted by path. */
export function diffSnapshots(a, b) {
  const differences = [];
  for (const name of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const left = a.get(name);
    const right = b.get(name);
    if (!left) differences.push({ path: name, change: 'only-in-b', a: undefined, b: right });
    else if (!right) differences.push({ path: name, change: 'only-in-a', a: left, b: undefined });
    else if (left.kind !== right.kind) differences.push({ path: name, change: 'kind', a: left, b: right });
    else if (left.kind === 'file' && left.sha !== right.sha) differences.push({ path: name, change: 'bytes', a: left, b: right });
    else if (left.kind === 'file' && left.mode !== right.mode) differences.push({ path: name, change: 'mode', a: left, b: right });
    else if (left.kind === 'file' && left.timeKept !== right.timeKept) differences.push({ path: name, change: 'time-kept', a: left, b: right });
    else if (left.kind === 'symlink' && left.link !== right.link) differences.push({ path: name, change: 'link', a: left, b: right });
  }
  return differences;
}
