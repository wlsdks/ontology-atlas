'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useGlobalAdmin } from '@/features/permissions';
import { useScopedAccountAccess } from '@/features/account-scope';
import {
  ACCOUNT_QUERY_KEY,
  normalizeAccountId,
} from '@/shared/lib/account-scope';

export interface DocsVaultCapabilities {
  /** 현재 유저가 vault 를 볼 수 있는지 — 가드 통과 전제하에 거의 항상 true. */
  canRead: boolean;
  /** 편집 UI 에 접근 가능한지 — 현재 MVP 엔 편집 UI 가 없지만 향후 대비. */
  canEdit: boolean;
  /** 공유 링크 생성 등 관리 행위 가능 여부 — admin/owner/editor. */
  canManage: boolean;
  /** 현재 역할 한글 라벨 ("전체 권한" / "주인" / "편집 가능" / "읽기 전용" 등). */
  roleLabel: string;
  /** kind — 'admin' | 'owner' | 'editor' | 'viewer' | 'member' | 'guest' | 'loading' */
  kind: string;
}

function subscribeUrlChange(onChange: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('popstate', onChange);
  window.addEventListener('app:urlchange', onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener('app:urlchange', onChange);
  };
}
function getSearchValue() {
  if (typeof window === 'undefined') return '';
  return window.location.search;
}

/** Docs Vault 에서 필요한 역할별 capability 를 한 번에 도출. */
export function useDocsVaultCapabilities(): DocsVaultCapabilities {
  const { status, user } = useGlobalAdmin();
  const search = useSyncExternalStore(
    subscribeUrlChange,
    getSearchValue,
    () => '',
  );
  const accountId = useMemo(
    () =>
      normalizeAccountId(new URLSearchParams(search).get(ACCOUNT_QUERY_KEY)),
    [search],
  );
  const scopedAccess = useScopedAccountAccess(accountId);

  return useMemo<DocsVaultCapabilities>(() => {
    if (status === 'loading' || scopedAccess.kind === 'loading') {
      return {
        canRead: false,
        canEdit: false,
        canManage: false,
        roleLabel: '확인 중',
        kind: 'loading',
      };
    }
    // 글로벌 admin 은 전부 가능
    if (status === 'authenticated') {
      return {
        canRead: true,
        canEdit: true,
        canManage: true,
        roleLabel: '전체 권한',
        kind: 'admin',
      };
    }
    // 자기 공간 이거나 membership 기반
    const myUid = user?.uid ?? null;
    const isOwnSpace =
      !accountId || (myUid !== null && accountId === myUid);
    if (isOwnSpace) {
      return {
        canRead: true,
        canEdit: true,
        canManage: true,
        roleLabel: '주인',
        kind: 'owner',
      };
    }
    return {
      canRead: scopedAccess.hasWorkspaceAccess,
      canEdit: scopedAccess.canEditDocuments,
      canManage: scopedAccess.canManage,
      roleLabel: scopedAccess.roleLabel,
      kind: scopedAccess.kind,
    };
  }, [status, user?.uid, accountId, scopedAccess]);
}
