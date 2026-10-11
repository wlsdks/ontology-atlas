import { invoke, isTauri } from '@tauri-apps/api/core';

export function canAppendAnalysisRecords(): boolean {
  return typeof window !== 'undefined' && isTauri();
}

/** The native command owns path restriction and atomic exclusive publication. */
export async function appendTauriAnalysisRecord(
  rootPath: string,
  fileName: string,
  content: string,
): Promise<{ fileName: string; created: boolean }> {
  if (!canAppendAnalysisRecords()) throw new Error('Analysis archival requires the installed Atlas app.');
  return invoke('append_analysis_record', { rootPath, fileName, content });
}

export async function readTauriAnalysisRecord(rootPath: string, fileName: string): Promise<string> {
  if (!canAppendAnalysisRecords()) throw new Error('The native analysis reader is unavailable.');
  return invoke('read_analysis_record_text', { rootPath, fileName });
}
