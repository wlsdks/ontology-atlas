'use client';

import { useMemo } from 'react';
import { useDataSourceMode } from '@/entities/vault-session';
import { useLocalVault } from '@/entities/vault-session';
import { useStaticVaultSource } from '@/entities/vault-session';
import { deriveProjectsFromVault } from '@/entities/docs-vault';
import type { Project } from '@/entities/project';

/** Mode-aware projects: the vault manifest locally, the chosen bundled sample otherwise. */
export interface UseProjectsState {
  projects: Project[];
  loaded: boolean;
  error: string | null;
  mode: 'static' | 'local';
}

export function useProjects(): UseProjectsState {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  // A module constant, so the reference is stable in dependency arrays.
  const staticSource = useStaticVaultSource();

  const localProjects = useMemo(() => {
    if (mode !== 'local' || !vault.manifest) return [];
    return deriveProjectsFromVault(vault.manifest);
  }, [mode, vault.manifest]);

  const staticProjects = useMemo(() => {
    if (mode !== 'static') return [];
    return deriveProjectsFromVault(staticSource.manifest);
  }, [mode, staticSource.manifest]);

  if (mode === 'local') {
    return {
      projects: localProjects,
      loaded: vault.status === 'loaded',
      error: null,
      mode,
    };
  }
  return {
    projects: staticProjects,
    loaded: true,
    error: null,
    mode,
  };
}
