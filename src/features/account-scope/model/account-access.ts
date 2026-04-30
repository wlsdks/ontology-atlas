import type { AccountRole } from "@/entities/account";

export type ScopedAccountAccessKind =
  | "loading"
  | "guest"
  | "member"
  | "viewer"
  | "editor"
  | "owner"
  | "admin";

export interface ResolveScopedAccountAccessInput {
  loading: boolean;
  isSignedIn: boolean;
  isAdmin: boolean;
  accountId?: string | null;
  membershipRole?: AccountRole | null;
}

export interface ScopedAccountAccess {
  kind: ScopedAccountAccessKind;
  canManage: boolean;
  canEditProject: boolean;
  canEditDocuments: boolean;
  canReviewAndPublish: boolean;
  hasWorkspaceAccess: boolean;
  roleLabel: string;
  description: string;
}

export function resolveScopedAccountAccess(
  input: ResolveScopedAccountAccessInput,
): ScopedAccountAccess {
  const { loading, isSignedIn, isAdmin, accountId, membershipRole } = input;

  if (loading) {
    return {
      kind: "loading",
      canManage: false,
      canEditProject: false,
      canEditDocuments: false,
      canReviewAndPublish: false,
      hasWorkspaceAccess: false,
      roleLabel: "확인 중",
      description: "이 공간에서 어떤 작업을 할 수 있는지 확인하고 있습니다.",
    };
  }

  if (isAdmin) {
    return {
      kind: "admin",
      canManage: true,
      canEditProject: true,
      canEditDocuments: true,
      canReviewAndPublish: true,
      hasWorkspaceAccess: true,
      roleLabel: "전체 권한",
      description:
        "knowledge publish 등 전역 연산까지 직접 가능한 계정입니다.",
    };
  }

  if (!isSignedIn) {
    return {
      kind: "guest",
      canManage: false,
      canEditProject: false,
      canEditDocuments: false,
      canReviewAndPublish: false,
      hasWorkspaceAccess: false,
      roleLabel: "게스트",
      description:
        "링크로 들어와 읽을 수 있는 상태입니다. 수정하려면 로그인과 권한이 필요합니다.",
    };
  }

  if (!accountId) {
    return {
      kind: "member",
      canManage: false,
      canEditProject: false,
      canEditDocuments: false,
      canReviewAndPublish: false,
      hasWorkspaceAccess: false,
      roleLabel: "회원",
      description:
        "로그인된 사용자입니다. 편집 권한이 있는 작업 공간에서만 바로 수정할 수 있습니다.",
    };
  }

  if (membershipRole === "owner") {
    return {
      kind: "owner",
      canManage: true,
      canEditProject: true,
      canEditDocuments: true,
      canReviewAndPublish: true,
      hasWorkspaceAccess: true,
      roleLabel: "주인",
      description:
        "이 공간의 주인으로 프로젝트와 문서를 바로 수정하고 반영할 수 있습니다.",
    };
  }

  if (membershipRole === "editor") {
    return {
      kind: "editor",
      canManage: true,
      canEditProject: true,
      canEditDocuments: true,
      canReviewAndPublish: true,
      hasWorkspaceAccess: true,
      roleLabel: "편집 가능",
      description:
        "이 공간의 편집 권한이 있어 공개 화면에서 바로 수정과 검토를 진행할 수 있습니다.",
    };
  }

  if (membershipRole === "viewer") {
    return {
      kind: "viewer",
      canManage: false,
      canEditProject: false,
      canEditDocuments: false,
      canReviewAndPublish: false,
      hasWorkspaceAccess: true,
      roleLabel: "읽기 전용",
      description:
        "이 공간을 읽을 수 있지만 수정과 반영은 할 수 없는 상태입니다.",
    };
  }

  return {
    kind: "member",
    canManage: false,
    canEditProject: false,
    canEditDocuments: false,
    canReviewAndPublish: false,
    hasWorkspaceAccess: false,
    roleLabel: "회원",
    description:
      "로그인된 사용자이지만 이 공간의 편집 권한은 아직 없습니다.",
  };
}
