import { readdirSync, lstatSync } from './confinement/confined-source-fs.mjs';
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
 * Java and Kotlin files yield file edges only: module grouping, drift
 * reconciliation and `listSourceFiles` keep to `SOURCE_EXT`.
 */
export const JVM_SOURCE_EXTENSIONS = new Set(['.java', '.kt']);

export const IMPORT_SCAN_EXTENSIONS = new Set([...SOURCE_EXT, ...JVM_SOURCE_EXTENSIONS]);

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

export function walk(directory, ignore, out, maxFiles, extensions = SOURCE_EXT) {
  if (out.length >= maxFiles) return;
  let entries;
  try {
    entries = readdirSync(directory).sort();
  } catch {
    return;
  }
  for (const name of entries) {
    if (ignore.has(name)) continue;
    if (name.startsWith('.') && name !== '.') continue;
    const p = join(directory, name);
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
      walk(p, ignore, out, maxFiles, extensions);
      if (out.length >= maxFiles) return;
    } else if (st.isFile()) {
      const dot = name.lastIndexOf('.');
      if (dot < 0) continue;
      const ext = name.slice(dot);
      if (extensions.has(ext)) {
        out.push(p);
        if (out.length >= maxFiles) return;
      }
    }
  }
}

export function isIgnoredPath(filePath, ignore) {
  return filePath.split(/[\\/]/).some((segment) => ignore.has(segment));
}
