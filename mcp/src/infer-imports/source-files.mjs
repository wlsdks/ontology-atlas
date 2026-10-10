import { readdirSync, lstatSync } from '../confined-source-fs.mjs';
import { join } from 'node:path';

export const DEFAULT_IGNORE = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  'build',
  '.next',
  '.expo',
  '.turbo',
  '.cache',
  'coverage',
]);

export const RUST_SOURCE_EXTENSION = '.rs';

export const SOURCE_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.py',
  RUST_SOURCE_EXTENSION,
]);

/**
 * Source files (absolute paths) through the import walker and ignore set, so
 * callers such as validate_vault's reconcile skip node_modules, .git, dist and
 * dotfiles and stay bounded.
 *
 * @param {string} rootPath
 * @param {number} [maxFiles=4000]
 * @returns {string[]} absolute source-file paths
 */
export function listSourceFiles(rootPath, maxFiles = 4000) {
  const out = [];
  walk(rootPath, DEFAULT_IGNORE, out, maxFiles);
  return out;
}

export function walk(dir, ignore, out, maxFiles) {
  if (out.length >= maxFiles) return;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (ignore.has(name)) continue;
    if (name.startsWith('.') && name !== '.') continue;
    const p = join(dir, name);
    let st;
    try {
      st = lstatSync(p);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) {
      continue;
    }
    if (st.isDirectory()) {
      walk(p, ignore, out, maxFiles);
      if (out.length >= maxFiles) return;
    } else if (st.isFile()) {
      const dot = name.lastIndexOf('.');
      if (dot < 0) continue;
      const ext = name.slice(dot);
      if (SOURCE_EXT.has(ext)) {
        out.push(p);
        if (out.length >= maxFiles) return;
      }
    }
  }
}

export function isIgnoredPath(filePath, ignore) {
  return filePath.split(/[\\/]/).some((segment) => ignore.has(segment));
}
