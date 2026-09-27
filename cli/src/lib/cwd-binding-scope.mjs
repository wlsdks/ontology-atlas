import { relative } from 'node:path';

/**
 * Decides whether `init` may write agent config into the directory it ran from: only when the vault is
 * inside cwd, where cwd is the codebase the vault describes. Outside, cwd is merely where the person
 * stood, and repointing its `.mcp.json` and `.codex/config.toml` would silently edit an unrelated project.
 *
 * @param {string} cwdPath canonical (realpath) directory the command ran in
 * @param {string} vaultPath canonical (realpath) directory the vault was created in
 * @returns {{ write: boolean, relativeVault: string | null, reason: 'same' | 'inside' | 'outside' }}
 */
export function cwdBindingScope(cwdPath, vaultPath) {
  if (cwdPath === vaultPath) {
    // The vault *is* cwd; its own config already covers this directory.
    return { write: false, relativeVault: null, reason: 'same' };
  }
  const rel = relative(cwdPath, vaultPath);
  // `..` means the path climbs out of cwd; an absolute result means another root entirely (a
  // different drive on Windows). Neither is "a vault inside my project".
  const escapes = rel === '' || rel.startsWith('..') || /^([a-zA-Z]:)?[/\\]/.test(rel);
  if (escapes) {
    return { write: false, relativeVault: null, reason: 'outside' };
  }
  return { write: true, relativeVault: rel.startsWith('.') ? rel : `./${rel}`, reason: 'inside' };
}
