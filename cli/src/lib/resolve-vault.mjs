import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export class VaultRootError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VaultRootError';
  }
}

/**
 * **Vault root resolution order**, shared by the graph-level read commands
 * (list / query / path / orphans / backlinks / find / validate).
 *
 *  1. an `explicit` value from the caller (positional argument or `--vault path`)
 *     that is not the default (`.` or empty) → use it as given
 *  2. the `OATLAS_VAULT` environment variable, when set → that path
 *  3. a `docs/ontology/` directory in cwd → that, so a repository dogfooding
 *     itself resolves to its canonical vault even when a build mirror
 *     (`public/docs-vault/`) or `cli/templates/` also sits under cwd
 *  4. final fallback: cwd
 *
 * Always returns an absolute path.
 */
export function resolveVaultRoot(explicit) {
  // 1) explicit user choice wins
  if (typeof explicit === 'string' && explicit && explicit !== '.') {
    const root = resolve(process.cwd(), explicit);
    assertVaultDirectory(root);
    return root;
  }

  // 2) OATLAS_VAULT env — same convention as the MCP server
  const env = process.env.OATLAS_VAULT;
  if (typeof env === 'string' && env.length > 0) {
    const root = resolve(process.cwd(), env);
    assertVaultDirectory(root);
    return root;
  }

  // 3) a docs/ontology directory in cwd — auto-detects a repository dogfooding itself
  const candidate = resolve(process.cwd(), 'docs/ontology');
  if (isDirectory(candidate)) return candidate;

  // 4) fallback — cwd
  return process.cwd();
}

function assertVaultDirectory(path) {
  if (!existsSync(path)) {
    throw new VaultRootError(`Vault root not found: ${path}`);
  }
  if (!isDirectory(path)) {
    throw new VaultRootError(`Vault root is not a directory: ${path}`);
  }
}

function isDirectory(path) {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}
