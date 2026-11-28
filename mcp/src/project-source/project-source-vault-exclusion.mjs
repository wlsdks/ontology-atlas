import { realpathSync } from 'node:fs';

/** Whether `relativePath` is the excluded folder or lies under it. */
export function isExcluded(relativePath, excluded) {
  return excluded !== null && (relativePath === excluded || relativePath.startsWith(`${excluded}/`));
}

/**
 * One absolute path as forward-slash text: the `\\?\` verbatim prefix dropped, the
 * drive letter lower-cased, no trailing separator, so a Windows path and its
 * canonical form compare equal.
 */
function comparablePath(path) {
  let unified = path.replaceAll('\\', '/');
  if (unified.startsWith('//?/UNC/')) unified = `//${unified.slice('//?/UNC/'.length)}`;
  else if (unified.startsWith('//?/')) unified = unified.slice('//?/'.length);
  if (/^[A-Za-z]:/.test(unified)) unified = unified[0].toLowerCase() + unified.slice(1);
  while (unified.length > 1 && unified.endsWith('/') && !unified.endsWith(':/')) unified = unified.slice(0, -1);
  return unified;
}

/**
 * The vault's folder relative to the source root when it lies strictly inside it,
 * else null. Its files are the ontology, not the code it describes, so writing the
 * vault must not make its own source binding stale. The app probe applies the same
 * rule (`src-tauri/src/project_source/mod.rs`); both sides run
 * `vault-exclusion-cases.json`.
 */
export function vaultFolderInside(sourceRoot, vaultRoot) {
  const base = comparablePath(sourceRoot);
  const vault = comparablePath(vaultRoot);
  if (!vault.startsWith(base)) return null;
  let inside = vault.slice(base.length);
  if (!base.endsWith('/')) {
    if (!inside.startsWith('/')) return null;
    inside = inside.slice(1);
  }
  if (inside === '' || inside.split('/').some((part) => part === '' || part === '.' || part === '..')) return null;
  return inside;
}

// `realpathSync.native` returns the case stored on disk, as Rust `canonicalize` does; the
// JS `realpathSync` keeps the typed case, so `/Repo` and `/repo/atlas` would not compare.
export function excludedVaultFolder(root, excludePath) {
  if (typeof excludePath !== 'string' || excludePath.length === 0) return null;
  try {
    return vaultFolderInside(realpathSync.native(root), realpathSync.native(excludePath));
  } catch {
    return null;
  }
}

/** Drops porcelain v1 `-z` entries under the excluded folder; a rename entry carries a second path. */
export function filterStatus(status, excluded) {
  if (excluded === null || status.length === 0) return status;
  const tokens = status.toString('utf8').split('\0');
  if (tokens.at(-1) === '') tokens.pop();
  const kept = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const entry = tokens[index];
    const renamed = entry[0] === 'R' || entry[0] === 'C';
    const source = renamed ? tokens[index + 1] ?? null : null;
    if (renamed) index += 1;
    if (isExcluded(entry.slice(3), excluded) && (source === null || isExcluded(source, excluded))) continue;
    kept.push(entry);
    if (source !== null) kept.push(source);
  }
  return Buffer.from(kept.length > 0 ? `${kept.join('\0')}\0` : '', 'utf8');
}
