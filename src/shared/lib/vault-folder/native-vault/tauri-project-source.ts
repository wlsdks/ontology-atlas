import { getTauriInvoke } from './tauri-vault-runtime';

export interface ProjectSourceInspection {
  rootPath: string;
  sourceId: string;
  kind: 'git' | 'folder';
  revision: string;
  fingerprint: string;
  dirty: boolean | null;
  truncated: boolean;
  files: string[];
}
export interface ProjectSourceContinuityInspection extends ProjectSourceInspection {
  scope: 'meaning-transition-continuity-v1';
  exclusions: { target: string | null; archivePrefix: string | null };
}

/** `vaultRoot` inside the source is left out of the probe, as the MCP probe does, so the vault's own writes never stale its receipt. */
export async function inspectTauriProjectSource(
  rootPath: string,
  vaultRoot?: string | null,
): Promise<ProjectSourceInspection | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke<ProjectSourceInspection>('inspect_project_source', { rootPath, vaultRoot: vaultRoot ?? null });
}

/** Fixed V4 continuity probe; callers name a vault slug, never arbitrary exclusion paths. */
export async function inspectTauriProjectSourceContinuity(input: {
  sourceRoot: string;
  vaultRoot: string;
  targetSlug: string;
}): Promise<ProjectSourceContinuityInspection | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke<ProjectSourceContinuityInspection>('inspect_project_source_continuity', input);
}

export async function pickTauriSourceDirectory(dialogTitle?:string):Promise<string|null> {
  const invoke=getTauriInvoke();
  return invoke?invoke<string|null>('pick_source_directory',dialogTitle?{dialogTitle}:undefined):null;
}
