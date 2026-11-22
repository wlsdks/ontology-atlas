import type { VaultSourceFile } from '../../model/vault-manifest';
import type { BuiltVaultEntry } from './md-entry';
import { nameOf } from './vault-paths';

/** `'sources/plan.PDF'` → `'pdf'`; a name with no extension yields `''`. */
export function vaultSourceFormat(name: string): string {
  const at = name.lastIndexOf('.');
  return at > 0 ? name.slice(at + 1).toLowerCase() : '';
}

/** The manifest record of a raw source: stamps only, never its bytes read. */
export function vaultSourceFile(entry: BuiltVaultEntry): VaultSourceFile {
  return {
    path: entry.relativePath,
    name: nameOf(entry.relativePath),
    format: vaultSourceFormat(entry.relativePath),
    bytes: entry.bytes ?? 0,
    mtime: entry.lastModified,
  };
}
