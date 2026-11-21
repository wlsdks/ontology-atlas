import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';
import { vaultIndexPreference } from './tauri-vault-index';

/**
 * Per-file results the installed app computed before, kept in its derived index
 * (`rows.sqlite`, `src-tauri/crates/vault-index/src/rows.rs`), so a reopen reads only the files
 * that changed. Rust hands a row back only while its file's stamp still matches the disk. The web
 * has no index and the search switch turned off means none exists: both answer `null`.
 *
 * Both commands take one UTF-8 body of `\n`-separated lines, so 50,000 values cross the bridge
 * without being escaped into a JSON string first; the answer is one JSON document.
 */

export interface VaultRowsAnswer {
  hits: Array<[number, unknown]>;
  misses: Array<[number, string]>;
  stored: number;
  found: number;
  otherVersions: number;
}

export interface VaultRowWrite {
  path: string;
  token: string;
  lastModified: number;
  value: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A path holding a line break cannot be framed, so its file is always read. */
export function isFramedVaultRowPath(path: string): boolean {
  return !path.includes('\n');
}

export function vaultRowsAvailable(): boolean {
  return typeof window !== 'undefined' && isTauri() && vaultIndexPreference.read() === 'on';
}

function isAnswer(value: unknown): value is VaultRowsAnswer {
  const answer = value as VaultRowsAnswer | null;
  return (
    typeof answer === 'object' &&
    answer !== null &&
    Array.isArray(answer.hits) &&
    Array.isArray(answer.misses) &&
    typeof answer.stored === 'number' &&
    typeof answer.found === 'number' &&
    typeof answer.otherVersions === 'number'
  );
}

function decodeAnswer(raw: unknown): VaultRowsAnswer {
  const text =
    typeof raw === 'string'
      ? raw
      : decoder.decode(raw instanceof ArrayBuffer ? new Uint8Array(raw) : (raw as Uint8Array));
  const answer: unknown = JSON.parse(text);
  if (!isAnswer(answer)) throw new Error('vault rows: the answer has no hits and misses');
  return answer;
}

export async function getVaultRows(
  rootPath: string,
  namespace: string,
  paths: readonly string[],
): Promise<VaultRowsAnswer | null> {
  if (!vaultRowsAvailable() || !isFramedVaultRowPath(rootPath)) return null;
  const body = encoder.encode([rootPath, namespace, ...paths].join('\n'));
  return decodeAnswer(await tauriInvoke<unknown>('vault_index_rows_get', body));
}

/**
 * Keeps `rows`; Rust checks each against the disk again and refuses one whose file changed. With
 * `retain` (every Markdown path of a complete walk) rows of files no longer listed go too.
 */
export async function putVaultRows(
  rootPath: string,
  namespace: string,
  rows: readonly VaultRowWrite[],
  retain: readonly string[] | null,
): Promise<void> {
  if (!vaultRowsAvailable() || !isFramedVaultRowPath(rootPath)) return;
  const lines = [rootPath, namespace, retain ? String(retain.length) : '-', ...(retain ?? [])];
  for (const row of rows) lines.push(row.path, row.token, String(row.lastModified), row.value);
  await tauriInvoke('vault_index_rows_put', encoder.encode(lines.join('\n')));
}
