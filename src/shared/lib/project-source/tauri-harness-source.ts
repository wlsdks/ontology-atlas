import { invoke, isTauri } from '@tauri-apps/api/core';

import { codedFailure } from '@/shared/lib/failures/failure-code';

interface HarnessSourceEntry {
  name: string;
  kind: 'file' | 'directory';
}

interface HarnessSourceText {
  text: string;
  lastModified: number;
  bytes: number;
}

function requireBridge(): void {
  if (!isTauri()) throw codedFailure('harness-bridge-unavailable');
}

export async function listHarnessSourceDirectory(
  vaultPath: string,
  projectSlug: string,
  relativePath: string,
): Promise<HarnessSourceEntry[]> {
  requireBridge();
  return invoke<HarnessSourceEntry[]>('list_harness_source_directory', {
    vaultPath,
    projectSlug,
    relativePath,
  });
}

export async function readHarnessSourceText(
  vaultPath: string,
  projectSlug: string,
  relativePath: string,
): Promise<HarnessSourceText> {
  requireBridge();
  return invoke<HarnessSourceText>('read_harness_source_text', {
    vaultPath,
    projectSlug,
    relativePath,
  });
}

export async function harnessSourcePathExists(
  vaultPath: string,
  projectSlug: string,
  relativePath: string,
): Promise<boolean> {
  requireBridge();
  return invoke<boolean>('harness_source_path_exists', { vaultPath, projectSlug, relativePath });
}
