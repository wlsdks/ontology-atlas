"use client";

import { useMemo } from "react";
import { useUserAuth } from "@/features/user-auth";
import {
  type ScopedAccountAccess,
} from "./account-access";

export interface UseScopedAccountAccessResult extends ScopedAccountAccess {
  membership: null;
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
  } | null;
}

/**
 * Single-user 모드 — 워크스페이스 권한 모델이 단순화돼 로그인된 사용자는
 * 항상 "주인" 으로 모든 작업 가능하다. multi-account / membership 모델은
 * v2 협업 단계에서 다시 도입.
 *
 * 로그인 안 한 사용자는 게스트 — local-first 흐름에서 폴더 선택만으로
 * 사용 가능하지만, 서버와 동기화하는 액션 (publish 등) 은 로그인 후에만.
 */
export function useScopedAccountAccess(): UseScopedAccountAccessResult {
  const { status, user } = useUserAuth();

  return useMemo<UseScopedAccountAccessResult>(() => {
    const profile = user
      ? { uid: user.uid, email: user.email, displayName: user.displayName }
      : null;

    if (status === "loading") {
      return {
        kind: "loading",
        canManage: false,
        canEditProject: false,
        canEditDocuments: false,
        canReviewAndPublish: false,
        hasWorkspaceAccess: false,
        roleLabel: "확인 중",
        description: "지금 어떤 작업을 할 수 있는지 확인하고 있습니다.",
        membership: null,
        user: profile,
      };
    }

    if (!user) {
      return {
        kind: "guest",
        canManage: false,
        canEditProject: false,
        canEditDocuments: false,
        canReviewAndPublish: false,
        hasWorkspaceAccess: true,
        roleLabel: "로컬",
        description:
          "로컬 vault 는 자유롭게 사용할 수 있고, cloud 동기화는 로그인 후 가능합니다.",
        membership: null,
        user: null,
      };
    }

    return {
      kind: "owner",
      canManage: true,
      canEditProject: true,
      canEditDocuments: true,
      canReviewAndPublish: true,
      hasWorkspaceAccess: true,
      roleLabel: "주인",
      description: "이 공간의 주인으로 모든 작업을 직접 수행합니다.",
      membership: null,
      user: profile,
    };
  }, [status, user]);
}
