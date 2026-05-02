"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
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
 *
 * Round 4 polish: roleLabel / description 이 t() 에서 와 locale 인식.
 * 이전엔 Korean hardcode 라 /en/ 진입에도 "로컬" / "주인" 으로 노출.
 */
export function useScopedAccountAccess(): UseScopedAccountAccessResult {
  const { status, user } = useUserAuth();
  const t = useTranslations("featuresMisc.accountScope");

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
        roleLabel: t("loadingRole"),
        description: t("loadingDescription"),
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
        roleLabel: t("guestRole"),
        description: t("guestDescription"),
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
      roleLabel: t("ownerRole"),
      description: t("ownerDescription"),
      membership: null,
      user: profile,
    };
  }, [status, user, t]);
}
