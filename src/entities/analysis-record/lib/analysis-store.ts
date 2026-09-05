import { appendTauriAnalysisRecord, canAppendAnalysisRecords, readTauriAnalysisRecord } from '@/shared/lib/tauri-analysis-records';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';

import {
  MAX_ANALYSIS_RECORD_BYTES,
  analysisRecordFileName,
  isAnalysisRecordFileName,
  parseAnalysisRecord,
  serializeAnalysisRecord,
  verifyAnalysisEvidence,
  type AnalysisRecord,
} from '../model/analysis-record.mts';

export interface AnalysisHistoryPage {
  records: AnalysisRecord[];
  problems: Array<{ fileName: string; reason: string }>;
  totalFiles: number;
  scanned: number;
  nextCursor: string | null;
}

type DirectoryEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

async function archiveDirectory(handle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle | null> {
  try {
    const sidecar = await handle.getDirectoryHandle('.ontology-atlas');
    return await sidecar.getDirectoryHandle('analyses');
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null;
    // The native FSA adapter preserves filesystem absence as an English error.
    if (error instanceof Error && /not found|no such file/i.test(error.message)) return null;
    throw error;
  }
}

export async function readAnalysisHistory(
  handle: FileSystemDirectoryHandle,
  { limit = 30, cursor = null }: { limit?: number; cursor?: string | null } = {},
): Promise<AnalysisHistoryPage> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('History page limit must be between 1 and 100.');
  if (cursor !== null && !isAnalysisRecordFileName(cursor)) throw new Error('Invalid analysis history cursor.');
  const directory = await archiveDirectory(handle);
  if (!directory) return { records: [], problems: [], totalFiles: 0, scanned: 0, nextCursor: null };
  const names: string[] = [];
  for await (const [name, entry] of (directory as DirectoryEntries).entries()) {
    if (entry.kind === 'file' && isAnalysisRecordFileName(name)) names.push(name);
  }
  names.sort().reverse();
  const remaining = cursor ? names.filter((name) => name < cursor) : names;
  const page = remaining.slice(0, limit);
  const records: AnalysisRecord[] = [];
  const problems: AnalysisHistoryPage['problems'] = [];
  const nativeRoot = getTauriVaultRootPath(handle);
  for (const fileName of page) {
    try {
      let markdown: string;
      if (nativeRoot) {
        markdown = await readTauriAnalysisRecord(nativeRoot, fileName);
      } else {
        const file = await (await directory.getFileHandle(fileName)).getFile();
        if (file.size > MAX_ANALYSIS_RECORD_BYTES) throw new Error('Analysis record exceeds the supported byte budget.');
        markdown = await file.text();
      }
      const record = parseAnalysisRecord(markdown);
      if (analysisRecordFileName(record) !== fileName) throw new Error('Analysis file identity does not match its metadata.');
      if (record.recordType === 'run') {
        const problems = await verifyAnalysisEvidence(record);
        if (problems.length) throw new Error(`Analysis evidence integrity failed: ${problems.join(', ')}`);
      }
      records.push(record);
    } catch (error) {
      problems.push({ fileName, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { records, problems, totalFiles: names.length, scanned: page.length, nextCursor: remaining.length > page.length ? page.at(-1) ?? null : null };
}

export function analysisArchiveWritable(handle: FileSystemDirectoryHandle | null, writable: boolean): boolean {
  return writable && !!handle && !!getTauriVaultRootPath(handle) && canAppendAnalysisRecords();
}

/** The handle is captured when the request starts; callers must never substitute a later vault. */
export async function appendAnalysisRecord(
  capturedHandle: FileSystemDirectoryHandle,
  record: AnalysisRecord,
  writable: boolean,
): Promise<{ fileName: string; created: boolean }> {
  if (!analysisArchiveWritable(capturedHandle, writable)) throw new Error('A writable ontology folder in the installed app is required.');
  const rootPath = getTauriVaultRootPath(capturedHandle)!;
  const result = await appendTauriAnalysisRecord(rootPath, analysisRecordFileName(record), serializeAnalysisRecord(record));
  window.dispatchEvent(new Event('atlas-analysis-records-changed'));
  return result;
}
