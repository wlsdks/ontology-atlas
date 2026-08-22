'use client';

import { useCallback, useMemo } from 'react';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import {
  buildProjectMarkdown,
  buildStarterDisplaySync,
  findProjectVaultDoc,
  projectToFrontmatter,
} from '@/entities/docs-vault';
import type { ProjectInput } from '@/entities/project';

export interface ProjectFrontmatterPatch {
  name?: string;
  description?: string | null;
  owner?: string | null;
  tags?: string[] | null;
}

/**
 * Project mutation hook, branching on mode:
 *
 * - **local**: reads, writes, and deletes vault `projects/<slug>.md` directly. The
 *   user's disk is the source of truth, and collision checks hit the manifest's
 *   `fileHandles`.
 * - **static**: rejects every mutation — the dogfood manifest is read-only.
 *
 * Callers (quick create, quick edit, inline editing) use one signature without knowing
 * the mode. `canCreate` / `canEdit` / `canDelete` are the up-front gate for disabling UI.
 */
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
  /** Deletes by slug. A no-op when it does not exist. */
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

/**
 * A typed error signalling that a mutation was rejected in static (sample) mode. The
 * caller (`ProjectEditorPage`) catches this type and substitutes a localized message —
 * exposing a plain `Error(STATIC_REJECTION)` would show the user raw English. Buttons are
 * disabled up front, so this is a defensive path the normal flow should never reach.
 */
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
      // Whether it exists — create it if not (the upsert signature).
      if (!existing && !vault.fileHandles.has(slug)) {
        const md = buildProjectMarkdown(input);
        await vault.createDoc(slug, md);
        return;
      }
      // Patch the frontmatter and leave the body alone.
      const fm = projectToFrontmatter(input);
      // C6 — same starter-display sync as inline rename: full-form saves that
      // change the name must also refresh a still-default display_<locale>.
      if (existing) {
        Object.assign(fm, buildStarterDisplaySync(existing.frontmatter, input.name));
      }
      // A path-agnostic starter or an external vault sometimes carries the project name
      // as `title` only. Full edit preserves the same key shape as an inline patch so it
      // never creates a duplicate title/name pair. New documents keep using the canonical name.
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
      // An external or initial vault's `kind: project` sometimes uses `title` only. An
      // inline rename that also creates `name` would leave a person with two different
      // names, so the original shape is preserved.
        const nameKey =
          typeof existing.frontmatter.name === 'string'
            ? 'name'
            : typeof existing.frontmatter.title === 'string'
              ? 'title'
              : 'name';
        updates[nameKey] = patch.name;
        // Carry the rename into any `display_<locale>` still at its starter default, so
        // the ko/en map and INDEX do not keep showing the starter name after the project
        // is renamed. Customized display names are left untouched.
        Object.assign(updates, buildStarterDisplaySync(existing.frontmatter, patch.name));
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
