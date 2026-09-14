import { invoke, isTauri } from '@tauri-apps/api/core';

export interface MeaningTransitionRootIdentity {
  canonicalPath: string;
  device?: number;
  inode?: number;
}

export interface MeaningTransitionArtifactInput { digest: string; content: string }
interface MeaningTransitionArtifactResult { digest: string; fileName: string; created: boolean }
export interface MeaningTransitionAppendResult {
  recordFileName: string;
  recordCreated: boolean;
  artifacts: MeaningTransitionArtifactResult[];
}
interface MeaningTransitionHistoryEntry {
  fileName: string;
  kind: 'record' | 'malformed';
  problem: string | null;
}
export interface MeaningTransitionHistoryPage {
  entries: MeaningTransitionHistoryEntry[];
  totalMembers: number;
  nextOffset: number | null;
}

export const canArchiveMeaningTransitions = (): boolean => typeof window !== 'undefined'
  && isTauri()
  && !/Win(?:32|64)|Windows/i.test(window.navigator.platform || window.navigator.userAgent);

export async function observeMeaningTransitionRoot(rootPath: string): Promise<MeaningTransitionRootIdentity> {
  return invoke('observe_meaning_transition_root', { rootPath });
}

export async function appendTauriMeaningTransitionBundle(input: {
  rootPath: string; expectedRootIdentity: MeaningTransitionRootIdentity; recordFileName: string;
  recordContent: string; artifacts: MeaningTransitionArtifactInput[];
}): Promise<MeaningTransitionAppendResult> {
  return invoke('append_meaning_transition_bundle', input);
}

export async function readTauriMeaningTransitionRecord(
  rootPath: string, expectedRootIdentity: MeaningTransitionRootIdentity, fileName: string,
): Promise<string> {
  return invoke('read_meaning_transition_record_text', { rootPath, expectedRootIdentity, fileName });
}

export async function readTauriMeaningTransitionArtifact(
  rootPath: string, expectedRootIdentity: MeaningTransitionRootIdentity, digest: string,
): Promise<string> {
  return invoke('read_meaning_transition_artifact_text', { rootPath, expectedRootIdentity, digest });
}

export async function listTauriMeaningTransitionHistory(
  rootPath: string, expectedRootIdentity: MeaningTransitionRootIdentity, offset: number, limit: number,
): Promise<MeaningTransitionHistoryPage> {
  return invoke('list_meaning_transition_history', { rootPath, expectedRootIdentity, offset, limit });
}
