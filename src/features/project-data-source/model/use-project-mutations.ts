'use client';

import { useCallback, useMemo } from 'react';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import {
  buildProjectMarkdown,
  projectToFrontmatter,
} from '@/entities/docs-vault';
import type { ProjectInput } from '@/entities/project';

// Cloud entity api 는 cloud-mode 분기에서만 호출된다. dynamic import 로
// 분리해 local-first 페이지 (ProjectSelectorPage 등) 의 정적 청크에 firebase
// 가 박히는 것을 막는다.
async function loadCloudProjectApi() {
  const mod = await import('@/entities/project/api');
  return {
    cloudDeleteProject: mod.deleteProject,
    cloudUpsertProject: mod.upsertProject,
    getProject: mod.getProject,
  };
}

/**
 * mode 별로 분기되는 project mutation hook.
 *
 * - **local**: vault `projects/<slug>.md` 를 직접 read/write/delete. 로그인
 *   필요 없음 (사용자 디스크가 진실원). 충돌 검사는 manifest 의 fileHandles
 *   에서 hit 여부.
 * - **cloud**: 기존 entity API (Firestore). Firebase Auth 로그인 필요.
 * - **static**: 모든 mutation 거절 — read-only 정적 manifest 모드.
 *
 * 호출자 (QuickCreate / QuickEdit / ProjectEditor) 가 모드 인지 없이 같은
 * 시그니처로 호출 가능. canCreate / canEdit / canDelete 가 사전 게이트
 * 의도를 노출 (UI 가 disable 처리).
 */
export interface ProjectMutations {
  /** 신규 프로젝트 생성. 동일 slug 가 이미 있으면 throw. */
  createProject: (input: ProjectInput) => Promise<void>;
  /** 기존 프로젝트 갱신 (upsert). slug 가 없으면 새로 만들지만 권장하지 않음. */
  updateProject: (input: ProjectInput) => Promise<void>;
  /** slug 로 삭제. 존재 안 하면 no-op (모드별 entity 동작 따름). */
  deleteProject: (slug: string) => Promise<void>;
  /** UI 사전 게이트용 — 현재 모드에서 mutation 가능 여부. */
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** 디버그 / 게이트 메시지용. */
  mode: 'static' | 'local' | 'cloud';
}

const STATIC_REJECTION = '정적 데모 모드에서는 프로젝트 변경이 불가합니다. 폴더 열기 또는 로그인 후 다시 시도해주세요.';

export function useProjectMutations(): ProjectMutations {
  const mode = useDataSourceMode();
  const vault = useLocalVault();

  const createProject = useCallback(
    async (input: ProjectInput) => {
      if (mode === 'static') throw new Error(STATIC_REJECTION);
      if (mode === 'local') {
        const slug = `projects/${input.slug}`;
        if (vault.fileHandles.has(slug)) {
          throw new Error('이미 존재하는 slug입니다.');
        }
        const md = buildProjectMarkdown(input);
        await vault.createDoc(slug, md);
        return;
      }
      // cloud
      const { getProject, cloudUpsertProject } = await loadCloudProjectApi();
      const existing = await getProject(input.slug, input.accountId);
      if (existing) throw new Error('이미 존재하는 slug입니다.');
      await cloudUpsertProject(input);
    },
    [mode, vault],
  );

  const updateProject = useCallback(
    async (input: ProjectInput) => {
      if (mode === 'static') throw new Error(STATIC_REJECTION);
      if (mode === 'local') {
        const slug = `projects/${input.slug}`;
        // 존재 여부 — 없으면 새로 만든다 (upsert 시그니처).
        if (!vault.fileHandles.has(slug)) {
          const md = buildProjectMarkdown(input);
          await vault.createDoc(slug, md);
          return;
        }
        // frontmatter patch — body 는 그대로 둔다.
        const fm = projectToFrontmatter(input);
        // updateFrontmatter 는 string|number|boolean|string[]|null 만 받음 — 매핑 통과.
        await vault.updateFrontmatter(slug, fm);
        return;
      }
      // cloud
      const { cloudUpsertProject } = await loadCloudProjectApi();
      await cloudUpsertProject(input);
    },
    [mode, vault],
  );

  const deleteProject = useCallback(
    async (slug: string) => {
      if (mode === 'static') throw new Error(STATIC_REJECTION);
      if (mode === 'local') {
        const path = `projects/${slug}`;
        if (!vault.fileHandles.has(path)) return; // no-op
        await vault.deleteDoc(path);
        return;
      }
      // cloud — entity 가 accountId optional, 호출자 책임이 단일 단순 케이스.
      const { cloudDeleteProject } = await loadCloudProjectApi();
      await cloudDeleteProject(slug);
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
