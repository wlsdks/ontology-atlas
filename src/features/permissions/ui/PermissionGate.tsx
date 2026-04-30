'use client';

import type { ReactNode } from 'react';
import { useMemo, useSyncExternalStore } from 'react';
import { useScopedAccountAccess } from '@/features/account-scope';
import { ACCOUNT_QUERY_KEY, normalizeAccountId } from '@/shared/lib/account-scope';
import { useGlobalAdmin } from '../model/use-global-admin';
import { PermissionFallback } from './PermissionFallback';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  deniedFallback?: ReactNode;
  loadingFallback?: ReactNode;
}

function subscribeUrlChange(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

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
 * 권한 게이트. 자식을 렌더하려면 로그인된 사용자이고, 이 공간에 대해 편집
 * 권한이 있어야 한다.
 *
 * 통과 조건 (OR):
 *  1. URL 에 accountId 가 없거나 accountId == 내 uid → "내 공간" 통과
 *  2. accountId 가 다른 공간이라도 membership 이 owner/editor → 통과
 *  3. 전역 admins 화이트리스트 (knowledge publish 등 시스템 연산용) → 통과
 *
 * - loading: `loadingFallback`
 * - unauthenticated: `fallback` (로그인 안내)
 * - 권한 없음: `deniedFallback`
 */
export function PermissionGate({
  children,
  fallback,
  deniedFallback,
  loadingFallback,
}: Props) {
  const { status, user } = useGlobalAdmin();
  const search = useSyncExternalStore(subscribeUrlChange, getSearchValue, () => '');
  const accountId = useMemo(
    () => normalizeAccountId(new URLSearchParams(search).get(ACCOUNT_QUERY_KEY)),
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
    return <>{fallback ?? <PermissionFallback variant="unauthenticated" />}</>;
  }

  // 전역 admin 은 모든 공간에서 통과.
  if (status === 'authenticated') {
    return <>{children}</>;
  }

  // 여기부턴 status === 'not-allowed' (로그인됐지만 전역 admin 아님).
  // 자기 공간은 무조건 통과 — accountId 생략 또는 내 uid 와 일치.
  const myUid = user?.uid ?? null;
  const isOwnSpace = !accountId || (myUid !== null && accountId === myUid);
  if (isOwnSpace) {
    return <>{children}</>;
  }

  // 다른 공간은 membership 기반 canManage 로 판정.
  if (scopedAccess.canManage) {
    return <>{children}</>;
  }

  return <>{deniedFallback ?? <PermissionFallback variant="denied" />}</>;
}
