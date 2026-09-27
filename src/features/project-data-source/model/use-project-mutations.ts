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

export interface ProjectFrontmatterPatch {
  name?: string;
  /** One `display_<locale>` key: the word a screen in that locale draws for the project. */
  displayName?: { locale: string; value: string };
  description?: string | null;
  owner?: string | null;
  tags?: string[] | null;
}

/** Project mutations: local mode writes `projects/<slug>.md`; static mode rejects every mutation. */
export interface ProjectMutations {
  /** Creates a project. Throws when the same slug already exists. */
  createProject: (input: ProjectInput) => Promise<void>;
  /** Updates an existing project (upsert). Creates when the slug is missing, though that is discouraged. */
  updateProject: (input: ProjectInput) => Promise<void>;
  /** Detail and quick edit: updates while preserving only the frontmatter keys the user touched. */
  patchProject: (
    slug: string,
    patch: ProjectFrontmatterPatch,
  ) => Promise<void>;
  /** A no-op when the slug does not exist. */
  deleteProject: (slug: string) => Promise<void>;
  /** The up-front gate for UI — whether mutation is possible in the current mode. */
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** For debugging and gate messages. */
  mode: 'static' | 'local';
}

const STATIC_REJECTION =
  'Cannot mutate projects in static demo mode. Open a markdown folder first.';

/** Static-mode rejection, caught by `ProjectEditorPage` for localized copy; buttons are disabled up front. */
export class ProjectStaticModeError extends Error {
  constructor() {
    super(STATIC_REJECTION);
    this.name = 'ProjectStaticModeError';
  }
}

export function useProjectMutations(): ProjectMutations {
  const mode = useDataSourceMode();
  const vault = useLocalVault();

  const createProject = useCallback(
    async (input: ProjectInput) => {
      if (mode === 'static') throw new ProjectStaticModeError();
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
      if (mode === 'static') throw new ProjectStaticModeError();
      const existing = vault.manifest
        ? findProjectVaultDoc(vault.manifest, input.slug)
        : null;
      const slug = existing?.slug ?? `projects/${input.slug}`;
      // Upsert: create when missing.
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
      if (mode === 'static') throw new ProjectStaticModeError();
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
        // Carry the rename into display names still at their starter default.
        Object.assign(updates, buildStarterDisplaySync(existing.frontmatter, patch.name));
      }
      if (patch.displayName !== undefined) {
        // On a locale with a display name, the heading edits that display key.
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
      if (mode === 'static') throw new ProjectStaticModeError();
      const existing = vault.manifest
        ? findProjectVaultDoc(vault.manifest, slug)
        : null;
      const path = existing?.slug ?? `projects/${slug}`;
      if (!vault.fileHandles.has(path)) return; // no-op
      await vault.deleteDoc(path);
    },
    [mode, vault],
  );

  const capabilities = useMemo(
    () => ({
      canCreate: mode !== 'static',
      canEdit: mode !== 'static',
      canDelete: mode !== 'static',
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
