import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { VAULT_SOURCES_DIR } from './schema.mjs';

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'out',
  'build',
  'dist',
  '.serena',
]);

/** Absolute paths of every .md in the vault; dotfiles, build folders and sources/ are skipped. */
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
        if (dir === rootPath && entry.name === VAULT_SOURCES_DIR) continue;
        stack.push(join(dir, entry.name));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(join(dir, entry.name));
      }
    }
  }
  return out;
}

export function pathToSlug(rootPath, filePath) {
  // NFC normalisation: macOS returns NFD filenames while users type NFC references, so without it every
  // edge into such a node dangles (`mcp/src/vault/`). Only the identifier is normalised, never the path on disk.
  return relative(rootPath, filePath)
    .replace(/\\/g, '/')
    .replace(/\.md$/, '')
    .normalize('NFC');
}
