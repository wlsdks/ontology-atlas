'use client';

import { useCallback, useMemo } from 'react';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import {
  buildProjectMarkdown,
  projectToFrontmatter,
} from '@/entities/docs-vault';
import type { ProjectInput } from '@/entities/project';

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

export function useProjectMutations(): ProjectMutations {
  const mode = useDataSourceMode();
  const vault = useLocalVault();

  const createProject = useCallback(
    async (input: ProjectInput) => {
      if (mode === 'static') throw new Error(STATIC_REJECTION);
      const slug = `projects/${input.slug}`;
      if (vault.fileHandles.has(slug)) {
        throw new Error(`Project slug already exists: "${input.slug}"`);
      }
      const md = buildProjectMarkdown(input);
      await vault.createDoc(slug, md);
    },
    [mode, vault],
  );

  const updateProject = useCallback(
    async (input: ProjectInput) => {
      if (mode === 'static') throw new Error(STATIC_REJECTION);
      const slug = `projects/${input.slug}`;
      // 존재 여부 — 없으면 새로 만든다 (upsert 시그니처).
      if (!vault.fileHandles.has(slug)) {
        const md = buildProjectMarkdown(input);
        await vault.createDoc(slug, md);
        return;
      }
      // frontmatter patch — body 는 그대로 둔다.
      const fm = projectToFrontmatter(input);
      await vault.updateFrontmatter(slug, fm);
    },
    [mode, vault],
  );

  const deleteProject = useCallback(
    async (slug: string) => {
      if (mode === 'static') throw new Error(STATIC_REJECTION);
      const path = `projects/${slug}`;
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
    deleteProject,
    ...capabilities,
    mode,
  };
}
