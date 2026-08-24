import { relative } from 'node:path';

/**
 * Decides whether `init` may write agent config into the directory the command was run from.
 *
 * ⚠️ **Measured damage, 2026-08-24.** Running `init <somewhere-else>` from this repository rewrote
 * *this repository's* `.mcp.json` and `.codex/config.toml` to point at the scratch vault. Nothing
 * asked, nothing warned. The only guard was "cwd is not the target", which is true for every
 * unrelated directory on the disk.
 *
 * The cwd write exists for one real flow: *"I am standing in my project, put a vault inside it."*
 * There, cwd is the codebase the vault describes, and wiring its agent config is the whole point.
 * When the vault lands **outside** cwd, that premise is gone — cwd is merely where the person
 * happened to stand, and repointing its agents at an unrelated vault is a silent edit to a project
 * this command was never asked to touch.
 *
 * So containment, not difference, is the condition: write cwd's config only when the vault is inside
 * cwd. The vault's own config is always written and is unaffected by this.
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
