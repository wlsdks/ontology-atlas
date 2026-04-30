'use client';

import type { ReactNode } from 'react';
import { useMemo, useSyncExternalStore } from 'react';
import { useGlobalAdmin } from '@/features/permissions';
import { PermissionFallback } from '@/features/permissions/ui/PermissionFallback';
import { useScopedAccountAccess } from '@/features/account-scope';
import {
  ACCOUNT_QUERY_KEY,
  normalizeAccountId,
} from '@/shared/lib/account-scope';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  deniedFallback?: ReactNode;
  loadingFallback?: ReactNode;
}

function subscribeUrlChange(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('popstate', onStoreChange);
  window.addEventListener('app:urlchange', onStoreChange);
  return () => {
    window.removeEventListener('popstate', onStoreChange);
    window.removeEventListener('app:urlchange', onStoreChange);
  };
}

function getSearchValue() {
  if (typeof window === 'undefined') return '';
  return window.location.search;
}

/**
 * Docs Vault 전용 가드 — PermissionGate 보다 완화. 읽기 전용 viewer 멤버도
 * 통과. 편집 UI 가 붙을 때 (추후) 별도 capability 로 admin/editor/owner
 * 만 가능하게 할 예정.
 *
 * 통과 조건 (OR):
 *  1. 글로벌 admin (화이트리스트)
 *  2. 자기 공간 (accountId 없거나 내 uid)
 *  3. 다른 공간이어도 membership 이 owner/editor/viewer — hasWorkspaceAccess
 */
export function DocsVaultAccessGuard({
  children,
  fallback,
  deniedFallback,
  loadingFallback,
}: Props) {
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

  if (
    status === 'loading' ||
    (accountId && scopedAccess.kind === 'loading')
  ) {
    return <>{loadingFallback ?? <PermissionFallback variant="loading" />}</>;
  }
  if (status === 'unauthenticated') {
    return (
      <>{fallback ?? <PermissionFallback variant="unauthenticated" />}</>
    );
  }
  if (status === 'authenticated') return <>{children}</>;

  // status === 'not-allowed' — membership 경로로 판정
  const myUid = user?.uid ?? null;
  const isOwnSpace =
    !accountId || (myUid !== null && accountId === myUid);
  if (isOwnSpace) return <>{children}</>;

  // 다른 공간: hasWorkspaceAccess (owner/editor/viewer 모두 true)
  if (scopedAccess.hasWorkspaceAccess) return <>{children}</>;

  return <>{deniedFallback ?? <PermissionFallback variant="denied" />}</>;
}
