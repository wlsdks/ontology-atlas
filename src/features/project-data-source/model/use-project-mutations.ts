'use client';

import { useCallback, useMemo } from 'react';
import { useDataSourceMode } from '@/entities/vault-session';
import { useLocalVault } from '@/entities/vault-session';
import {
  buildProjectMarkdown,
  buildStarterDisplaySync,
  findProjectVaultDoc,
  projectToFrontmatter,
} from '@/entities/docs-vault';
import type { ProjectInput } from '@/entities/project';
import type { DataSourceMode } from '@/shared/lib/vault-folder/data-source-mode';

export interface ProjectFrontmatterPatch {
  name?: string;
  displayName?: { locale: string; value: string };
  description?: string | null;
  owner?: string | null;
  tags?: string[] | null;
}

export interface ProjectMutations {
  createProject: (input: ProjectInput) => Promise<void>;
  updateProject: (input: ProjectInput) => Promise<void>;
  patchProject: (
    slug: string,
    patch: ProjectFrontmatterPatch,
  ) => Promise<void>;
  deleteProject: (slug: string) => Promise<void>;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  mode: DataSourceMode;
}

const NO_FOLDER_REJECTION =
  'Cannot change projects before a folder is open. Open a markdown folder first.';

/** Refusal while no folder is open, caught by `ProjectEditorPage` for localized copy; buttons are disabled up front. */
export class ProjectNoFolderError extends Error {
  constructor() {
    super(NO_FOLDER_REJECTION);
    this.name = 'ProjectNoFolderError';
  }
}

export function useProjectMutations(): ProjectMutations {
  const mode = useDataSourceMode();
  const vault = useLocalVault();

  const createProject = useCallback(
    async (input: ProjectInput) => {
      if (mode === 'no-folder') throw new ProjectNoFolderError();
      const existing = vault.manifest
        ? findProjectVaultDoc(vault.manifest, input.slug)
        : null;
      const slug = `projects/${input.slug}`;
      if (existing || vault.fileHandles.has(slug)) {
        throw new Error(`Project slug already exists: "${input.slug}"`);
      }
      const md = buildProjectMarkdown(input);
      await vault.createDoc(slug, md);
    },
    [mode, vault],
  );

  const updateProject = useCallback(
    async (input: ProjectInput) => {
      if (mode === 'no-folder') throw new ProjectNoFolderError();
      const existing = vault.manifest
        ? findProjectVaultDoc(vault.manifest, input.slug)
        : null;
      const slug = existing?.slug ?? `projects/${input.slug}`;
      if (!existing && !vault.fileHandles.has(slug)) {
        const md = buildProjectMarkdown(input);
        await vault.createDoc(slug, md);
        return;
      }
      const fm = projectToFrontmatter(input);
      // A full-form rename also refreshes a still-default display_<locale>.
      if (existing) {
        Object.assign(fm, buildStarterDisplaySync(existing.frontmatter, input.name));
      }
      // Keep the existing title-only key shape so no duplicate title/name pair appears.
      if (
        existing &&
        typeof existing.frontmatter.title === 'string' &&
        typeof existing.frontmatter.name !== 'string'
      ) {
        delete fm.name;
        fm.title = input.name;
      }
      const expectedMtime =
        existing?.mtime ??
        vault.manifest?.docs.find((doc) => doc.slug === slug)?.mtime;
      await vault.updateFrontmatter(slug, fm, { expectedMtime });
    },
    [mode, vault],
  );

  const patchProject = useCallback(
    async (slug: string, patch: ProjectFrontmatterPatch) => {
      if (mode === 'no-folder') throw new ProjectNoFolderError();
      const existing = vault.manifest
        ? findProjectVaultDoc(vault.manifest, slug)
        : null;
      if (!existing) {
        throw new Error(`Project not found: "${slug}"`);
      }

      const updates: Record<
        string,
        string | number | boolean | string[] | null
      > = {};
      if (patch.name !== undefined) {
      // A title-only project stays title-only on inline rename.
        const nameKey =
          typeof existing.frontmatter.name === 'string'
            ? 'name'
            : typeof existing.frontmatter.title === 'string'
              ? 'title'
              : 'name';
        updates[nameKey] = patch.name;
        Object.assign(updates, buildStarterDisplaySync(existing.frontmatter, patch.name));
      }
      if (patch.displayName !== undefined) {
        updates[`display_${patch.displayName.locale}`] = patch.displayName.value;
      }
      if (patch.description !== undefined) {
        updates.description = patch.description;
      }
      if (patch.owner !== undefined) {
        updates.owner = patch.owner;
      }
      if (patch.tags !== undefined) {
        updates.tags = patch.tags;
      }

      await vault.updateFrontmatter(existing.slug, updates, {
        expectedMtime: existing.mtime,
      });
    },
    [mode, vault],
  );

  const deleteProject = useCallback(
    async (slug: string) => {
      if (mode === 'no-folder') throw new ProjectNoFolderError();
      const existing = vault.manifest
        ? findProjectVaultDoc(vault.manifest, slug)
        : null;
      const path = existing?.slug ?? `projects/${slug}`;
      if (!vault.fileHandles.has(path)) return;
      await vault.deleteDoc(path);
    },
    [mode, vault],
  );

  const capabilities = useMemo(
    () => ({
      canCreate: mode !== 'no-folder',
      canEdit: mode !== 'no-folder',
      canDelete: mode !== 'no-folder',
    }),
    [mode],
  );

  return {
    createProject,
    updateProject,
    patchProject,
    deleteProject,
    ...capabilities,
    mode,
  };
}
