import { invoke, isTauri } from '@tauri-apps/api/core';

import { codedFailure } from '@/shared/lib/failures/failure-code';

/** One read of a file in the vault's connected code folder; `src-tauri/src/code_reader/` bounds it. */
export interface CodeWindow {
  lines: string[];
  firstLine: number;
  totalLines: number;
  /** The read stopped at its byte bound before the asked line count. */
  cut: boolean;
  lastModified: number;
  bytes: number;
}

export interface CodeFileStamp {
  lastModified: number;
  bytes: number;
}

/** Rust's refusals, each a reader state; any other rejection is a read that failed. */
export const CODE_READER_REFUSALS = [
  'code-reader-not-connected',
  'code-reader-access-lost',
  'code-reader-other-system',
  'code-reader-gone',
  'code-reader-secret',
  'code-reader-outside',
  'code-reader-too-large',
  'code-reader-not-text',
] as const;
export type CodeReaderRefusal = (typeof CODE_READER_REFUSALS)[number];

/** The size above which Rust refuses a file (`CODE_FILE_MAX_BYTES`). */
export const CODE_FILE_MAX_BYTES = 2 * 1024 * 1024;
/** The most lines one read returns (`WINDOW_MAX_LINES`). */
export const CODE_WINDOW_MAX_LINES = 400;

export function codeReaderBridgeAvailable(): boolean {
  return typeof window !== 'undefined' && isTauri();
}

function requireBridge(): void {
  if (!codeReaderBridgeAvailable()) throw codedFailure('code-reader-bridge-unavailable');
}

export async function readCodeWindow(
  vaultPath: string,
  relativePath: string,
  firstLine: number,
  lineCount: number,
): Promise<CodeWindow> {
  requireBridge();
  return invoke<CodeWindow>('read_code_window', { vaultPath, relativePath, firstLine, lineCount });
}

export async function readCodeFileStamp(vaultPath: string, relativePath: string): Promise<CodeFileStamp> {
  requireBridge();
  return invoke<CodeFileStamp>('code_file_stamp', { vaultPath, relativePath });
}
