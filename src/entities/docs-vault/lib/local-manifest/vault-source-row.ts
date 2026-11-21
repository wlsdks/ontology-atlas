import type { VaultSourceFile } from '../../model/types';
import type { BuiltVaultEntry } from './md-entry';

/** `'sources/plan.PDF'` → `'pdf'`; a name with no extension yields `''`. */
export function vaultSourceFormat(name: string): string {
  const at = name.lastIndexOf('.');
  return at > 0 ? name.slice(at + 1).toLowerCase() : '';
}

/** The manifest row of a raw source: stamps only, never its bytes read. */
export function vaultSourceRow(entry: BuiltVaultEntry): VaultSourceFile {
  return {
    path: entry.relativePath,
    name: entry.relativePath.slice(entry.relativePath.lastIndexOf('/') + 1),
    format: vaultSourceFormat(entry.relativePath),
    bytes: entry.bytes ?? 0,
    mtime: entry.lastModified,
  };
}
