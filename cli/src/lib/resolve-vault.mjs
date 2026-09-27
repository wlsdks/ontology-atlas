import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export class VaultRootError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VaultRootError';
  }
}

/**
 * Vault root, as an absolute path: a non-default `explicit` argument, then `OATLAS_VAULT` (the variable the MCP
 * server reads), then `docs/ontology/` in cwd (so a dogfooding repository skips its build mirrors), then cwd.
 */
export function resolveVaultRoot(explicit) {
  if (typeof explicit === 'string' && explicit && explicit !== '.') {
    const root = resolve(process.cwd(), explicit);
    assertVaultDirectory(root);
    return root;
  }

  const env = process.env.OATLAS_VAULT;
  if (typeof env === 'string' && env.length > 0) {
    const root = resolve(process.cwd(), env);
    assertVaultDirectory(root);
    return root;
  }

  const candidate = resolve(process.cwd(), 'docs/ontology');
  if (isDirectory(candidate)) return candidate;

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
