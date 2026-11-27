// A folder read as the harness compares it after a case: every entry's kind, permission bits and
// bytes. Times are left out on purpose: the time the system gives a file a server wrote is the one
// value two runs cannot share; the answers are checked for it separately.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import path from 'node:path';

/** @returns {Map<string, { kind: string, mode?: number, sha?: string, size?: number, link?: string, text?: string }>} */
export function snapshotFolder(root) {
  const entries = new Map();
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(root, full);
      // A real repository's own bookkeeping (index, locks) is not the vault; commits are compared by hash.
      if (entry.name === '.git' && existsSync(path.join(full, 'HEAD'))) continue;
      const info = lstatSync(full);
      if (info.isSymbolicLink()) {
        entries.set(relative, { kind: 'symlink', link: readlinkSync(full) });
      } else if (info.isDirectory()) {
        entries.set(relative, { kind: 'dir', mode: info.mode & 0o777 });
        visit(full);
      } else {
        const bytes = readFileSync(full);
        entries.set(relative, {
          kind: 'file',
          mode: info.mode & 0o777,
          size: bytes.length,
          sha: createHash('sha256').update(bytes).digest('hex'),
          text: bytes.length <= 262_144 ? bytes.toString('latin1') : undefined,
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
    else if (left.kind === 'symlink' && left.link !== right.link) differences.push({ path: name, change: 'link', a: left, b: right });
  }
  return differences;
}

export function folderChangedBetween(before, after) {
  return diffSnapshots(before, after).map((entry) => entry.path);
}
