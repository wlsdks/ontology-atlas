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
 * mode 별로 분기되는 project mutation hook. 2 모드:
 *
 * - **local**: vault `projects/<slug>.md` 를 직접 read/write/delete. 사용자
 *   디스크가 진실원. 충돌 검사는 manifest 의 fileHandles 에서 hit 여부.
 * - **static**: 모든 mutation 거절 — read-only dogfood manifest.
 *
 * 호출자 (QuickCreate / QuickEdit / 인라인 편집) 가 모드 인지 없이 같은
 * 시그니처로 호출 가능. canCreate / canEdit / canDelete 는 사전 게이트
 * (UI disable 처리).
 */
export interface ProjectMutations {
  /** 신규 프로젝트 생성. 동일 slug 가 이미 있으면 throw. */
  createProject: (input: ProjectInput) => Promise<void>;
  /** 기존 프로젝트 갱신 (upsert). slug 가 없으면 새로 만들지만 권장하지 않음. */
  updateProject: (input: ProjectInput) => Promise<void>;
  /** 상세/빠른 편집이 사용자가 만진 frontmatter key만 보존 갱신. */
  patchProject: (
    slug: string,
    patch: ProjectFrontmatterPatch,
  ) => Promise<void>;
  /** slug 로 삭제. 존재 안 하면 no-op. */
  deleteProject: (slug: string) => Promise<void>;
  /** UI 사전 게이트용 — 현재 모드에서 mutation 가능 여부. */
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** 디버그 / 게이트 메시지용. */
  mode: 'static' | 'local';
}

const STATIC_REJECTION =
  'Cannot mutate projects in static demo mode. Open a markdown folder first.';

/**
 * [P-3] static(샘플) 모드에서 mutation 이 거절됐음을 나타내는 typed error.
 * 호출자(ProjectEditorPage)가 이 타입으로 잡아 ko/en i18n 메시지로 치환한다
 * — plain Error(STATIC_REJECTION) 를 그대로 노출하면 영어 raw 문구가 사용자
 * 에게 보인다. 버튼이 사전에 disabled 되므로 정상 흐름에서는 도달하지
 * 않아야 하는 방어 경로.
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
      // 존재 여부 — 없으면 새로 만든다 (upsert 시그니처).
      if (!existing && !vault.fileHandles.has(slug)) {
        const md = buildProjectMarkdown(input);
        await vault.createDoc(slug, md);
        return;
      }
      // frontmatter patch — body 는 그대로 둔다.
      const fm = projectToFrontmatter(input);
      // C6 — same starter-display sync as inline rename: full-form saves that
      // change the name must also refresh a still-default display_<locale>.
      if (existing) {
        Object.assign(fm, buildStarterDisplaySync(existing.frontmatter, input.name));
      }
      // path-agnostic starter/외부 vault는 project 이름을 title로만 쓰기도 한다.
      // full edit도 inline patch와 같은 key-shape를 보존해 title/name 중복을
      // 만들지 않는다. 신규 문서는 canonical name을 계속 사용한다.
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
        // 외부/초기 vault의 kind:project는 title만 쓰기도 한다. 인라인 rename이
        // name을 겹쳐 만들면 사람에게 서로 다른 두 이름이 남으므로 원형 유지.
        const nameKey =
          typeof existing.frontmatter.name === 'string'
            ? 'name'
            : typeof existing.frontmatter.title === 'string'
              ? 'title'
              : 'name';
        updates[nameKey] = patch.name;
        // C6 — carry the rename into any `display_<locale>` still at its starter
        // default so the ko/en map + INDEX don't keep showing "내 프로젝트" /
        // "My project" after the project is renamed. Customized display names
        // are left untouched.
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
