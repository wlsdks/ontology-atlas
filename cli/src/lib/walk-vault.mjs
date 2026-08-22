import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'out',
  'build',
  'dist',
  '.serena',
]);

/** Absolute paths of every .md under the vault root; dotfiles and build-artifact folders are skipped. */
export function walkMd(rootPath) {
  const out = [];
  const stack = [rootPath];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(join(dir, entry.name));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(join(dir, entry.name));
      }
    }
  }
  return out;
}

export function pathToSlug(rootPath, filePath) {
  // NFC normalisation. macOS hands back NFD filenames while a user types NFC
  // references; the characters look identical but the bytes differ, so every edge
  // into such a node used to end up dangling (details on the same function in
  // `mcp/src/vault.mjs`). Only the identifier is normalised — the path on disk is
  // left as it is.
  return relative(rootPath, filePath)
    .replace(/\\/g, '/')
    .replace(/\.md$/, '')
    .normalize('NFC');
}
