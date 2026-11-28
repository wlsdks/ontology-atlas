import { useMemo } from 'react';
import { useDataSourceMode } from '@/entities/vault-session';
import { useLocalVault } from '@/entities/vault-session';
import { deriveProjectsFromVault } from '@/entities/docs-vault';
import type { Project } from '@/entities/project';
import type { DataSourceMode } from '@/shared/lib/vault-folder/data-source-mode';

export interface UseProjectsState {
  projects: Project[];
  loaded: boolean;
  error: string | null;
  mode: DataSourceMode;
}

const NO_PROJECTS: Project[] = [];

export function useProjects(): UseProjectsState {
  const mode = useDataSourceMode();
  const vault = useLocalVault();

  const localProjects = useMemo(() => {
    if (mode !== 'local' || !vault.manifest) return NO_PROJECTS;
    return deriveProjectsFromVault(vault.manifest);
  }, [mode, vault.manifest]);

  if (mode === 'local') {
    return {
      projects: localProjects,
      loaded: vault.status === 'loaded',
      error: null,
      mode,
    };
  }
  // With no folder open nothing is on its way, so the empty list is final.
  return { projects: NO_PROJECTS, loaded: true, error: null, mode };
}
