'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { User } from 'firebase/auth';
import { useUserAuth } from '@/features/user-auth';

export type GlobalAdminStatus = 'loading' | 'unauthenticated' | 'not-allowed' | 'authenticated';

export interface GlobalAdminState {
  status: GlobalAdminStatus;
  user: User | null;
}

function subscribeNoop() {
  return () => {};
}

function useIsClient() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

/**
 * 현재 로그인 상태 + `admins/{email}` 화이트리스트 여부를 통합한 훅.
 *
 * 본 제품은 Notion/Obsidian 모델 — 자기 계정 안에서는 자기가 모든 작업의 주인이다.
 * "global admin" 은 시스템 전역 데이터(전역 카테고리/상태) 와 진단 도구 접근에만
 * 의미가 있다. 일상 사용에서 일반 사용자는 본인 계정 + 멤버십 공간에서 풀 컨트롤을
 * 가진다 (그 판정은 PermissionGate 가 own-space / membership 으로 처리).
 *
 * 상태:
 * - loading: 초기 확인 중
 * - unauthenticated: 로그인 안 함
 * - not-allowed: 로그인했지만 전역 admins 화이트리스트에 없음
 * - authenticated: 로그인 + 전역 admins 화이트리스트 통과
 */
export function useGlobalAdmin(): GlobalAdminState {
  const isClient = useIsClient();
  const userAuth = useUserAuth();
  const [firebaseState, setFirebaseState] = useState<GlobalAdminState>({
    status: 'loading',
    user: null,
  });

  useEffect(() => {
    if (!isClient) return;

    // Firebase Auth + Firestore SDK 는 dynamic import — 비-cloud 페이지의 첫
    // paint 청크에 firebase 가 들어가지 않게.
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    void Promise.all([
      import('firebase/auth'),
      import('@/shared/api'),
      import('@/entities/admin/api'),
    ]).then(([{ onAuthStateChanged }, { getFirebaseAuth }, { isAdmin }]) => {
      if (cancelled) return;
      const auth = getFirebaseAuth();
      unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (!user) {
          setFirebaseState({ status: 'unauthenticated', user: null });
          return;
        }
        const allowed = await isAdmin(user.email);
        setFirebaseState({
          status: allowed ? 'authenticated' : 'not-allowed',
          user,
        });
      });
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [isClient]);

  if (!isClient) {
    return { status: 'loading', user: null };
  }

  // demo / IAM 세션 사용자: Firebase 가 인지하지 않으므로 useUserAuth 가 유일한
  // 정답. status 'not-allowed' 로 surface 해 PermissionGate 의 own-space 분기로
  // 자기 공간 (membership owner) 인 한 자동 통과시킨다.
  if (userAuth.user && userAuth.user.provider !== 'firebase') {
    const sessionUserAsFirebaseUser = {
      uid: userAuth.user.uid,
      email: userAuth.user.email,
      displayName: userAuth.user.displayName,
    } as unknown as User;
    return { status: 'not-allowed', user: sessionUserAsFirebaseUser };
  }

  return firebaseState;
}
