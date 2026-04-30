'use client';

import { useMemo } from 'react';
import { useScopedAccountAccess } from '@/features/account-scope';
import { normalizeAccountId } from '@/shared/lib/account-scope';
import { useGlobalAdmin } from './use-global-admin';

export type PermissionStatus = 'loading' | 'unauthenticated' | 'denied' | 'allowed';

export interface PermissionsState {
  status: PermissionStatus;
  user: { uid: string; email: string | null } | null;
  isGlobalAdmin: boolean;
  canEditAccount: boolean;
}

/**
 * "이 계정 안에서 사용자가 무엇을 할 수 있는가" 를 capability 로 surface 한다.
 * useGlobalAdmin + useScopedAccountAccess 를 묶어 컴포넌트가 직접 두 훅을
 * 합치지 않도록 한다.
 *
 * accountId 가 주어지면:
 * - 내 공간 (auth.uid == accountId) 이면 canEditAccount = true
 * - membership 의 canManage 가 true 이면 canEditAccount = true
 * - 전역 admin 이면 항상 canEditAccount = true
 */
export function usePermissions(accountId?: string | null): PermissionsState {
  const normalizedAccountId = normalizeAccountId(accountId);
  const { status: adminStatus, user } = useGlobalAdmin();
  const scopedAccess = useScopedAccountAccess(normalizedAccountId);

  return useMemo<PermissionsState>(() => {
    const isGlobalAdmin = adminStatus === 'authenticated';

    const status: PermissionStatus =
      adminStatus === 'loading' ||
      (normalizedAccountId !== null && scopedAccess.kind === 'loading')
        ? 'loading'
        : adminStatus === 'unauthenticated'
          ? 'unauthenticated'
          : 'allowed';

    const myUid = user?.uid ?? null;
    const isOwnSpace =
      !normalizedAccountId || (myUid !== null && normalizedAccountId === myUid);

    const canEditAccount =
      isGlobalAdmin || isOwnSpace || scopedAccess.canManage === true;

    const denied = status === 'allowed' && !canEditAccount;

    return {
      status: denied ? 'denied' : status,
      user: user
        ? { uid: user.uid, email: user.email ?? null }
        : null,
      isGlobalAdmin,
      canEditAccount,
    };
  }, [adminStatus, normalizedAccountId, scopedAccess.kind, scopedAccess.canManage, user]);
}
