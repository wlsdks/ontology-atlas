'use client';

import { useMemo } from 'react';
import { useDataSourceMode } from '@/entities/vault-session';
import { useLocalVault } from '@/entities/vault-session';
import { useStaticVaultSource, useStaticVaultStatus } from '@/entities/vault-session';
import { deriveProjectsFromVault } from '@/entities/docs-vault';
import type { Project } from '@/entities/project';

/** Mode-aware projects: the vault manifest locally, the chosen bundled sample otherwise. */
export interface UseProjectsState {
  projects: Project[];
  loaded: boolean;
  error: string | null;
  mode: 'static' | 'local';
}

/** `demand: false` reads whatever sample is already there without starting its download (a closed palette). */
export function useProjects(options?: { demand?: boolean }): UseProjectsState {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  // Stable between renders, so it is safe in dependency arrays.
  const staticSource = useStaticVaultSource(undefined, options);
  const staticStatus = useStaticVaultStatus(undefined, options);

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
    // A sample still on its way is not an empty list: a screen that reads `loaded` must not call the project missing.
    loaded: staticStatus !== 'loading',
    error: null,
    mode,
  };
}
