'use client';

import { useMemo } from 'react';
import { useDataSourceMode } from '@/entities/vault-session';
import { useLocalVault } from '@/entities/vault-session';
import { useStaticVaultSource } from '@/entities/vault-session';
import { deriveProjectsFromVault } from '@/entities/docs-vault';
import type { Project } from '@/entities/project';

/**
 * The mode-aware read adapter, with two modes:
 *
 * - **local**: maps the `projects/*.md` frontmatter of the vault manifest synchronously,
 *   so adding a `.md` to the vault shows up in the list immediately.
 * - **static**: the build-time bundled manifest, so a user with no vault sees the ontology
 *   at once — the read half of "zero-friction entry". Which bundled vault is decided by the
 *   user's "example business" choice, so the manifest is never imported directly.
 */
export interface UseProjectsState {
  projects: Project[];
  loaded: boolean;
  error: string | null;
  mode: 'static' | 'local';
}

export function useProjects(): UseProjectsState {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  // A bundled vault returns one of two module constants verbatim, so the reference is stable
  // — putting it in a dependency array does not recompute on every render.
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
