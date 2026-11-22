import { getTauriInvoke } from './tauri-vault-runtime';

export interface NativeVaultStamp {
  relativePath: string;
  lastModified: number;
  /** Bytes, carried with the mtime: the library list shows it, and asking separately walks twice. */
  size: number;
}

/** Paths, mtimes and sizes only, in one call; `null` outside Tauri, which has no batch API. */
export async function nativeVaultFingerprint(
  rootPath: string,
): Promise<{ entries: NativeVaultStamp[]; truncated: boolean; prunedDirs: string[] } | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke('vault_fingerprint', { rootPath });
}

/** Native so a 20 MB scan never crosses IPC to produce 64 characters; the web uses `crypto.subtle`. */
export async function nativeVaultFileHashes(
  rootPath: string,
  relativePaths: readonly string[],
): Promise<Map<string, string> | null> {
  const results = await nativeVaultFileHashResults(rootPath, relativePaths);
  if (!results) return null;
  const out = new Map<string, string>();
  for (const [path, sha256] of results) if (sha256) out.set(path, sha256);
  return out;
}

/** Every asked path with its sha256, or `null` for a file the app could not open. */
export async function nativeVaultFileHashResults(
  rootPath: string,
  relativePaths: readonly string[],
): Promise<Map<string, string | null> | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  const rows = await invoke<Array<{ relativePath: string; sha256: string | null }>>(
    'hash_vault_files',
    { rootPath, relativePaths: [...relativePaths] },
  );
  return new Map(rows.map((row) => [row.relativePath, row.sha256 || null] as const));
}
